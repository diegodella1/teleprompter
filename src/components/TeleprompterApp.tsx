"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, BookOpen, Check, Copy, Expand, FileUp, Link2, LogIn, Palette, Pause, Play, Plus, Radio, RotateCcw, Send, Settings, SkipBack, SkipForward, Square, Trash2, Users } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import type { ApiResult, JoinedRoom, MasterPatch, RichTextColorToken, RichTextSpan, Role, RoomConfig, RoomSnapshot, ScriptBlock, ScriptDocument, SignalType } from "@/types/teleprompter";
import "./teleprompter.css";

type Session = {
    token: string;
    role: Role;
    clientId: string;
    realtimeTopic: string;
    snapshot: RoomSnapshot;
    inviteTokens?: Record<Role, string>;
};

type CreatedRoom = {
    token: string;
    clientId: string;
    realtimeTopic: string;
    snapshot: RoomSnapshot;
    inviteTokens?: Record<Role, string>;
};

type JoinForm = {
    code: string;
    role: Role;
    pin: string;
    displayName: string;
};

type EntryPanel = "join" | "create";

type CopyTarget = "room" | "producer" | "host" | "viewer" | null;

type SaveStatus = "saved" | "saving" | "unsaved" | "failed";

type TeleprompterAppProps = {
    fixedRole?: Role;
    initialRoomCode?: string;
    inviteToken?: string;
};

type PromptLine = {
    id: string;
    spans: RichTextSpan[];
    className: string;
    blockId: string;
    isHeading: boolean;
};

const initialJoinForm: JoinForm = {
    code: "",
    role: "viewer",
    pin: "",
    displayName: "Viewer"
};

const signalTypes = ["30s", "60s", "WRAP", "STANDBY", "GO"] as const;

const colorOptions: Array<{ token: RichTextColorToken; label: string }> = [
    { token: "default", label: "Default" },
    { token: "accent", label: "Accent" },
    { token: "live", label: "Live" },
    { token: "warning", label: "Warning" },
    { token: "blue", label: "Blue" },
    { token: "violet", label: "Violet" }
];

const roleDescriptions: Record<Role, string> = {
    producer: "Edits scripts, configures the room, and sends live signals.",
    host: "Controls playback, scroll position, and live prompting pace.",
    viewer: "Reads the synchronized prompt without changing shared state."
};

