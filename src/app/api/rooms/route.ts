import { NextResponse } from "next/server";
import { z } from "zod";
import { createRoom } from "@/server/room-store";
import type { ApiResult, RoomSnapshot } from "@/types/teleprompter";

const createRoomSchema = z.object({
    name: z.string().min(2).max(80),
    producerPin: z.string().min(4).max(32).optional(),
    hostPin: z.string().min(4).max(32).optional(),
    viewerPin: z.string().min(4).max(32).optional(),
    masterPin: z.string().min(4).max(32).optional(),
    followerPin: z.string().min(4).max(32).optional()
});

export async function POST(request: Request): Promise<NextResponse<ApiResult<RoomSnapshot>>> {
    try {
        const body = await request.json();
        const parsed = createRoomSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json({ success: false, error: "Invalid room details." }, { status: 400 });
        }

        const producerPin = parsed.data.producerPin ?? parsed.data.masterPin;
        const hostPin = parsed.data.hostPin ?? parsed.data.followerPin;
        const viewerPin = parsed.data.viewerPin ?? parsed.data.followerPin;

        if (!producerPin || !hostPin || !viewerPin) {
            return NextResponse.json({ success: false, error: "Missing role PINs." }, { status: 400 });
        }

        const snapshot = await createRoom(parsed.data.name, producerPin, hostPin, viewerPin);
        return NextResponse.json({ success: true, data: snapshot });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create room.";
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
