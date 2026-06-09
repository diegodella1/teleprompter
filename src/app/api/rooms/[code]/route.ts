import { NextResponse } from "next/server";
import { getRoomSnapshot } from "@/server/room-store";
import type { ApiResult, RoomSnapshot } from "@/types/teleprompter";

type RouteContext = {
    params: Promise<{
        code: string;
    }>;
};

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse<ApiResult<RoomSnapshot>>> {
    try {
        const params = await context.params;
        const token = _request.headers.get("authorization")?.replace("Bearer ", "") ?? null;
        const snapshot = await getRoomSnapshot(params.code, token);

        if (!snapshot) {
            return NextResponse.json({ success: false, error: "Room not found or session rejected." }, { status: 404 });
        }

        return NextResponse.json({ success: true, data: snapshot });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load room.";
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
