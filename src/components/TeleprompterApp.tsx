"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Copy, Expand, FileUp, Link2, LogIn, Pause, Play, Radio, RotateCcw, Send, Settings, Square, Users } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import type { ApiResult, JoinedRoom, MasterPatch, Role, RoomConfig, RoomSnapshot, SignalType } from "@/types/teleprompter";
import "./teleprompter.css";

type Session = {
    token: string;
    role: Role;
    clientId: string;
    realtimeTopic: string;
    snapshot: RoomSnapshot;
};

type CreatedRoom = {
    token: string;
    clientId: string;
    realtimeTopic: string;
    snapshot: RoomSnapshot;
};

type JoinForm = {
    code: string;
    role: Role;
    pin: string;
    displayName: string;
};

type CopyTarget = "room" | "producer" | "host" | "viewer" | null;

const initialJoinForm: JoinForm = {
    code: "",
    role: "viewer",
    pin: "",
    displayName: "Remote"
};

const signalTypes = ["30s", "60s", "WRAP", "STANDBY", "GO"] as const;

export function TeleprompterApp() {
    const [roomName, setRoomName] = useState("Roxom.TV Live Desk");
    const [producerPin, setProducerPin] = useState("");
    const [hostPin, setHostPin] = useState("");
    const [viewerPin, setViewerPin] = useState("");
    const [joinForm, setJoinForm] = useState<JoinForm>(initialJoinForm);
    const [session, setSession] = useState<Session | null>(null);
    const [createdRoom, setCreatedRoom] = useState<CreatedRoom | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState<CopyTarget>(null);
    const channelRef = useRef<BroadcastChannel | null>(null);
    const realtimeChannelRef = useRef<ReturnType<NonNullable<ReturnType<typeof createBrowserSupabaseClient>>["channel"]> | null>(null);
    const activeRoomCode = session?.snapshot.code;
    const activeRealtimeTopic = session?.realtimeTopic;

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const room = normalizeRoomCode(params.get("room") ?? "");
        const role = parseRole(params.get("role"));

        if (!room && !role) {
            return;
        }

        setJoinForm((current) => ({
            ...current,
            code: room || current.code,
            role: role ?? current.role
        }));
    }, []);

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
                snapshot: joined.data.snapshot
            });
        } else {
            setError(joined.error);
        }

        setBusy(false);
    }, [hostPin, producerPin, roomName, viewerPin]);

    const enterCreatedRoom = useCallback(() => {
        if (!createdRoom) {
            return;
        }

        setSession({
            token: createdRoom.token,
            role: "producer",
            clientId: createdRoom.clientId,
            realtimeTopic: createdRoom.realtimeTopic,
            snapshot: createdRoom.snapshot
        });
        setCreatedRoom(null);
    }, [createdRoom]);

    const joinRoom = useCallback(async () => {
        setBusy(true);
        setError(null);

        const clientId = createClientId();
        const result = await postJson<JoinedRoom>("/api/rooms/join", {
            ...joinForm,
            clientId
        });

        if (result.success) {
            setSession({
                token: result.data.token,
                role: joinForm.role,
                clientId,
                realtimeTopic: result.data.realtimeTopic,
                snapshot: result.data.snapshot
            });
        } else {
            setError(result.error);
        }

        setBusy(false);
    }, [joinForm]);

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
                        copied={copied}
                        onCopy={(target, value) => void copyToClipboard(target, value, setCopied)}
                        onEnter={enterCreatedRoom}
                        onBack={() => setCreatedRoom(null)}
                    />
                    {error ? <p className="error">{error}</p> : null}
                </main>
            );
        }

        return (
            <main className="shell">
                <section className="entry">
                    <div className="brand">
                        <span>ROXOM.TV</span>
                        <h1>Teleprompter</h1>
                    </div>
                    <div className="entry-grid">
                        <form
                            className="panel"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void createRoom();
                            }}
                        >
                            <h2>Create room</h2>
                            <label>
                                Room name
                                <input value={roomName} onChange={(event) => setRoomName(event.target.value)} />
                            </label>
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
                            <button type="submit" className="primary" disabled={busy}>
                                <Users size={18} /> Create
                            </button>
                        </form>
                        <form
                            className="panel"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void joinRoom();
                            }}
                        >
                            <h2>Join room</h2>
                            <label>
                                Room code
                                <input
                                    value={joinForm.code}
                                    onChange={(event) => setJoinForm({ ...joinForm, code: normalizeRoomCode(event.target.value) })}
                                    inputMode="text"
                                    autoComplete="off"
                                />
                            </label>
                            <div className="segmented">
                                <button type="button" className={joinForm.role === "producer" ? "active" : ""} onClick={() => setJoinForm({ ...joinForm, role: "producer" })}>
                                    Producer
                                </button>
                                <button type="button" className={joinForm.role === "host" ? "active" : ""} onClick={() => setJoinForm({ ...joinForm, role: "host" })}>
                                    Host
                                </button>
                                <button type="button" className={joinForm.role === "viewer" ? "active" : ""} onClick={() => setJoinForm({ ...joinForm, role: "viewer" })}>
                                    Viewer
                                </button>
                            </div>
                            <label>
                                Display name
                                <input value={joinForm.displayName} onChange={(event) => setJoinForm({ ...joinForm, displayName: event.target.value })} />
                            </label>
                            <label>
                                PIN
                                <input type="password" value={joinForm.pin} onChange={(event) => setJoinForm({ ...joinForm, pin: event.target.value })} />
                            </label>
                            <button type="submit" className="primary" disabled={busy}>
                                <LogIn size={18} /> Join
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
                <button onClick={onLeave}>Leave</button>
            </div>
        </header>
    );
}

