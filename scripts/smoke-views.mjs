import process from "node:process";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const suffix = Date.now().toString(36);

const room = await post("/api/rooms", {
    name: `View Smoke ${suffix}`,
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
    clientId: `producer-view-${suffix}`
});
const host = await post("/api/rooms/join", {
    code,
    role: "host",
    pin: "5678",
    displayName: "Host",
    clientId: `host-view-${suffix}`
});
const viewer = await post("/api/rooms/join", {
    code,
    role: "viewer",
    pin: "9012",
    displayName: "Viewer",
    clientId: `viewer-view-${suffix}`
});
const producerSnapshot = await getSnapshot(code, producer.token);

assert(producerSnapshot.followers.some((presence) => presence.role === "host"), "producer sees host presence");
assert(producerSnapshot.followers.some((presence) => presence.role === "viewer"), "producer sees viewer presence");
assert(host.snapshot.activeHostClientId === `host-view-${suffix}`, "host claims active host ownership");
assert(viewer.snapshot.code === code, "viewer receives room snapshot");

await expectPatchReject(code, producer.token, { playback: { isPlaying: true, speed: 2, scrollTop: 10, scrollRatio: 0.1 } });
await expectPatchReject(code, host.token, { signal: { type: "GO", value: null, expiresAt: null } });
await expectPatchReject(code, host.token, { scriptBlocks: [{ id: crypto.randomUUID(), title: "Blocked", content: { spans: [{ id: `blocked-span-${suffix}`, text: "no" }] } }] });
await expectPatchReject(code, viewer.token, { script: "viewer cannot write" });
await expectPatchReject(code, viewer.token, { config: { fontSize: 80 } });

console.log(`Smoke views passed for room ${code}`);

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

async function getSnapshot(code, token) {
    const response = await fetch(`${baseUrl}/api/rooms/${code}`, {
        headers: {
            authorization: `Bearer ${token}`
        }
    });
    const result = await readJson(response);

    if (!result.success) {
        throw new Error(result.error);
    }

    return result.data;
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
