import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { createServerSupabaseClient } from "@/server/supabase-server";
import type { ClientPresence, JoinedRoom, MasterPatch, PlaybackState, RichTextSpan, Role, RoomConfig, RoomSnapshot, ScriptBlock, ScriptDocument, Signal } from "@/types/teleprompter";

type SessionClaims = {
    roomId: string;
    role: Role;
    clientId: string;
};

type InviteClaims = {
    roomId: string;
    role: Role;
    purpose: "room-invite";
};

type RoomRow = {
    id: string;
    code: string;
    name: string;
    master_pin_hash: string;
    follower_pin_hash: string;
    producer_pin_hash: string;
    host_pin_hash: string;
    viewer_pin_hash: string;
    active_master_client_id: string | null;
    active_host_client_id: string | null;
    realtime_topic_secret: string;
    last_state: PlaybackState;
};

type ScriptRow = {
    content: string;
    format: "text" | "markdown" | "blocks-v1";
    updated_at: string;
    content_version: number;
};

type ScriptBlockRow = {
    id: string;
    title: string;
    content: {
        spans?: RichTextSpan[];
    };
};

type ConfigRow = {
    font_size: number;
    line_height: number | string;
    margin_percent: number;
    guide_position: number;
    default_speed: number | string;
    theme: { mode?: "dark" | "dim" };
};

type SignalRow = {
    id: string;
    type: Signal["type"];
    value: string | null;
    expires_at: string | null;
    created_at: string;
};

type PresenceRow = {
    client_id: string;
    role: Role;
    display_name: string;
    joined_at: string;
};

const defaultScript = `**ROXOM.TV MARKET UPDATE**

[STANDBY]

Bitcoin holds key levels as markets wait for the next macro print.

[VTR: BTC daily chart]

Hosts should keep the intro tight and leave room for guest reaction.

---

[PAUSA]

Coming up next: flows, miners, and the live desk read.`;

export async function createRoom(name: string, producerPin: string, hostPin: string, viewerPin: string): Promise<RoomSnapshot> {
    const supabase = createServerSupabaseClient();
    const now = new Date().toISOString();
    const lastState = createDefaultPlayback(now);
    const producerPinHash = hashPin(producerPin);
    const hostPinHash = hashPin(hostPin);
    const viewerPinHash = hashPin(viewerPin);
    const roomInsert = {
        code: await createRoomCode(),
        name,
        master_pin_hash: producerPinHash,
        follower_pin_hash: viewerPinHash,
        producer_pin_hash: producerPinHash,
        host_pin_hash: hostPinHash,
        viewer_pin_hash: viewerPinHash,
        realtime_topic_secret: randomBytes(18).toString("base64url"),
        last_state: lastState
    };

    const { data: room, error: roomError } = await supabase.from("rooms").insert(roomInsert).select("*").single<RoomRow>();

    if (roomError) {
        throw new Error(roomError.message);
    }

    const scriptInsert = {
        room_id: room.id,
        content: defaultScript,
        format: "blocks-v1",
        content_version: 1
    };
    const blockInsert = {
        room_id: room.id,
        position: 0,
        title: "Market Update",
        content: createRichTextContent(defaultScript)
    };
    const configInsert = {
        room_id: room.id,
        font_size: 56,
        line_height: 1.45,
        margin_percent: 14,
        guide_position: 33,
        default_speed: 2,
        theme: { mode: "dark" }
    };

    const [{ error: scriptError }, { error: blockError }, { error: configError }] = await Promise.all([
        supabase.from("scripts").insert(scriptInsert),
        supabase.from("script_blocks").insert(blockInsert),
        supabase.from("room_config").insert(configInsert)
    ]);

    if (scriptError || blockError || configError) {
        throw new Error(scriptError?.message ?? blockError?.message ?? configError?.message ?? "Failed to initialize room.");
    }

    return readSnapshot(room.id);
}

