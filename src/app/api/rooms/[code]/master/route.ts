import { NextResponse } from "next/server";
import { z } from "zod";
import { applyMasterPatch } from "@/server/room-store";
import type { ApiResult, JoinedRoom } from "@/types/teleprompter";

const patchSchema = z.object({
    script: z.string().optional(),
    config: z
        .object({
            fontSize: z.number().min(28).max(120).optional(),
            lineHeight: z.number().min(1).max(2.4).optional(),
            marginPercent: z.number().min(4).max(30).optional(),
            guidePosition: z.number().min(10).max(80).optional(),
            defaultSpeed: z.number().min(0.5).max(8).optional(),
            theme: z.enum(["dark", "dim"]).optional()
        })
        .optional(),
    playback: z
        .object({
            isPlaying: z.boolean().optional(),
            scrollTop: z.number().min(0).optional(),
            scrollRatio: z.number().min(0).max(1).optional(),
            speed: z.number().min(0).max(8).optional()
        })
        .optional(),
    signal: z
        .object({
            type: z.enum(["30s", "60s", "WRAP", "STANDBY", "GO", "CUSTOM"]),
            value: z.string().nullable(),
            expiresAt: z.string().nullable()
        })
        .nullable()
        .optional(),
    clearSignal: z.boolean().optional()
});

export async function PATCH(request: Request): Promise<NextResponse<ApiResult<JoinedRoom>>> {
    try {
        const token = request.headers.get("authorization")?.replace("Bearer ", "");

        if (!token) {
            return NextResponse.json({ success: false, error: "Missing session token." }, { status: 401 });
        }

        const body = await request.json();
        const parsed = patchSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json({ success: false, error: "Invalid room update." }, { status: 400 });
        }

        const joined = await applyMasterPatch(token, parsed.data);

        if (!joined) {
            return NextResponse.json({ success: false, error: "Room update rejected for this role." }, { status: 403 });
        }

        return NextResponse.json({ success: true, data: joined });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update room.";
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
