import type { PlaybackState, RoomSnapshot, ScriptDocument } from "@/types/teleprompter";

export function mergeRoomSnapshot(current: RoomSnapshot, incoming: RoomSnapshot): RoomSnapshot {
    return {
        ...incoming,
        lastState: selectLatestPlayback(current.lastState, incoming.lastState),
        script: selectLatestScript(current.script, incoming.script)
    };
}

function selectLatestPlayback(current: PlaybackState, incoming: PlaybackState): PlaybackState {
    if (incoming.sequence !== current.sequence) {
        return incoming.sequence > current.sequence ? incoming : current;
    }

    return Date.parse(incoming.updatedAt) >= Date.parse(current.updatedAt) ? incoming : current;
}

function selectLatestScript(current: ScriptDocument, incoming: ScriptDocument): ScriptDocument {
    if (incoming.contentVersion !== current.contentVersion) {
        return incoming.contentVersion > current.contentVersion ? incoming : current;
    }

    return Date.parse(incoming.updatedAt) >= Date.parse(current.updatedAt) ? incoming : current;
}