export async function joinRoom(code: string, role: Role, credentials: { pin?: string; inviteToken?: string }, displayName: string, clientId: string): Promise<JoinedRoom | null> {
    const supabase = createServerSupabaseClient();
    const room = await findRoomByCode(code);

    if (!room) {
        return null;
    }

    const expectedHash = getPinHashForRole(room, role);
    const validPin = credentials.pin ? verifyPin(credentials.pin, expectedHash) : false;
    const validInvite = credentials.inviteToken ? verifyInviteToken(credentials.inviteToken, room.id, role) : false;

    if (!validPin && !validInvite) {
        return null;
    }

    const now = new Date().toISOString();

    if (role === "host") {
        const nextState: PlaybackState = {
            ...room.last_state,
            masterClientId: clientId,
            updatedAt: now
        };
        const { error } = await supabase
            .from("rooms")
            .update({ active_host_client_id: clientId, active_master_client_id: clientId, last_state: nextState, updated_at: now })
            .eq("id", room.id);

        if (error) {
            throw new Error(error.message);
        }
    }

    const { error: presenceError } = await supabase.from("room_presence").upsert({
        room_id: room.id,
        client_id: clientId,
        role,
        display_name: displayName,
        last_seen_at: now
    });

    if (presenceError) {
        throw new Error(presenceError.message);
    }

    return {
        snapshot: await readSnapshot(room.id),
        token: signToken({ roomId: room.id, role, clientId }),
        realtimeTopic: createRealtimeTopic(room.id, room.realtime_topic_secret),
        inviteTokens: role === "producer" ? createInviteTokens(room.id) : undefined
    };
}

export async function getRoomSnapshot(code: string, token: string | null): Promise<RoomSnapshot | null> {
    const claims = token ? verifyToken(token) : null;
    const room = await findRoomByCode(code);

    if (!claims || !room || claims.roomId !== room.id) {
        return null;
    }

    return readSnapshot(room.id);
}

export async function applyMasterPatch(token: string, patch: MasterPatch): Promise<JoinedRoom | null> {
    const claims = verifyToken(token);

    if (!claims || claims.role === "viewer") {
        return null;
    }

    const supabase = createServerSupabaseClient();
    const { data: room, error: roomError } = await supabase.from("rooms").select("*").eq("id", claims.roomId).single<RoomRow>();

    if (roomError || !room) {
        return null;
    }

    const now = new Date().toISOString();

    if (typeof patch.script === "string") {
        if (claims.role !== "producer") {
            return null;
        }

        const current = await readScript(room.id);
        const blocks = createBlocksFromImportedText(patch.script);
        const { error } = await supabase
            .from("scripts")
            .update({ content: flattenScriptBlocks(blocks), format: "blocks-v1", content_version: current.contentVersion + 1, updated_at: now })
            .eq("room_id", room.id);

        if (error) {
            throw new Error(error.message);
        }

        await replaceScriptBlocks(room.id, blocks, now);
    }

    if (patch.scriptBlocks) {
        if (claims.role !== "producer") {
            return null;
        }

        const current = await readScript(room.id);
        const blocks = normalizeScriptBlocks(patch.scriptBlocks);
        const { error } = await supabase
            .from("scripts")
            .update({ content: flattenScriptBlocks(blocks), format: "blocks-v1", content_version: current.contentVersion + 1, updated_at: now })
            .eq("room_id", room.id);

        if (error) {
            throw new Error(error.message);
        }

        await replaceScriptBlocks(room.id, blocks, now);
    }

    if (patch.config) {
        if (!canPatchConfig(claims, room, patch.config)) {
            return null;
        }

        const update = mapConfigUpdate(patch.config, now);
        const { error } = await supabase.from("room_config").update(update).eq("room_id", room.id);

        if (error) {
            throw new Error(error.message);
        }
    }

    if (patch.playback) {
        if (claims.role !== "host" || room.active_host_client_id !== claims.clientId) {
            return null;
        }

        const lastState = room.last_state;
        const nextState: PlaybackState = {
            ...lastState,
            ...patch.playback,
            sequence: lastState.sequence + 1,
            updatedAt: now,
            masterClientId: claims.clientId
        };
        const { error } = await supabase.from("rooms").update({ last_state: nextState, updated_at: now }).eq("id", room.id);

        if (error) {
            throw new Error(error.message);
        }
    }

    if (patch.signal) {
        if (claims.role !== "producer") {
            return null;
        }

        const { error } = await supabase.from("signals").insert({
            room_id: room.id,
            type: patch.signal.type,
            value: patch.signal.value,
            expires_at: patch.signal.expiresAt
        });

        if (error) {
            throw new Error(error.message);
        }
    }

    if (patch.clearSignal) {
        if (claims.role !== "producer") {
            return null;
        }

        const { error } = await supabase.from("signals").update({ cleared_at: now }).eq("room_id", room.id).is("cleared_at", null);

        if (error) {
            throw new Error(error.message);
        }
    }

    return {
        snapshot: await readSnapshot(room.id),
        token,
        realtimeTopic: createRealtimeTopic(room.id, room.realtime_topic_secret)
    };
}

