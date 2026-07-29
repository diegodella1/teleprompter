import assert from "node:assert/strict";
import { mergeRoomSnapshot } from "../src/lib/snapshot-sync.ts";

const current = createSnapshot({
    playbackSequence: 4,
    playbackUpdatedAt: "2026-07-28T20:00:04.000Z",
    scriptVersion: 3,
    scriptUpdatedAt: "2026-07-28T20:00:03.000Z"
});
const stale = createSnapshot({
    playbackSequence: 2,
    playbackUpdatedAt: "2026-07-28T20:00:02.000Z",
    scriptVersion: 2,
    scriptUpdatedAt: "2026-07-28T20:00:02.000Z"
});
const mergedStale = mergeRoomSnapshot(current, stale);

assert.equal(mergedStale.lastState.sequence, 4);
assert.equal(mergedStale.script.contentVersion, 3);

const newer = createSnapshot({
    playbackSequence: 5,
    playbackUpdatedAt: "2026-07-28T20:00:05.000Z",
    scriptVersion: 4,
    scriptUpdatedAt: "2026-07-28T20:00:04.000Z"
});
const mergedNewer = mergeRoomSnapshot(current, newer);

assert.equal(mergedNewer.lastState.sequence, 5);
assert.equal(mergedNewer.script.contentVersion, 4);

console.log("Snapshot sync checks passed.");

function createSnapshot({ playbackSequence, playbackUpdatedAt, scriptVersion, scriptUpdatedAt }) {
    return {
        id: "room-id",
        code: "ABC123",
        name: "Sync audit",
        activeHostClientId: "host-id",
        lastState: {
            isPlaying: false,
            scrollTop: playbackSequence * 10,
            scrollRatio: playbackSequence / 10,
            speed: 0,
            sequence: playbackSequence,
            updatedAt: playbackUpdatedAt,
            masterClientId: "host-id"
        },
        script: {
            content: `Version ${scriptVersion}`,
            format: "blocks-v1",
            updatedAt: scriptUpdatedAt,
            contentVersion: scriptVersion,
            blocks: []
        },
        config: {
            fontSize: 56,
            lineHeight: 1.45,
            marginPercent: 14,
            guidePosition: 33,
            defaultSpeed: 2,
            theme: "dark"
        },
        activeSignal: null,
        followers: []
    };
}