export function TeleprompterApp({ fixedRole, initialRoomCode = "", inviteToken }: TeleprompterAppProps) {
    const [roomName, setRoomName] = useState("Roxom.TV Live Desk");
    const [producerPin, setProducerPin] = useState("");
    const [hostPin, setHostPin] = useState("");
    const [viewerPin, setViewerPin] = useState("");
    const [joinForm, setJoinForm] = useState<JoinForm>(() => ({
        code: normalizeRoomCode(initialRoomCode),
        role: fixedRole ?? initialJoinForm.role,
        pin: "",
        displayName: fixedRole ? roleLabel(fixedRole) : initialJoinForm.displayName
    }));
    const [session, setSession] = useState<Session | null>(null);
    const [createdRoom, setCreatedRoom] = useState<CreatedRoom | null>(null);
    const [entryPanel, setEntryPanel] = useState<EntryPanel>("join");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState<CopyTarget>(null);
    const [inviteRejected, setInviteRejected] = useState(false);
    const channelRef = useRef<BroadcastChannel | null>(null);
    const realtimeChannelRef = useRef<ReturnType<NonNullable<ReturnType<typeof createBrowserSupabaseClient>>["channel"]> | null>(null);
    const activeRoomCode = session?.snapshot.code;
    const activeRealtimeTopic = session?.realtimeTopic;
    const createReady = roomName.trim().length > 0 && producerPin.trim().length > 0 && hostPin.trim().length > 0 && viewerPin.trim().length > 0;
    const inviteMode = Boolean(fixedRole);
    const hasInviteToken = Boolean(inviteToken);
    const canUseInviteToken = hasInviteToken && !inviteRejected;
    const joinReady = joinForm.code.trim().length > 0 && (canUseInviteToken || joinForm.pin.trim().length > 0) && joinForm.displayName.trim().length > 0;

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const room = normalizeRoomCode(params.get("room") ?? "");
        const role = parseRole(params.get("role"));

        if (fixedRole || initialRoomCode || !room && !role) {
            return;
        }

        setJoinForm((current) => ({
            ...current,
            code: room || current.code,
            role: role ?? current.role,
            displayName: role && shouldUseRoleDisplayName(current.displayName, current.role) ? roleLabel(role) : current.displayName
        }));
    }, [fixedRole, initialRoomCode]);

    const updateSnapshot = useCallback((snapshot: RoomSnapshot) => {
        setSession((current) => (current ? { ...current, snapshot } : current));
    }, []);

    const publishLocalSync = useCallback((snapshot: RoomSnapshot) => {
        channelRef.current?.postMessage({ type: "snapshot", snapshot });
    }, []);

    const publishRealtimeSync = useCallback(async (snapshot: RoomSnapshot) => {
        await realtimeChannelRef.current?.send({
            type: "broadcast",
            event: "snapshot",
            payload: { snapshot }
        });
    }, []);

    useEffect(() => {
        if (!activeRoomCode) {
            return;
        }

        const channel = new BroadcastChannel(`teleprompter:${activeRoomCode}`);
        channelRef.current = channel;

        channel.onmessage = (event: MessageEvent<{ type: string; snapshot: RoomSnapshot }>) => {
            if (event.data.type === "snapshot") {
                updateSnapshot(event.data.snapshot);
            }
        };

        return () => {
            channel.close();
            channelRef.current = null;
        };
    }, [activeRoomCode, updateSnapshot]);

    useEffect(() => {
        if (!activeRealtimeTopic) {
            return;
        }

        const supabase = createBrowserSupabaseClient();

        if (!supabase) {
            setError("Missing Supabase browser environment variables.");
            return;
        }

        const channel = supabase.channel(activeRealtimeTopic, {
            config: {
                broadcast: {
                    self: false
                }
            }
        });
        realtimeChannelRef.current = channel;
        channel.on("broadcast", { event: "snapshot" }, (event: { payload: { snapshot: RoomSnapshot } }) => {
            updateSnapshot(event.payload.snapshot);
        });
        void channel.subscribe();

        return () => {
            realtimeChannelRef.current = null;
            void supabase.removeChannel(channel);
        };
    }, [activeRealtimeTopic, updateSnapshot]);

    const createRoom = useCallback(async () => {
        if (!createReady) {
            return;
        }

        setBusy(true);
        setError(null);

        const result = await postJson<RoomSnapshot>("/api/rooms", { name: roomName, producerPin, hostPin, viewerPin });

        if (!result.success) {
            setError(result.error);
            setBusy(false);
            return;
        }

        const clientId = createClientId();
        const joined = await postJson<JoinedRoom>("/api/rooms/join", {
            code: result.data.code,
            role: "producer",
            pin: producerPin,
            displayName: "Producer",
            clientId
        });

        if (joined.success) {
            setCreatedRoom({
                token: joined.data.token,
                clientId,
                realtimeTopic: joined.data.realtimeTopic,
                snapshot: joined.data.snapshot,
                inviteTokens: joined.data.inviteTokens
            });
        } else {
            setError(joined.error);
        }

        setBusy(false);
    }, [createReady, hostPin, producerPin, roomName, viewerPin]);

    const enterCreatedRoom = useCallback(() => {
        if (!createdRoom) {
            return;
        }

            setSession({
                token: createdRoom.token,
                role: "producer",
                clientId: createdRoom.clientId,
                realtimeTopic: createdRoom.realtimeTopic,
                snapshot: createdRoom.snapshot,
                inviteTokens: createdRoom.inviteTokens
            });
        setCreatedRoom(null);
    }, [createdRoom]);

    const joinRoom = useCallback(async () => {
        if (!joinReady) {
            return;
        }

        setBusy(true);
        setError(null);

        const clientId = createClientId();
        const joinPayload = {
            code: joinForm.code,
            role: fixedRole ?? joinForm.role,
            displayName: joinForm.displayName,
            clientId,
            ...(canUseInviteToken && inviteToken ? { inviteToken } : { pin: joinForm.pin })
        };
        const result = await postJson<JoinedRoom>("/api/rooms/join", joinPayload);

        if (result.success) {
            setSession({
                token: result.data.token,
                role: fixedRole ?? joinForm.role,
                clientId,
                realtimeTopic: result.data.realtimeTopic,
                snapshot: result.data.snapshot,
                inviteTokens: result.data.inviteTokens
            });
        } else {
            setError(result.error);
            setInviteRejected(Boolean(inviteToken));
        }

        setBusy(false);
    }, [canUseInviteToken, fixedRole, inviteToken, joinForm, joinReady]);

    const selectJoinRole = useCallback((role: Role) => {
        setJoinForm((current) => ({
            ...current,
            role,
            displayName: shouldUseRoleDisplayName(current.displayName, current.role) ? roleLabel(role) : current.displayName
        }));
    }, []);

    const roomPatch = useCallback(
        async (patch: MasterPatch) => {
            if (!session || session.role === "viewer") {
                return;
            }

            const result = await patchJson<JoinedRoom>(`/api/rooms/${session.snapshot.code}/master`, patch, session.token);

            if (result.success) {
                updateSnapshot(result.data.snapshot);
                publishLocalSync(result.data.snapshot);
                await publishRealtimeSync(result.data.snapshot);
            } else {
                setError(result.error);
                throw new Error(result.error);
            }
        },
        [publishLocalSync, publishRealtimeSync, session, updateSnapshot]
    );

    if (!session) {
        if (createdRoom) {
            return (
                <main className="shell">
                    <RoomReady
                        room={createdRoom.snapshot}
                        inviteTokens={createdRoom.inviteTokens}
                        copied={copied}
                        onCopy={(target, value) => void copyToClipboard(target, value, setCopied)}
                        onEnter={enterCreatedRoom}
                        onBack={() => setCreatedRoom(null)}
                    />
                    {error ? <p className="error">{error}</p> : null}
                </main>
            );
        }

        if (inviteMode && fixedRole) {
            return (
                <main className="shell">
                    <section className="entry invite-entry">
                        <header className="entry-header">
                            <div className="brand">
                                <span>ROXOM.TV</span>
                                <h1>{roleInviteTitle(fixedRole)}</h1>
                                <p>{roleInviteDescription(fixedRole)}</p>
                            </div>
                            <Link className="manual-link" href="/manual">
                                <BookOpen size={18} /> Operation manual
                            </Link>
                        </header>
                        <form
                            className="panel join-panel invite-panel"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void joinRoom();
                            }}
                        >
                            <div className="panel-title">
                                <span>{roleLabel(fixedRole)} invite</span>
                                <h2>Room {joinForm.code || "missing"}</h2>
                                <p>{canUseInviteToken ? "This secure invite includes role access. Enter a display name to continue." : `Enter the ${roleLabel(fixedRole)} PIN to continue.`}</p>
                            </div>
                            <label>
                                Display name
                                <input value={joinForm.displayName} onChange={(event) => setJoinForm({ ...joinForm, displayName: event.target.value })} />
                            </label>
                            {!canUseInviteToken ? (
                                <label>
                                    {roleLabel(fixedRole)} PIN
                                    <input type="password" value={joinForm.pin} onChange={(event) => setJoinForm({ ...joinForm, pin: event.target.value })} />
                                </label>
                            ) : null}
                            <button type="submit" className="primary full-width" disabled={busy || !joinReady}>
                                <LogIn size={18} /> Enter as {roleLabel(fixedRole)}
                            </button>
                            {!joinForm.code ? <p className="error">Missing room code. Ask the Producer for a new invite link.</p> : null}
                        </form>
                        {error ? <p className="error">{error}</p> : null}
                    </section>
                </main>
            );
        }

        return (
            <main className="shell">
                <section className="entry">
                    <header className="entry-header">
                        <div className="brand">
                            <span>ROXOM.TV</span>
                            <h1>Teleprompter</h1>
                            <p>Create or join a remote prompting room for live production over WAN.</p>
                        </div>
                        <Link className="manual-link" href="/manual">
                            <BookOpen size={18} /> Operation manual
                        </Link>
                    </header>
                    <div className="entry-switch" aria-label="Choose entry flow">
                        <button type="button" className={entryPanel === "join" ? "active" : ""} onClick={() => setEntryPanel("join")}>
                            <LogIn size={18} /> Join
                        </button>
                        <button type="button" className={entryPanel === "create" ? "active" : ""} onClick={() => setEntryPanel("create")}>
                            <Users size={18} /> Create
                        </button>
                    </div>
                    <div className="entry-grid">
                        <form
                            className={entryPanel === "join" ? "panel join-panel active-entry-panel" : "panel join-panel"}
                            onSubmit={(event) => {
                                event.preventDefault();
                                void joinRoom();
                            }}
                        >
                            <div className="panel-title">
                                <span>Default path</span>
                                <h2>Join a room</h2>
                                <p>Use the room code and role PIN shared by the Producer.</p>
                            </div>
                            <label>
                                Room code
                                <input
                                    className="room-code-input"
                                    value={joinForm.code}
                                    onChange={(event) => setJoinForm({ ...joinForm, code: normalizeRoomCode(event.target.value) })}
                                    placeholder="ABCD12"
                                    inputMode="text"
                                    autoComplete="off"
                                />
                            </label>
                            <div className="role-picker" aria-label="Select role">
                                {(["producer", "host", "viewer"] as const).map((role) => (
                                    <button type="button" key={role} className={joinForm.role === role ? "active" : ""} onClick={() => selectJoinRole(role)}>
                                        <strong>{roleLabel(role)}</strong>
                                        <span>{roleDescriptions[role]}</span>
                                    </button>
                                ))}
                            </div>
                            <label>
                                Display name
                                <input value={joinForm.displayName} onChange={(event) => setJoinForm({ ...joinForm, displayName: event.target.value })} />
                            </label>
                            <label>
                                {roleLabel(joinForm.role)} PIN
                                <input type="password" value={joinForm.pin} onChange={(event) => setJoinForm({ ...joinForm, pin: event.target.value })} />
                            </label>
                            <button type="submit" className="primary full-width" disabled={busy || !joinReady}>
                                <LogIn size={18} /> Join room
                            </button>
                        </form>
                        <form
                            className={entryPanel === "create" ? "panel create-panel active-entry-panel" : "panel create-panel"}
                            onSubmit={(event) => {
                                event.preventDefault();
                                void createRoom();
                            }}
                        >
                            <div className="panel-title">
                                <span>Producer setup</span>
                                <h2>Create production room</h2>
                                <p>Set access for each role before sharing links with the team.</p>
                            </div>
                            <label>
                                Room name
                                <input value={roomName} onChange={(event) => setRoomName(event.target.value)} />
                            </label>
                            <fieldset className="pin-fieldset">
                                <legend>Access PINs</legend>
                                <p>Use different PINs for Producer, Host, and Viewer access.</p>
                                <label>
                                    Producer PIN
                                    <input type="password" value={producerPin} onChange={(event) => setProducerPin(event.target.value)} />
                                </label>
                                <label>
                                    Host PIN
                                    <input type="password" value={hostPin} onChange={(event) => setHostPin(event.target.value)} />
                                </label>
                                <label>
                                    Viewer PIN
                                    <input type="password" value={viewerPin} onChange={(event) => setViewerPin(event.target.value)} />
                                </label>
                            </fieldset>
                            <button type="submit" className="primary full-width" disabled={busy || !createReady}>
                                <Users size={18} /> Create room
                            </button>
                        </form>
                    </div>
                    {error ? <p className="error">{error}</p> : null}
                </section>
            </main>
        );
    }

    return (
        <main className="workspace">
            <Topbar session={session} onLeave={() => setSession(null)} />
            {session.role === "producer" ? (
                <ProducerView session={session} onPatch={roomPatch} />
            ) : session.role === "host" ? (
                <HostView session={session} onPatch={roomPatch} />
            ) : (
                <ViewerView snapshot={session.snapshot} />
            )}
            {error ? <div className="toast">{error}</div> : null}
        </main>
    );
}

