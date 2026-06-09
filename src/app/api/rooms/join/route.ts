import { NextResponse } from "next/server";
import { z } from "zod";
import { joinRoom } from "@/server/room-store";
import type { ApiResult, JoinedRoom, Role } from "@/types/teleprompter";

const joinSchema = z.object({
    code: z.string().min(4).max(12),
    role: z.enum(["producer", "host", "viewer"]),
    pin: z.string().min(4).max(32),
    displayName: z.string().min(2).max(40),
    clientId: z.string().min(8).max(80)
});

export async function POST(request: Request): Promise<NextResponse<ApiResult<JoinedRoom>>> {
    try {
        const body = await request.json();
        const parsed = joinSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json({ success: false, error: "Invalid join request." }, { status: 400 });
        }

        const joined = await joinRoom(
            parsed.data.code,
            parsed.data.role as Role,
            parsed.data.pin,
            parsed.data.displayName,
            parsed.data.clientId
        );

        if (!joined) {
            return NextResponse.json({ success: false, error: "Room not found or PIN rejected." }, { status: 403 });
        }

        return NextResponse.json({ success: true, data: joined });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to join room.";
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