function RoomReady({
    room,
    copied,
    onCopy,
    onEnter,
    onBack
}: {
    room: RoomSnapshot;
    copied: CopyTarget;
    onCopy: (target: Exclude<CopyTarget, null>, value: string) => void;
    onEnter: () => void;
    onBack: () => void;
}) {
    const producerLink = buildInviteLink(room.code, "producer");
    const hostLink = buildInviteLink(room.code, "host");
    const viewerLink = buildInviteLink(room.code, "viewer");

    return (
        <section className="entry ready">
            <div className="brand compact">
                <span>ROOM READY</span>
                <h1>{room.code}</h1>
            </div>
            <div className="ready-actions">
                <button className="primary" onClick={() => onCopy("room", room.code)}>
                    {copied === "room" ? <Check size={18} /> : <Copy size={18} />} Copy Room ID
                </button>
                <button onClick={() => onCopy("producer", producerLink)}>
                    {copied === "producer" ? <Check size={18} /> : <Link2 size={18} />} Producer link
                </button>
                <button onClick={() => onCopy("host", hostLink)}>
                    {copied === "host" ? <Check size={18} /> : <Link2 size={18} />} Host link
                </button>
                <button onClick={() => onCopy("viewer", viewerLink)}>
                    {copied === "viewer" ? <Check size={18} /> : <Link2 size={18} />} Viewer link
                </button>
            </div>
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
    const configTimerRef = useRef<number | null>(null);
    const pendingConfigRef = useRef<Partial<RoomConfig>>({});
    const [draft, setDraft] = useState(snapshot.script.content);
    const [customSignal, setCustomSignal] = useState("");
    const [copied, setCopied] = useState<CopyTarget>(null);
    const [configDraft, setConfigDraft] = useState(snapshot.config);
    const draftChanged = draft !== snapshot.script.content;
    const hostCount = snapshot.followers.filter((presence) => presence.role === "host").length;
    const viewerCount = snapshot.followers.filter((presence) => presence.role === "viewer").length;

    useEffect(() => {
        setDraft(snapshot.script.content);
    }, [snapshot.script.contentVersion, snapshot.script.content]);

    useEffect(() => {
        if (configTimerRef.current === null) {
            setConfigDraft(snapshot.config);
        }
    }, [snapshot.config.defaultSpeed, snapshot.config.fontSize, snapshot.config.guidePosition, snapshot.config.lineHeight, snapshot.config.marginPercent, snapshot.config.theme, snapshot.config]);

    useEffect(() => {
        return () => {
            if (configTimerRef.current !== null) {
                window.clearTimeout(configTimerRef.current);
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

    const updateConfig = useCallback(
        (config: Partial<RoomConfig>) => {
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

    const sendSignal = useCallback(
        (type: SignalType, value: string | null) => {
            const expiresAt = type === "30s" || type === "60s" ? new Date(Date.now() + Number.parseInt(type, 10) * 1000).toISOString() : null;
            void onPatch({ signal: { type, value, expiresAt } });
        },
        [onPatch]
    );

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
                        <button onClick={() => void copyToClipboard("host", buildInviteLink(snapshot.code, "host"), setCopied)}>
                            {copied === "host" ? <Check size={16} /> : <Link2 size={16} />} Host
                        </button>
                        <button onClick={() => void copyToClipboard("viewer", buildInviteLink(snapshot.code, "viewer"), setCopied)}>
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
                    <span className="section-label">Prompt settings</span>
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
            </aside>
            <section className="editor-panel">
                <div className="panel-header">
                    <span>{draftChanged ? "Draft changed" : "Published"}</span>
                    <label className="file-button">
                        <FileUp size={18} /> Import
                        <input type="file" accept=".txt,.md" onChange={(event) => void importFile(event.currentTarget.files?.[0], setDraft)} />
                    </label>
                    <button className="primary" onClick={() => void onPatch({ script: draft })}>Publish</button>
                </div>
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
            </section>
            <PromptDisplay snapshot={snapshot} scrollRef={previewRef} mode="master" />
        </section>
    );
}

function HostView({ session, onPatch }: { session: Session; onPatch: (patch: MasterPatch) => Promise<void> }) {
    const { snapshot } = session;
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const lastSentRef = useRef(0);
    const playbackIntentRef = useRef(snapshot.lastState.isPlaying);

    useEffect(() => {
        playbackIntentRef.current = snapshot.lastState.isPlaying;
    }, [snapshot.lastState.isPlaying]);

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

    const jumpTop = useCallback(() => {
        playbackIntentRef.current = false;

        if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
        }

        publishHostScroll({ forcePaused: true });
    }, [publishHostScroll]);

    const nudge = useCallback(
        (direction: -1 | 1, distance = 120) => {
            const node = scrollRef.current;

            if (!node) {
                return;
            }

            node.scrollTop = Math.max(0, node.scrollTop + direction * distance);
            publishHostScroll();
        },
        [publishHostScroll]
    );

    const handleHostScroll = useCallback(() => {
        publishHostScroll({ throttle: true });
    }, [publishHostScroll]);

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
                nudge(-1, 360);
            } else if (event.key === "PageDown") {
                event.preventDefault();
                nudge(1, 360);
            } else if (event.key === "Home") {
                event.preventDefault();
                jumpTop();
            } else if (event.key === "Escape") {
                event.preventDefault();
                pause();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [jumpTop, nudge, pause, play]);

    const stop = useCallback(() => {
        playbackIntentRef.current = false;
        const scroll = getScrollSnapshot();
        void onPatch({ playback: { ...scroll, isPlaying: false, speed: 0 } });
    }, [getScrollSnapshot, onPatch]);

    return (
        <section className="host-layout">
            <div className="host-tools">
                <span className={snapshot.lastState.isPlaying ? "pill live" : "pill"}>{snapshot.lastState.isPlaying ? "Live scrolling" : "Paused"}</span>
                <span className="pill">{Math.round(snapshot.lastState.scrollRatio * 100)}%</span>
                <button className="primary" title="Space" onClick={snapshot.lastState.isPlaying ? pause : play}>
                    {snapshot.lastState.isPlaying ? <Pause size={18} /> : <Play size={18} />}
                    {snapshot.lastState.isPlaying ? "Pause" : "Play"}
                </button>
                <button title="Home" onClick={jumpTop}>
                    <RotateCcw size={18} /> Top
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
    const lines = useMemo(() => renderScriptLines(snapshot.script.content), [snapshot.script.content]);
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
                    <p key={line.id} className={line.className}>
                        {line.text}
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

function buildInviteLink(code: string, role: Role): string {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("room", code);
    url.searchParams.set("role", role);

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

async function importFile(file: File | undefined, setDraft: (value: string) => void): Promise<void> {
    if (!file) {
        return;
    }

    setDraft(await file.text());
}

function createClientId(): string {
    return crypto.randomUUID();
}

function renderScriptLines(content: string): Array<{ id: string; text: string; className: string }> {
    return content.split("\n").map((rawLine, index) => {
        const line = rawLine.trim();
        const id = `${index}-${line}`;

        if (line === "---") {
            return { id, text: "", className: "divider" };
        }

        if (line === "[PAUSA]") {
            return { id, text: "PAUSA", className: "pause-marker" };
        }

        if (line.startsWith("[VTR:")) {
            return { id, text: line.replace("[VTR:", "").replace("]", "").trim(), className: "cue" };
        }

        if (line.startsWith("(") && line.endsWith(")")) {
            return { id, text: line, className: "note" };
        }

        return { id, text: line.replaceAll("**", ""), className: line.startsWith("**") ? "bold" : "copy" };
    });
}