function Topbar({ session, onLeave }: { session: Session; onLeave: () => void }) {
    const [copied, setCopied] = useState<CopyTarget>(null);
    const progress = Math.round(session.snapshot.lastState.scrollRatio * 100);

    return (
        <header className="topbar">
            <div className="topbar-room">
                <strong>{session.snapshot.name}</strong>
                <button className="room-code-button" onClick={() => void copyToClipboard("room", session.snapshot.code, setCopied)}>
                    {copied === "room" ? <Check size={16} /> : <Copy size={16} />}
                    <span>Room</span>
                    <strong>{session.snapshot.code}</strong>
                </button>
                <span className={session.snapshot.lastState.isPlaying ? "pill live" : "pill"}>{session.snapshot.lastState.isPlaying ? "Live scrolling" : "Paused"}</span>
            </div>
            <div className="status">
                <span>{roleLabel(session.role)}</span>
                <span>{progress}%</span>
                <Link className="topbar-link" href="/manual">
                    Manual
                </Link>
                <button onClick={onLeave}>Leave</button>
            </div>
        </header>
    );
}

function RoomReady({
    room,
    inviteTokens,
    copied,
    onCopy,
    onEnter,
    onBack
}: {
    room: RoomSnapshot;
    inviteTokens?: Record<Role, string>;
    copied: CopyTarget;
    onCopy: (target: Exclude<CopyTarget, null>, value: string) => void;
    onEnter: () => void;
    onBack: () => void;
}) {
    const producerLink = buildInviteLink(room.code, "producer", inviteTokens?.producer);
    const hostLink = buildInviteLink(room.code, "host", inviteTokens?.host);
    const viewerLink = buildInviteLink(room.code, "viewer", inviteTokens?.viewer);

    return (
        <section className="entry ready">
            <div className="brand compact">
                <span>ROOM READY</span>
                <h1>{room.code}</h1>
                <p>Share the right secure invite link for each production role.</p>
            </div>
            <div className="ready-actions">
                <button className="primary" onClick={() => onCopy("room", room.code)}>
                    {copied === "room" ? <Check size={18} /> : <Copy size={18} />} Copy Room ID
                </button>
                <button onClick={() => onCopy("producer", producerLink)}>
                    {copied === "producer" ? <Check size={18} /> : <Link2 size={18} />} Producer console
                </button>
                <button onClick={() => onCopy("host", hostLink)}>
                    {copied === "host" ? <Check size={18} /> : <Link2 size={18} />} Host link
                </button>
                <button onClick={() => onCopy("viewer", viewerLink)}>
                    {copied === "viewer" ? <Check size={18} /> : <Link2 size={18} />} Viewer link
                </button>
            </div>
            <ol className="ready-checklist">
                <li>Share the Host invite with the scroll operator.</li>
                <li>Share the Viewer invite with talent and monitor devices.</li>
                <li>Open the Producer Console and prepare the script.</li>
            </ol>
            <div className="ready-footer">
                <button onClick={onBack}>Back</button>
                <button className="primary" onClick={onEnter}>
                    <Radio size={18} /> Open Producer Console
                </button>
            </div>
        </section>
    );
}