async function readSnapshot(roomId: string): Promise<RoomSnapshot> {
    const supabase = createServerSupabaseClient();
    const [{ data: room, error: roomError }, script, config, signal, followers] = await Promise.all([
        supabase.from("rooms").select("*").eq("id", roomId).single<RoomRow>(),
        readScript(roomId),
        readConfig(roomId),
        readActiveSignal(roomId),
        readFollowers(roomId)
    ]);

    if (roomError || !room) {
        throw new Error(roomError?.message ?? "Room not found.");
    }

    return {
        id: room.id,
        code: room.code,
        name: room.name,
        activeHostClientId: room.active_host_client_id ?? room.active_master_client_id,
        lastState: room.last_state,
        script,
        config,
        activeSignal: signal,
        followers
    };
}

async function readScript(roomId: string): Promise<ScriptDocument> {
    const supabase = createServerSupabaseClient();
    const [{ data, error }, blocks] = await Promise.all([
        supabase.from("scripts").select("*").eq("room_id", roomId).single<ScriptRow>(),
        readScriptBlocks(roomId)
    ]);

    if (error || !data) {
        throw new Error(error?.message ?? "Script not found.");
    }

    const scriptBlocks = blocks.length > 0 ? blocks : createBlocksFromImportedText(data.content);

    return {
        content: flattenScriptBlocks(scriptBlocks),
        format: blocks.length > 0 ? "blocks-v1" : data.format,
        updatedAt: data.updated_at,
        contentVersion: data.content_version,
        blocks: scriptBlocks
    };
}

async function readScriptBlocks(roomId: string): Promise<ScriptBlock[]> {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from("script_blocks")
        .select("id,title,content")
        .eq("room_id", roomId)
        .order("position", { ascending: true })
        .returns<ScriptBlockRow[]>();

    if (error) {
        throw new Error(error.message);
    }

    return data.map((block) => ({
        id: block.id,
        title: block.title,
        content: {
            spans: normalizeRichTextSpans(block.content.spans ?? [])
        }
    }));
}

async function readConfig(roomId: string): Promise<RoomConfig> {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.from("room_config").select("*").eq("room_id", roomId).single<ConfigRow>();

    if (error || !data) {
        throw new Error(error?.message ?? "Room config not found.");
    }

    return {
        fontSize: data.font_size,
        lineHeight: Number(data.line_height),
        marginPercent: data.margin_percent,
        guidePosition: data.guide_position,
        defaultSpeed: Number(data.default_speed),
        theme: data.theme.mode ?? "dark"
    };
}

