import { createHmac } from "crypto";
import type { Role } from "@/types/teleprompter";

export type InviteClaims = {
    roomId: string;
    role: Role;
    purpose: "room-invite";
};

export function createInviteTokens(roomId: string): Record<Role, string> {
    return {
        producer: signInviteToken({ roomId, role: "producer", purpose: "room-invite" }),
        host: signInviteToken({ roomId, role: "host", purpose: "room-invite" }),
        viewer: signInviteToken({ roomId, role: "viewer", purpose: "room-invite" })
    };
}

export function signInviteToken(claims: InviteClaims): string {
    const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
    const signature = createHmac("sha256", getTokenSecret()).update(`invite:${payload}`).digest("base64url");

    return `${payload}.${signature}`;
}

export function verifyInviteToken(token: string, roomId: string, role: Role): boolean {
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