function ProducerView({ session, onPatch }: { session: Session; onPatch: (patch: MasterPatch) => Promise<void> }) {
    const { snapshot } = session;
    const previewRef = useRef<HTMLDivElement | null>(null);
    const editorRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const autosaveTimerRef = useRef<number | null>(null);
    const savingRef = useRef(false);
    const lastSavedSignatureRef = useRef(blocksSignature(cloneBlocks(snapshot.script)));
    const latestDraftRef = useRef<ScriptBlock[]>(cloneBlocks(snapshot.script));
    const queuedDelayRef = useRef<number | null>(null);
    const [blockDraft, setBlockDraft] = useState<ScriptBlock[]>(() => cloneBlocks(snapshot.script));
    const [activeBlockId, setActiveBlockId] = useState<string | null>(snapshot.script.blocks[0]?.id ?? null);
    const [customSignal, setCustomSignal] = useState("");
    const [copied, setCopied] = useState<CopyTarget>(null);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
    const hostCount = snapshot.followers.filter((presence) => presence.role === "host").length;
    const viewerCount = snapshot.followers.filter((presence) => presence.role === "viewer").length;

    useEffect(() => {
        const nextBlocks = cloneBlocks(snapshot.script);
        const nextSignature = blocksSignature(nextBlocks);

        if (blocksSignature(latestDraftRef.current) !== lastSavedSignatureRef.current) {
            return;
        }

        latestDraftRef.current = nextBlocks;
        lastSavedSignatureRef.current = nextSignature;
        setBlockDraft(nextBlocks);
        setSaveStatus("saved");
        setActiveBlockId((current) => current ?? nextBlocks[0]?.id ?? null);
    }, [snapshot.script.contentVersion, snapshot.script]);

    useEffect(() => {
        latestDraftRef.current = blockDraft;
    }, [blockDraft]);

    useEffect(() => {
        return () => {
            if (autosaveTimerRef.current !== null) {
                window.clearTimeout(autosaveTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const node = previewRef.current;

        if (!node) {
            return;
        }

        const maxScroll = Math.max(1, node.scrollHeight - node.clientHeight);
        const target = snapshot.lastState.scrollTop || snapshot.lastState.scrollRatio * maxScroll;
        node.scrollTo({ top: target, behavior: Math.abs(node.scrollTop - target) > 420 ? "auto" : "smooth" });
    }, [snapshot.lastState.sequence, snapshot.lastState.scrollRatio, snapshot.lastState.scrollTop]);

    const sendSignal = useCallback(
        (type: SignalType, value: string | null) => {
            const expiresAt = type === "30s" || type === "60s" ? new Date(Date.now() + Number.parseInt(type, 10) * 1000).toISOString() : null;
            void onPatch({ signal: { type, value, expiresAt } });
        },
        [onPatch]
    );

    const saveBlocks = useCallback(async () => {
        const blocks = latestDraftRef.current;
        const signature = blocksSignature(blocks);

        if (signature === lastSavedSignatureRef.current) {
            setSaveStatus("saved");
            return;
        }

        if (savingRef.current) {
            queuedDelayRef.current = 250;
            setSaveStatus("unsaved");
            return;
        }

        savingRef.current = true;
        setSaveStatus("saving");

        try {
            await onPatch({ scriptBlocks: blocks });

            if (blocksSignature(latestDraftRef.current) === signature) {
                lastSavedSignatureRef.current = signature;
                setSaveStatus("saved");
            } else {
                setSaveStatus("unsaved");
                queuedDelayRef.current = 250;
            }
        } catch {
            setSaveStatus("failed");
        } finally {
            savingRef.current = false;

            if (queuedDelayRef.current !== null) {
                const delay = queuedDelayRef.current;
                queuedDelayRef.current = null;

                if (autosaveTimerRef.current !== null) {
                    window.clearTimeout(autosaveTimerRef.current);
                }

                autosaveTimerRef.current = window.setTimeout(() => {
                    autosaveTimerRef.current = null;
                    void saveBlocks();
                }, delay);
            }
        }
    }, [onPatch]);

    const scheduleAutosave = useCallback(
        (blocks: ScriptBlock[], delay: number) => {
            latestDraftRef.current = blocks;
            setSaveStatus("unsaved");

            if (autosaveTimerRef.current !== null) {
                window.clearTimeout(autosaveTimerRef.current);
            }

            autosaveTimerRef.current = window.setTimeout(() => {
                autosaveTimerRef.current = null;
                void saveBlocks();
            }, delay);
        },
        [saveBlocks]
    );

    const updateBlock = useCallback((blockId: string, patch: Partial<ScriptBlock>) => {
        setBlockDraft((current) => {
            const next = current.map((block) => (block.id === blockId ? { ...block, ...patch } : block));
            scheduleAutosave(next, 250);

            return next;
        });
    }, [scheduleAutosave]);

    const addBlock = useCallback(() => {
        const block = createEmptyBlock(blockDraft.length + 1);
        setBlockDraft((current) => {
            const next = [...current, block];
            scheduleAutosave(next, 250);

            return next;
        });
        setActiveBlockId(block.id);
    }, [blockDraft.length, scheduleAutosave]);

    const deleteBlock = useCallback((blockId: string) => {
        setBlockDraft((current) => {
            if (current.length === 1) {
                return current;
            }

            const block = current.find((item) => item.id === blockId);
            const hasContent = block ? block.title.trim().length > 0 || blockToPlainText(block).trim().length > 0 : false;

            if (hasContent && !window.confirm("Delete this script block?")) {
                return current;
            }

            const next = current.filter((item) => item.id !== blockId);
            setActiveBlockId(next[0]?.id ?? null);
            scheduleAutosave(next, 250);

            return next;
        });
    }, [scheduleAutosave]);

    const moveBlock = useCallback((blockId: string, direction: -1 | 1) => {
        setBlockDraft((current) => {
            const index = current.findIndex((block) => block.id === blockId);
            const nextIndex = index + direction;

            if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
                return current;
            }

            const next = [...current];
            const [block] = next.splice(index, 1);
            next.splice(nextIndex, 0, block);
            scheduleAutosave(next, 250);

            return next;
        });
    }, [scheduleAutosave]);

    const updateBlockText = useCallback((blockId: string, text: string) => {
        setBlockDraft((current) => {
            const next = current.map((block) => (block.id === blockId ? { ...block, content: createRichTextContent(text) } : block));
            scheduleAutosave(next, 800);

            return next;
        });
    }, [scheduleAutosave]);

    const applySelectionColor = useCallback(
        (kind: "textColor" | "backgroundColor", token: RichTextColorToken) => {
            if (!activeBlockId) {
                return;
            }

            const editor = editorRefs.current[activeBlockId];
            const selection = window.getSelection();

            if (!editor || !selection || selection.rangeCount === 0) {
                return;
            }

            const range = selection.getRangeAt(0);

            if (!editor.contains(range.commonAncestorContainer) || selection.toString().length === 0) {
                return;
            }

            const beforeRange = range.cloneRange();
            beforeRange.selectNodeContents(editor);
            beforeRange.setEnd(range.startContainer, range.startOffset);
            const start = beforeRange.toString().length;
            const end = start + selection.toString().length;

            let nextActiveSpans: RichTextSpan[] | null = null;

            setBlockDraft((current) => {
                const next = current.map((block) => {
                    if (block.id !== activeBlockId) {
                        return block;
                    }

                    nextActiveSpans = applyColorToSpans(block.content.spans, start, end, kind, token);

                    return {
                        ...block,
                        content: {
                            spans: nextActiveSpans
                        }
                    };
                });
                scheduleAutosave(next, 800);

                return next;
            });

            if (nextActiveSpans) {
                editor.innerHTML = spansToEditorHtml(nextActiveSpans);
            }

            selection.removeAllRanges();
        },
        [activeBlockId, scheduleAutosave]
    );

    const importBlocks = useCallback(async (file: File | undefined) => {
        if (!file) {
            return;
        }

        const blocks = createBlocksFromImportedText(await file.text());
        setBlockDraft(blocks);
        scheduleAutosave(blocks, 250);
        setActiveBlockId(blocks[0]?.id ?? null);
    }, [scheduleAutosave]);

    return (
        <section className="master-layout">
            <aside className="control-rail">
                <div className="rail-section">
                    <span className="section-label">Room</span>
                    <button className="room-code-button wide" onClick={() => void copyToClipboard("room", snapshot.code, setCopied)}>
                        {copied === "room" ? <Check size={16} /> : <Copy size={16} />}
                        <strong>{snapshot.code}</strong>
                    </button>
                    <div className="share-grid">
                        <button onClick={() => void copyToClipboard("host", buildInviteLink(snapshot.code, "host", session.inviteTokens?.host), setCopied)}>
                            {copied === "host" ? <Check size={16} /> : <Link2 size={16} />} Host
                        </button>
                        <button onClick={() => void copyToClipboard("viewer", buildInviteLink(snapshot.code, "viewer", session.inviteTokens?.viewer), setCopied)}>
                            {copied === "viewer" ? <Check size={16} /> : <Link2 size={16} />} Viewer
                        </button>
                    </div>
                </div>

                <div className="rail-section">
                    <span className="section-label">Live status</span>
                    <div className="metric-grid">
                        <div className="metric">
                            <strong>{hostCount}</strong>
                            <span>Hosts</span>
                        </div>
                        <div className="metric">
                            <strong>{viewerCount}</strong>
                            <span>Viewers</span>
                        </div>
                    </div>
                    <span className={snapshot.lastState.isPlaying ? "pill live" : "pill"}>{snapshot.lastState.isPlaying ? "Host scrolling" : "Host paused"}</span>
                    <div className="progress-track">
                        <div style={{ width: `${Math.round(snapshot.lastState.scrollRatio * 100)}%` }} />
                    </div>
                    <span className="muted">Host scroll {Math.round(snapshot.lastState.scrollRatio * 100)}%</span>
                </div>

                <div className="rail-section signals">
                    <span className="section-label">Signals</span>
                    {snapshot.activeSignal ? <span className="pill live">{snapshot.activeSignal.value ?? snapshot.activeSignal.type}</span> : <span className="pill">No active signal</span>}
                    {signalTypes.map((type) => (
                        <button key={type} onClick={() => sendSignal(type, null)}>
                            <Send size={16} /> {type}
                        </button>
                    ))}
                    <input value={customSignal} placeholder="Custom" onChange={(event) => setCustomSignal(event.target.value)} />
                    <button onClick={() => sendSignal("CUSTOM", customSignal)}>Send</button>
                    <button onClick={() => void onPatch({ clearSignal: true })}>Clear</button>
                </div>

                <div className="rail-section">
                    <span className="section-label">Script blocks</span>
                    <button onClick={addBlock}>
                        <Plus size={16} /> Add block
                    </button>
                    <span className="muted">{blockDraft.length} blocks in prompt order</span>
                </div>
            </aside>
            <section className="editor-panel">
                <div className="panel-header">
                    <span>{saveStatusLabel(saveStatus)}</span>
                    <label className="file-button">
                        <FileUp size={18} /> Import
                        <input type="file" accept=".txt,.md" onChange={(event) => void importBlocks(event.currentTarget.files?.[0])} />
                    </label>
                </div>
                <div className="format-toolbar">
                    <span>
                        <Palette size={16} /> Text
                    </span>
                    {colorOptions.map((color) => (
                        <button key={`text-${color.token}`} className={`swatch text-${color.token}`} title={color.label} onMouseDown={(event) => event.preventDefault()} onClick={() => applySelectionColor("textColor", color.token)} />
                    ))}
                    <span>Background</span>
                    {colorOptions.map((color) => (
                        <button key={`bg-${color.token}`} className={`swatch bg-${color.token}`} title={color.label} onMouseDown={(event) => event.preventDefault()} onClick={() => applySelectionColor("backgroundColor", color.token)} />
                    ))}
                </div>
                <div className="block-editor-list">
                    {blockDraft.map((block, index) => (
                        <article className={block.id === activeBlockId ? "script-block active" : "script-block"} key={block.id}>
                            <div className="block-tools">
                                <span className="section-label">Block {index + 1}</span>
                                <button title="Move up" disabled={index === 0} onClick={() => moveBlock(block.id, -1)}>
                                    <ArrowUp size={16} />
                                </button>
                                <button title="Move down" disabled={index === blockDraft.length - 1} onClick={() => moveBlock(block.id, 1)}>
                                    <ArrowDown size={16} />
                                </button>
                                <button title="Delete block" disabled={blockDraft.length === 1} onClick={() => deleteBlock(block.id)}>
                                    <Trash2 size={16} />
                                </button>
                            </div>
                            <input className="block-title-input" value={block.title} onChange={(event) => updateBlock(block.id, { title: event.target.value })} onFocus={() => setActiveBlockId(block.id)} />
                            <RichBlockEditor
                                block={block}
                                setEditorRef={(node) => {
                                    editorRefs.current[block.id] = node;
                                }}
                                onFocus={() => setActiveBlockId(block.id)}
                                onTextChange={(text) => updateBlockText(block.id, text)}
                            />
                        </article>
                    ))}
                </div>
            </section>
            <PromptDisplay snapshot={snapshot} scrollRef={previewRef} mode="master" />
        </section>
    );
}

function RichBlockEditor({
    block,
    setEditorRef,
    onFocus,
    onTextChange
}: {
    block: ScriptBlock;
    setEditorRef: (node: HTMLDivElement | null) => void;
    onFocus: () => void;
    onTextChange: (text: string) => void;
}) {
    const ref = useRef<HTMLDivElement | null>(null);
    const inputUpdateRef = useRef(false);

    useEffect(() => {
        setEditorRef(ref.current);

        return () => setEditorRef(null);
    }, [setEditorRef]);

    useEffect(() => {
        const node = ref.current;

        if (!node) {
            return;
        }

        if (inputUpdateRef.current) {
            inputUpdateRef.current = false;
            return;
        }

        node.innerHTML = spansToEditorHtml(block.content.spans);
    }, [block.content.spans]);

    return (
        <div
            className="rich-editor"
            contentEditable
            suppressContentEditableWarning
            ref={ref}
            onFocus={onFocus}
            onInput={(event) => {
                inputUpdateRef.current = true;
                onTextChange(event.currentTarget.innerText);
            }}
        />
    );
}

function HostView({ session, onPatch }: { session: Session; onPatch: (patch: MasterPatch) => Promise<void> }) {
    const { snapshot } = session;
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const lastSentRef = useRef(0);
    const playbackIntentRef = useRef(snapshot.lastState.isPlaying);
    const configTimerRef = useRef<number | null>(null);
    const pendingConfigRef = useRef<Partial<RoomConfig>>({});
    const blocks = useMemo(() => getScriptBlocks(snapshot.script), [snapshot.script]);
    const initialBlockId = blocks[0]?.id ?? "";
    const [activeBlockId, setActiveBlockId] = useState(initialBlockId);
    const activeBlockIdRef = useRef(initialBlockId);
    const [configDraft, setConfigDraft] = useState(snapshot.config);
    const activeBlockIndex = Math.max(0, blocks.findIndex((block) => block.id === activeBlockId));
    const activeBlock = blocks[activeBlockIndex] ?? blocks[0] ?? null;
    const activeBlockLabel = activeBlock ? `Block ${activeBlockIndex + 1} - ${activeBlock.title}` : "No blocks";

    useEffect(() => {
        playbackIntentRef.current = snapshot.lastState.isPlaying;
    }, [snapshot.lastState.isPlaying]);

    useEffect(() => {
        if (!blocks.some((block) => block.id === activeBlockIdRef.current)) {
            const nextBlockId = blocks[0]?.id ?? "";
            activeBlockIdRef.current = nextBlockId;
            setActiveBlockId(nextBlockId);
        }
    }, [blocks]);

    useEffect(() => {
        if (configTimerRef.current === null) {
            setConfigDraft(snapshot.config);
        }
    }, [snapshot.config]);

    useEffect(() => {
        return () => {
            if (configTimerRef.current !== null) {
                window.clearTimeout(configTimerRef.current);
            }
        };
    }, []);

    const getScrollSnapshot = useCallback(() => {
        const node = scrollRef.current;

        if (!node) {
            return {
                scrollTop: snapshot.lastState.scrollTop,
                scrollRatio: snapshot.lastState.scrollRatio
            };
        }

        return {
            scrollTop: node.scrollTop,
            scrollRatio: node.scrollTop / Math.max(1, node.scrollHeight - node.clientHeight)
        };
    }, [snapshot.lastState.scrollRatio, snapshot.lastState.scrollTop]);

    const publishHostScroll = useCallback(
        (options: { forcePaused?: boolean; forcePlaying?: boolean; speed?: number; throttle?: boolean } = {}) => {
            const now = Date.now();

            if (options.throttle && now - lastSentRef.current < 120) {
                return;
            }

            lastSentRef.current = now;
            const scroll = getScrollSnapshot();
            const isPlaying = options.forcePlaying ?? (!options.forcePaused && playbackIntentRef.current);
            const speed = isPlaying ? options.speed ?? (snapshot.lastState.speed || snapshot.config.defaultSpeed) : 0;

            void onPatch({ playback: { ...scroll, isPlaying, speed } });
        },
        [getScrollSnapshot, onPatch, snapshot.config.defaultSpeed, snapshot.lastState.speed]
    );

    useEffect(() => {
        if (!snapshot.lastState.isPlaying) {
            return;
        }

        const timer = window.setInterval(() => {
            const node = scrollRef.current;

            if (!node || !playbackIntentRef.current) {
                return;
            }

            node.scrollTop += snapshot.lastState.speed;
            publishHostScroll({ forcePlaying: true, speed: snapshot.lastState.speed, throttle: true });
        }, 16);

        return () => window.clearInterval(timer);
    }, [publishHostScroll, snapshot.lastState.isPlaying, snapshot.lastState.speed]);

    const play = useCallback(() => {
        playbackIntentRef.current = true;
        publishHostScroll({ forcePlaying: true, speed: snapshot.config.defaultSpeed });
    }, [publishHostScroll, snapshot.config.defaultSpeed]);

    const pause = useCallback(() => {
        playbackIntentRef.current = false;
        publishHostScroll({ forcePaused: true });
    }, [publishHostScroll]);

    const stop = useCallback(() => {
        playbackIntentRef.current = false;
        const scroll = getScrollSnapshot();
        void onPatch({ playback: { ...scroll, isPlaying: false, speed: 0 } });
    }, [getScrollSnapshot, onPatch]);

    const jumpTop = useCallback(() => {
        playbackIntentRef.current = false;

        if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
        }

        publishHostScroll({ forcePaused: true });
    }, [publishHostScroll]);

    const jumpEnd = useCallback(() => {
        playbackIntentRef.current = false;
        const node = scrollRef.current;

        if (node) {
            node.scrollTop = Math.max(0, node.scrollHeight - node.clientHeight);
        }

        publishHostScroll({ forcePaused: true });
    }, [publishHostScroll]);

    const updateActiveBlockFromScroll = useCallback(() => {
        const node = scrollRef.current;

        if (!node) {
            return;
        }

        const headings = Array.from(node.querySelectorAll<HTMLElement>("[data-block-heading='true']"));

        if (headings.length === 0) {
            return;
        }

        const guideOffset = node.clientHeight * (snapshot.config.guidePosition / 100);
        const readPosition = node.scrollTop + guideOffset;
        const activeHeading = headings.reduce((current, heading) => {
            if (heading.offsetTop <= readPosition + 4) {
                return heading;
            }

            return current;
        }, headings[0]);
        const nextBlockId = activeHeading.dataset.blockId ?? "";

        if (nextBlockId && nextBlockId !== activeBlockIdRef.current) {
            activeBlockIdRef.current = nextBlockId;
            setActiveBlockId(nextBlockId);
        }
    }, [snapshot.config.guidePosition]);

    const jumpToBlock = useCallback(
        (blockId: string) => {
            const node = scrollRef.current;

            if (!node) {
                return;
            }

            const heading = Array.from(node.querySelectorAll<HTMLElement>("[data-block-heading='true']")).find((element) => element.dataset.blockId === blockId);

            if (!heading) {
                return;
            }

            playbackIntentRef.current = false;
            const guideOffset = node.clientHeight * (snapshot.config.guidePosition / 100);
            node.scrollTop = Math.max(0, heading.offsetTop - guideOffset + 24);
            activeBlockIdRef.current = blockId;
            setActiveBlockId(blockId);
            publishHostScroll({ forcePaused: true });
        },
        [publishHostScroll, snapshot.config.guidePosition]
    );

    const jumpBlock = useCallback(
        (direction: -1 | 1) => {
            if (blocks.length === 0) {
                return;
            }

            const currentIndex = blocks.findIndex((block) => block.id === activeBlockIdRef.current);
            const fallbackIndex = currentIndex === -1 ? 0 : currentIndex;
            const nextIndex = Math.min(blocks.length - 1, Math.max(0, fallbackIndex + direction));
            jumpToBlock(blocks[nextIndex].id);
        },
        [blocks, jumpToBlock]
    );

    const nudge = useCallback(
        (direction: -1 | 1, distance = 120) => {
            const node = scrollRef.current;

            if (!node) {
                return;
            }

            node.scrollTop = Math.max(0, node.scrollTop + direction * distance);
            updateActiveBlockFromScroll();
            publishHostScroll();
        },
        [publishHostScroll, updateActiveBlockFromScroll]
    );

    const handleHostScroll = useCallback(() => {
        updateActiveBlockFromScroll();
        publishHostScroll({ throttle: true });
    }, [publishHostScroll, updateActiveBlockFromScroll]);

    const updateConfig = useCallback(
        (config: Pick<Partial<RoomConfig>, "defaultSpeed" | "fontSize" | "guidePosition">) => {
            setConfigDraft((current) => ({ ...current, ...config }));
            pendingConfigRef.current = { ...pendingConfigRef.current, ...config };

            if (configTimerRef.current !== null) {
                window.clearTimeout(configTimerRef.current);
            }

            configTimerRef.current = window.setTimeout(() => {
                const nextConfig = pendingConfigRef.current;
                pendingConfigRef.current = {};
                configTimerRef.current = null;
                void onPatch({ config: nextConfig });
            }, 180);
        },
        [onPatch]
    );

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;

            if (target?.closest("input, textarea, select, [contenteditable='true']")) {
                return;
            }

            if (event.code === "Space") {
                event.preventDefault();

                if (playbackIntentRef.current) {
                    pause();
                } else {
                    play();
                }

                return;
            }

            if (event.key === "ArrowUp") {
                event.preventDefault();
                nudge(-1);
            } else if (event.key === "ArrowDown") {
                event.preventDefault();
                nudge(1);
            } else if (event.key === "PageUp") {
                event.preventDefault();
                jumpBlock(-1);
            } else if (event.key === "PageDown") {
                event.preventDefault();
                jumpBlock(1);
            } else if (event.key === "Home") {
                event.preventDefault();
                jumpTop();
            } else if (event.key === "End") {
                event.preventDefault();
                jumpEnd();
            } else if (event.key === "Escape") {
                event.preventDefault();
                stop();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [jumpBlock, jumpEnd, jumpTop, nudge, pause, play, stop]);

    return (
        <section className="host-layout">
            <div className="host-tools">
                <span className={snapshot.lastState.isPlaying ? "pill live" : "pill"}>{snapshot.lastState.isPlaying ? "Live scrolling" : "Paused"}</span>
                <span className="pill">{Math.round(snapshot.lastState.scrollRatio * 100)}%</span>
                <span className="pill block-status">{activeBlockLabel}</span>
                <button className="primary" title="Space" onClick={snapshot.lastState.isPlaying ? pause : play}>
                    {snapshot.lastState.isPlaying ? <Pause size={18} /> : <Play size={18} />}
                    {snapshot.lastState.isPlaying ? "Pause" : "Play"}
                </button>
                <button title="Page Up" onClick={() => jumpBlock(-1)} disabled={blocks.length < 2 || activeBlockIndex === 0}>
                    <SkipBack size={18} /> Prev Block
                </button>
                <button title="Page Down" onClick={() => jumpBlock(1)} disabled={blocks.length < 2 || activeBlockIndex >= blocks.length - 1}>
                    <SkipForward size={18} /> Next Block
                </button>
                <button title="Home" onClick={jumpTop}>
                    <RotateCcw size={18} /> Top
                </button>
                <button title="End" onClick={jumpEnd}>
                    <RotateCcw size={18} /> End
                </button>
                <button title="Arrow up" onClick={() => nudge(-1)}>
                    <ArrowUp size={18} /> Up
                </button>
                <button title="Arrow down" onClick={() => nudge(1)}>
                    <ArrowDown size={18} /> Down
                </button>
                <button title="Escape" onClick={stop}>
                    <Square size={18} /> Stop
                </button>
                <label>
                    <span className="range-label">
                        Speed <strong>{configDraft.defaultSpeed.toFixed(1)}</strong>
                    </span>
                    <input type="range" min="0.5" max="8" step="0.5" value={configDraft.defaultSpeed} onChange={(event) => updateConfig({ defaultSpeed: Number(event.target.value) })} />
                </label>
                <label>
                    <span className="range-label">
                        Font <strong>{configDraft.fontSize}px</strong>
                    </span>
                    <input type="range" min="28" max="120" value={configDraft.fontSize} onChange={(event) => updateConfig({ fontSize: Number(event.target.value) })} />
                </label>
                <label>
                    <span className="range-label">
                        Guide <strong>{configDraft.guidePosition}%</strong>
                    </span>
                    <input type="range" min="10" max="80" value={configDraft.guidePosition} onChange={(event) => updateConfig({ guidePosition: Number(event.target.value) })} />
                </label>
            </div>
            <PromptDisplay snapshot={snapshot} scrollRef={scrollRef} mode="follower" onScroll={handleHostScroll} />
        </section>
    );
}

function ViewerView({ snapshot }: { snapshot: RoomSnapshot }) {
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const [mirror, setMirror] = useState(false);

    useEffect(() => {
        const node = scrollRef.current;

        if (!node) {
            return;
        }

        const maxScroll = Math.max(1, node.scrollHeight - node.clientHeight);
        const target = snapshot.lastState.scrollTop || snapshot.lastState.scrollRatio * maxScroll;
        node.scrollTo({ top: target, behavior: Math.abs(node.scrollTop - target) > 420 ? "auto" : "smooth" });
    }, [snapshot.lastState.sequence, snapshot.lastState.scrollRatio, snapshot.lastState.scrollTop]);

    return (
        <section className={mirror ? "follower mirror" : "follower"}>
            <div className="viewer-status">
                <span className={snapshot.activeHostClientId ? "pill live" : "pill"}>{snapshot.activeHostClientId ? "Following Host" : "Waiting for Host"}</span>
                <span className="pill">Room {snapshot.code}</span>
            </div>
            <div className="follower-tools">
                <button onClick={() => setMirror((value) => !value)}>
                    <Settings size={18} /> Mirror
                </button>
                <button onClick={() => document.documentElement.requestFullscreen()}>
                    <Expand size={18} /> Fullscreen
                </button>
            </div>
            <PromptDisplay snapshot={snapshot} scrollRef={scrollRef} mode="follower" />
        </section>
    );
}

function PromptDisplay({
    snapshot,
    scrollRef,
    mode,
    onScroll
}: {
    snapshot: RoomSnapshot;
    scrollRef: React.RefObject<HTMLDivElement | null>;
    mode: "master" | "follower";
    onScroll?: React.UIEventHandler<HTMLDivElement>;
}) {
    const lines = useMemo(() => renderScriptLines(snapshot.script), [snapshot.script]);
    const style = {
        "--prompt-font-size": `${snapshot.config.fontSize}px`,
        "--prompt-line-height": snapshot.config.lineHeight,
        "--prompt-margin": `${snapshot.config.marginPercent}%`,
        "--guide-position": `${snapshot.config.guidePosition}%`
    } as React.CSSProperties;

    return (
        <section className={`prompt ${mode}`} style={style}>
            <div className="guide" />
            {snapshot.activeSignal ? <div className="signal-overlay">{snapshot.activeSignal.value ?? snapshot.activeSignal.type}</div> : null}
            <div className="prompt-scroll" ref={scrollRef} onScroll={onScroll}>
                {lines.map((line) => (
                    <p key={line.id} className={line.className} data-block-id={line.blockId} data-block-heading={line.isHeading ? "true" : undefined}>
                        {line.spans.map((span) => (
                            <span className={spanClassName(span)} key={span.id}>
                                {span.text}
                            </span>
                        ))}
                    </p>
                ))}
            </div>
        </section>
    );
}

function normalizeRoomCode(value: string): string {
    return value.replace(/\s+/g, "").toUpperCase();
}

function parseRole(value: string | null): Role | null {
    if (value === "producer" || value === "host" || value === "viewer") {
        return value;
    }

    return null;
}

function roleLabel(role: Role): string {
    if (role === "producer") {
        return "Producer";
    }

    if (role === "host") {
        return "Host";
    }

    return "Viewer";
}

function roleInviteTitle(role: Role): string {
    if (role === "producer") {
        return "Producer Console";
    }

    if (role === "host") {
        return "Host Console";
    }

    return "Viewer Display";
}

function roleInviteDescription(role: Role): string {
    if (role === "producer") {
        return "Edit the script, manage blocks, send signals, and share production links.";
    }

    if (role === "host") {
        return "Control playback, speed, guide position, and block navigation for this room.";
    }

    return "Read the synchronized teleprompter feed for this room.";
}

function shouldUseRoleDisplayName(value: string, currentRole: Role): boolean {
    const trimmed = value.trim();

    return trimmed === "" || trimmed === "Remote" || trimmed === roleLabel(currentRole);
}

function saveStatusLabel(status: SaveStatus): string {
    if (status === "saving") {
        return "Saving...";
    }

    if (status === "unsaved") {
        return "Unsaved changes";
    }

    if (status === "failed") {
        return "Save failed";
    }

    return "Saved";
}

function buildInviteLink(code: string, role: Role, inviteToken?: string): string {
    const url = new URL(window.location.href);
    url.pathname = inviteToken ? `/join/${role}` : "/";
    url.search = "";
    url.hash = "";
    url.searchParams.set("room", code);

    if (inviteToken) {
        url.searchParams.set("invite", inviteToken);
    } else {
        url.searchParams.set("role", role);
    }

    return url.toString();
}

async function copyToClipboard(target: Exclude<CopyTarget, null>, value: string, setCopied: React.Dispatch<React.SetStateAction<CopyTarget>>) {
    if (navigator.clipboard) {
        await navigator.clipboard.writeText(value);
    } else {
        const input = document.createElement("textarea");
        input.value = value;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.remove();
    }

    setCopied(target);
    window.setTimeout(() => setCopied(null), 1600);
}

async function postJson<TData>(url: string, body: unknown): Promise<ApiResult<TData>> {
    const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
    });

    return readApiResult<TData>(response);
}