async function readActiveSignal(roomId: string): Promise<Signal | null> {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from("signals")
        .select("id,type,value,expires_at,created_at")
        .eq("room_id", roomId)
        .is("cleared_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<SignalRow>();

    if (error) {
        throw new Error(error.message);
    }

    return data
        ? {
              id: data.id,
              type: data.type,
              value: data.value,
              expiresAt: data.expires_at,
              createdAt: data.created_at
          }
        : null;
}

async function readFollowers(roomId: string): Promise<ClientPresence[]> {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from("room_presence")
        .select("client_id,role,display_name,joined_at")
        .eq("room_id", roomId)
        .order("last_seen_at", { ascending: false })
        .returns<PresenceRow[]>();

    if (error) {
        throw new Error(error.message);
    }

    return data.map((presence) => ({
        clientId: presence.client_id,
        role: presence.role,
        displayName: presence.display_name,
        joinedAt: presence.joined_at
    }));
}

async function findRoomByCode(code: string): Promise<RoomRow | null> {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.from("rooms").select("*").eq("code", code.trim().toUpperCase()).maybeSingle<RoomRow>();

    if (error) {
        throw new Error(error.message);
    }

    return data;
}

async function createRoomCode(): Promise<string> {
    let code = "";

    do {
        code = randomBytes(3).toString("hex").toUpperCase();
    } while (await findRoomByCode(code));

    return code;
}

function createDefaultPlayback(now: string): PlaybackState {
    return {
        isPlaying: false,
        scrollTop: 0,
        scrollRatio: 0,
        speed: 0,
        sequence: 0,
        updatedAt: now,
        masterClientId: null
    };
}

function getPinHashForRole(room: RoomRow, role: Role): string {
    if (role === "producer") {
        return room.producer_pin_hash ?? room.master_pin_hash;
    }

    if (role === "host") {
        return room.host_pin_hash ?? room.follower_pin_hash;
    }

    return room.viewer_pin_hash ?? room.follower_pin_hash;
}

function mapConfigUpdate(config: Partial<RoomConfig>, updatedAt: string): Record<string, unknown> {
    return {
        ...(config.fontSize !== undefined ? { font_size: config.fontSize } : {}),
        ...(config.lineHeight !== undefined ? { line_height: config.lineHeight } : {}),
        ...(config.marginPercent !== undefined ? { margin_percent: config.marginPercent } : {}),
        ...(config.guidePosition !== undefined ? { guide_position: config.guidePosition } : {}),
        ...(config.defaultSpeed !== undefined ? { default_speed: config.defaultSpeed } : {}),
        ...(config.theme !== undefined ? { theme: { mode: config.theme } } : {}),
        updated_at: updatedAt
    };
}

async function replaceScriptBlocks(roomId: string, blocks: ScriptBlock[], updatedAt: string): Promise<void> {
    const supabase = createServerSupabaseClient();
    const { error: deleteError } = await supabase.from("script_blocks").delete().eq("room_id", roomId);

    if (deleteError) {
        throw new Error(deleteError.message);
    }

    const inserts = blocks.map((block, position) => ({
        id: block.id,
        room_id: roomId,
        position,
        title: block.title,
        content: block.content,
        updated_at: updatedAt
    }));
    const { error: insertError } = await supabase.from("script_blocks").insert(inserts);

    if (insertError) {
        throw new Error(insertError.message);
    }
}

function canPatchConfig(claims: SessionClaims, room: RoomRow, config: Partial<RoomConfig>): boolean {
    const keys = Object.keys(config) as Array<keyof RoomConfig>;
    const hostKeys: Array<keyof RoomConfig> = ["defaultSpeed", "fontSize", "guidePosition"];

    if (claims.role === "host") {
        return room.active_host_client_id === claims.clientId && keys.every((key) => hostKeys.includes(key));
    }

    if (claims.role === "producer") {
        return keys.every((key) => !hostKeys.includes(key));
    }

    return false;
}

function createRichTextContent(text: string): ScriptBlock["content"] {
    return {
        spans: [
            {
                id: randomBytes(8).toString("hex"),
                text
            }
        ]
    };
}

function createBlocksFromImportedText(text: string): ScriptBlock[] {
    const sections = text
        .split(/\n-{3,}\n/g)
        .map((section) => section.trim())
        .filter(Boolean);
    const source = sections.length > 0 ? sections : [text];

    return source.map((section, index) => ({
        id: randomUUID(),
        title: source.length === 1 ? "Script" : `Block ${index + 1}`,
        content: createRichTextContent(section)
    }));
}

function normalizeScriptBlocks(blocks: ScriptBlock[]): ScriptBlock[] {
    if (blocks.length === 0) {
        throw new Error("Script must include at least one block.");
    }

    const ids = new Set<string>();

    return blocks.map((block, index) => {
        if (ids.has(block.id)) {
            throw new Error("Script block IDs must be unique.");
        }

        ids.add(block.id);

        return {
            id: block.id,
            title: block.title.trim() || `Block ${index + 1}`,
            content: {
                spans: normalizeRichTextSpans(block.content.spans)
            }
        };
    });
}

function normalizeRichTextSpans(spans: RichTextSpan[]): RichTextSpan[] {
    const normalized = spans
        .map((span) => ({
            id: span.id || randomBytes(8).toString("hex"),
            text: span.text,
            ...(span.textColor && span.textColor !== "default" ? { textColor: span.textColor } : {}),
            ...(span.backgroundColor && span.backgroundColor !== "default" ? { backgroundColor: span.backgroundColor } : {})
        }))
        .filter((span) => span.text.length > 0);

    return normalized.length > 0 ? normalized : [{ id: randomBytes(8).toString("hex"), text: "" }];
}

function flattenScriptBlocks(blocks: ScriptBlock[]): string {
    return blocks.map((block) => `${block.title}\n${block.content.spans.map((span) => span.text).join("")}`).join("\n\n");
}

function createRealtimeTopic(roomId: string, secret: string): string {
    return `teleprompter:${roomId}:${secret}`;
}

function hashPin(pin: string): string {
    return createHash("sha256").update(pin).digest("hex");
}

function verifyPin(pin: string, expectedHash: string): boolean {
    const actual = Buffer.from(hashPin(pin));
    const expected = Buffer.from(expectedHash);

    return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function signToken(claims: SessionClaims): string {
    const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
    const signature = createHmac("sha256", getTokenSecret()).update(payload).digest("base64url");

    return `${payload}.${signature}`;
}

function verifyToken(token: string): SessionClaims | null {
    const [payload, signature] = token.split(".");

    if (!payload || !signature) {
        return null;
    }

    const expected = createHmac("sha256", getTokenSecret()).update(payload).digest("base64url");

    if (signature !== expected) {
        return null;
    }

    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionClaims;
}

function createInviteTokens(roomId: string): Record<Role, string> {
    return {
        producer: signInviteToken({ roomId, role: "producer", purpose: "room-invite" }),
        host: signInviteToken({ roomId, role: "host", purpose: "room-invite" }),
        viewer: signInviteToken({ roomId, role: "viewer", purpose: "room-invite" })
    };
}

function signInviteToken(claims: InviteClaims): string {
    const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
    const signature = createHmac("sha256", getTokenSecret()).update(`invite:${payload}`).digest("base64url");

    return `${payload}.${signature}`;
}

function verifyInviteToken(token: string, roomId: string, role: Role): boolean {
    const [payload, signature] = token.split(".");

    if (!payload || !signature) {
        return false;
    }

    const expected = createHmac("sha256", getTokenSecret()).update(`invite:${payload}`).digest("base64url");

    if (signature !== expected) {
        return false;
    }

    try {
        const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<InviteClaims>;

        return claims.purpose === "room-invite" && claims.roomId === roomId && claims.role === role;
    } catch {
        return false;
    }
}

function getTokenSecret(): string {
    const secret = process.env.TELEPROMPTER_TOKEN_SECRET;

    if (secret) {
        return secret;
    }

    if (process.env.NODE_ENV === "production") {
        throw new Error("Missing TELEPROMPTER_TOKEN_SECRET.");
    }

    return "dev-only-teleprompter-secret";
}
