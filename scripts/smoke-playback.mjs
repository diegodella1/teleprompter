import process from "node:process";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const suffix = Date.now().toString(36);

const room = await post("/api/rooms", {
    name: `Smoke ${suffix}`,
    producerPin: "1234",
    hostPin: "5678",
    viewerPin: "9012"
});
const code = room.code;
const producer = await post("/api/rooms/join", {
    code,
    role: "producer",
    pin: "1234",
    displayName: "Producer",
    clientId: `producer-${suffix}`
});
const host = await post("/api/rooms/join", {
    code,
    role: "host",
    pin: "5678",
    displayName: "Host",
    clientId: `host-${suffix}`
});
const viewer = await post("/api/rooms/join", {
    code,
    role: "viewer",
    pin: "9012",
    displayName: "Talent",
    clientId: `viewer-${suffix}`
});

assert(Boolean(producer.realtimeTopic), "producer realtime topic");
assert(Boolean(host.realtimeTopic), "host realtime topic");
assert(Boolean(viewer.realtimeTopic), "viewer realtime topic");
await expectReject("/api/rooms/join", {
    code,
    role: "viewer",
    pin: "wrong-pin",
    displayName: "Rejected",
    clientId: `rejected-${suffix}`
});

await expectPatchReject(code, producer.token, { playback: { isPlaying: true, speed: 2, scrollTop: 120, scrollRatio: 0.2 } });
await expectPatchReject(code, host.token, { script: "HOST CANNOT EDIT" });
await expectPatchReject(code, viewer.token, { signal: { type: "GO", value: null, expiresAt: null } });

await patch(code, host.token, { playback: { isPlaying: true, speed: 2, scrollTop: 120, scrollRatio: 0.2 } }, (snapshot) => {
    assert(snapshot.lastState.isPlaying === true, "play sets isPlaying true");
    assert(snapshot.lastState.speed === 2, "play sets speed");
});

await patch(code, host.token, { playback: { isPlaying: false, speed: 0, scrollTop: 130, scrollRatio: 0.22 } }, (snapshot) => {
    assert(snapshot.lastState.isPlaying === false, "pause sets isPlaying false");
    assert(snapshot.lastState.speed === 0, "pause sets speed 0");
    assert(snapshot.lastState.scrollTop === 130, "pause preserves scroll");
});

await patch(code, host.token, { playback: { isPlaying: false, speed: 0, scrollTop: 220, scrollRatio: 0.35 } }, (snapshot) => {
    assert(snapshot.lastState.isPlaying === false, "manual host scroll can stay paused");
    assert(snapshot.lastState.speed === 0, "manual paused scroll keeps speed 0");
    assert(snapshot.lastState.scrollTop === 220, "manual paused scroll publishes position");
});

await patch(code, host.token, { playback: { isPlaying: true, speed: 2, scrollTop: 260, scrollRatio: 0.42 } }, (snapshot) => {
    assert(snapshot.lastState.isPlaying === true, "manual host scroll can stay playing");
    assert(snapshot.lastState.speed === 2, "manual playing scroll preserves speed");
    assert(snapshot.lastState.scrollTop === 260, "manual playing scroll publishes position");
});

await patch(code, host.token, { playback: { isPlaying: false, speed: 0, scrollTop: 0, scrollRatio: 0 } }, (snapshot) => {
    assert(snapshot.lastState.isPlaying === false, "top stays paused");
    assert(snapshot.lastState.speed === 0, "top sets speed 0");
    assert(snapshot.lastState.scrollTop === 0, "top resets scrollTop");
    assert(snapshot.lastState.scrollRatio === 0, "top resets scrollRatio");
});

await patch(code, host.token, { playback: { isPlaying: false, speed: 0, scrollTop: 80, scrollRatio: 0.1 } }, (snapshot) => {
    assert(snapshot.lastState.isPlaying === false, "stop sets isPlaying false");
    assert(snapshot.lastState.speed === 0, "stop sets speed 0");
});

await patch(code, producer.token, { config: { fontSize: 72, guidePosition: 40, defaultSpeed: 3 } }, (snapshot) => {
    assert(snapshot.config.fontSize === 72, "config updates font size");
    assert(snapshot.config.guidePosition === 40, "config updates guide position");
    assert(snapshot.config.defaultSpeed === 3, "config updates default speed");
});

await patch(code, producer.token, { script: "**UPDATED SCRIPT**\n\n[VTR: chart]" }, (snapshot) => {
    assert(snapshot.script.content.includes("UPDATED SCRIPT"), "script updates content");
    assert(snapshot.script.contentVersion > 1, "script increments version");
});

await patch(code, producer.token, { signal: { type: "GO", value: null, expiresAt: null } }, (snapshot) => {
    assert(snapshot.activeSignal?.type === "GO", "signal becomes active");
});

await patch(code, producer.token, { clearSignal: true }, (snapshot) => {
    assert(snapshot.activeSignal === null, "signal clears");
});

console.log(`Smoke flow passed for room ${code}`);

async function post(path, body) {
    const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
    });
    const result = await readJson(response);

    if (!result.success) {
        throw new Error(result.error);
    }

    return result.data;
}

async function expectReject(path, body) {
    const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
    });

    if (response.status < 400) {
        throw new Error(`Expected rejection for ${path}`);
    }
}

async function patch(code, token, body, validate) {
    const response = await fetch(`${baseUrl}/api/rooms/${code}/master`, {
        method: "PATCH",
        headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json"
        },
        body: JSON.stringify(body)
    });
    const result = await readJson(response);

    if (!result.success) {
        throw new Error(result.error);
    }

    validate(result.data.snapshot);
}

async function expectPatchReject(code, token, body) {
    const response = await fetch(`${baseUrl}/api/rooms/${code}/master`, {
        method: "PATCH",
        headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json"
        },
        body: JSON.stringify(body)
    });

    if (response.status < 400) {
        throw new Error("Expected patch rejection");
    }
}

function assert(condition, label) {
    if (!condition) {
        throw new Error(`Assertion failed: ${label}`);
    }
}

async function readJson(response) {
    const text = await response.text();

    try {
        return JSON.parse(text);
    } catch {
        throw new Error(`Expected JSON from ${response.url}, got HTTP ${response.status}: ${text.slice(0, 160)}`);
    }
}