async function patchJson<TData>(url: string, body: unknown, token: string): Promise<ApiResult<TData>> {
    const response = await fetch(url, {
        method: "PATCH",
        headers: { "authorization": `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body)
    });

    return readApiResult<TData>(response);
}

async function readApiResult<TData>(response: Response): Promise<ApiResult<TData>> {
    const text = await response.text();

    try {
        return normalizeApiResult<TData>(JSON.parse(text));
    } catch {
        return { success: false, error: `Server returned HTTP ${response.status}.` };
    }
}

function normalizeApiResult<TData>(value: unknown): ApiResult<TData> {
    if (isRecord(value) && value.success === true) {
        return { success: true, data: value.data as TData };
    }

    if (isRecord(value) && value.success === false) {
        return { success: false, error: toErrorMessage(value.error) };
    }

    return { success: false, error: "Unexpected server response." };
}

function toErrorMessage(error: unknown): string {
    if (typeof error === "string") {
        return error;
    }

    if (isRecord(error) && typeof error.message === "string") {
        return error.message;
    }

    if (isRecord(error) && typeof error.error === "string") {
        return error.error;
    }

    try {
        return JSON.stringify(error);
    } catch {
        return "Unexpected error.";
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function createClientId(): string {
    return crypto.randomUUID();
}

function getScriptBlocks(script: ScriptDocument): ScriptBlock[] {
    return script.blocks.length > 0 ? script.blocks : createBlocksFromImportedText(script.content);
}

function renderScriptLines(script: ScriptDocument): PromptLine[] {
    const blocks = getScriptBlocks(script);

    return blocks.flatMap((block, blockIndex) => {
        const heading: PromptLine[] = [
            {
                id: `${block.id}-heading`,
                spans: [{ id: `${block.id}-heading-text`, text: block.title }],
                className: "block-heading",
                blockId: block.id,
                isHeading: true
            }
        ];
        const body = splitSpansIntoLines(block.content.spans).map((spans, lineIndex) => createPromptLine(`${block.id}-${blockIndex}-${lineIndex}`, spans, block.id));

        return [...heading, ...body];
    });
}

function createPromptLine(id: string, spans: RichTextSpan[], blockId: string): PromptLine {
    const text = spans.map((span) => span.text).join("").trim();

    if (text === "---") {
        return { id, spans: [{ id: `${id}-divider`, text: "" }], className: "divider", blockId, isHeading: false };
    }

    if (text === "[PAUSA]") {
        return { id, spans: [{ id: `${id}-pause`, text: "PAUSA" }], className: "pause-marker", blockId, isHeading: false };
    }

    if (text.startsWith("[VTR:")) {
        return { id, spans: [{ id: `${id}-cue`, text: text.replace("[VTR:", "").replace("]", "").trim() }], className: "cue", blockId, isHeading: false };
    }

    if (text.startsWith("(") && text.endsWith(")")) {
        return { id, spans, className: "note", blockId, isHeading: false };
    }

    return { id, spans: stripBoldMarkers(spans), className: text.startsWith("**") ? "bold" : "copy", blockId, isHeading: false };
}

function splitSpansIntoLines(spans: RichTextSpan[]): RichTextSpan[][] {
    const lines: RichTextSpan[][] = [[]];

    spans.forEach((span) => {
        const parts = span.text.split("\n");
        parts.forEach((part, index) => {
            if (index > 0) {
                lines.push([]);
            }

            lines[lines.length - 1].push({ ...span, id: `${span.id}-${index}-${lines.length}`, text: part });
        });
    });

    return lines;
}

function stripBoldMarkers(spans: RichTextSpan[]): RichTextSpan[] {
    return spans.map((span) => ({ ...span, text: span.text.replaceAll("**", "") }));
}

function spanClassName(span: RichTextSpan): string {
    return ["rich-span", span.textColor ? `text-${span.textColor}` : "", span.backgroundColor ? `bg-${span.backgroundColor}` : ""].filter(Boolean).join(" ");
}

function spansToEditorHtml(spans: RichTextSpan[]): string {
    return spans
        .map((span) => `<span class="${spanClassName(span)}">${escapeHtml(span.text)}</span>`)
        .join("");
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;")
        .replaceAll("\n", "<br>");
}

function createRichTextContent(text: string): ScriptBlock["content"] {
    return {
        spans: [
            {
                id: createClientId(),
                text
            }
        ]
    };
}

function createEmptyBlock(index: number): ScriptBlock {
    return {
        id: createClientId(),
        title: `Block ${index}`,
        content: createRichTextContent("")
    };
}

function createBlocksFromImportedText(text: string): ScriptBlock[] {
    const sections = text
        .split(/\n-{3,}\n/g)
        .map((section) => section.trim())
        .filter(Boolean);
    const source = sections.length > 0 ? sections : [text];

    return source.map((section, index) => ({
        id: createClientId(),
        title: source.length === 1 ? "Script" : `Block ${index + 1}`,
        content: createRichTextContent(section)
    }));
}

function cloneBlocks(script: ScriptDocument): ScriptBlock[] {
    const blocks = script.blocks.length > 0 ? script.blocks : createBlocksFromImportedText(script.content);

    return blocks.map((block) => ({
        id: block.id,
        title: block.title,
        content: {
            spans: block.content.spans.map((span) => ({ ...span }))
        }
    }));
}

function blocksSignature(blocks: ScriptBlock[]): string {
    return JSON.stringify(blocks);
}

function blockToPlainText(block: ScriptBlock): string {
    return block.content.spans.map((span) => span.text).join("");
}

function applyColorToSpans(spans: RichTextSpan[], start: number, end: number, kind: "textColor" | "backgroundColor", token: RichTextColorToken): RichTextSpan[] {
    let cursor = 0;
    const next: RichTextSpan[] = [];

    spans.forEach((span) => {
        const spanStart = cursor;
        const spanEnd = cursor + span.text.length;
        cursor = spanEnd;

        if (spanEnd <= start || spanStart >= end) {
            next.push(span);
            return;
        }

        const before = span.text.slice(0, Math.max(0, start - spanStart));
        const selected = span.text.slice(Math.max(0, start - spanStart), Math.min(span.text.length, end - spanStart));
        const after = span.text.slice(Math.min(span.text.length, end - spanStart));

        if (before) {
            next.push({ ...span, id: createClientId(), text: before });
        }

        if (selected) {
            const styled = { ...span, id: createClientId(), text: selected };

            if (token === "default") {
                delete styled[kind];
            } else {
                styled[kind] = token;
            }

            next.push(styled);
        }

        if (after) {
            next.push({ ...span, id: createClientId(), text: after });
        }
    });

    return next;
}
