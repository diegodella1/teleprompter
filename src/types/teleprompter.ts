export type Role = "producer" | "host" | "viewer";

export type SignalType = "30s" | "60s" | "WRAP" | "STANDBY" | "GO" | "CUSTOM";

export type RichTextColorToken = "default" | "accent" | "live" | "warning" | "blue" | "violet";

export type RichTextSpan = {
    id: string;
    text: string;
    textColor?: RichTextColorToken;
    backgroundColor?: RichTextColorToken;
};

export type ScriptBlock = {
    id: string;
    title: string;
    content: {
        spans: RichTextSpan[];
    };
};

export type PlaybackState = {
    isPlaying: boolean;
    scrollTop: number;
    scrollRatio: number;
    speed: number;
    sequence: number;
    updatedAt: string;
    masterClientId: string | null;
};

export type RoomConfig = {
    fontSize: number;
    lineHeight: number;
    marginPercent: number;
    guidePosition: number;
    defaultSpeed: number;
    theme: "dark" | "dim";
};

export type ScriptDocument = {
    content: string;
    format: "text" | "markdown" | "blocks-v1";
    updatedAt: string;
    contentVersion: number;
    blocks: ScriptBlock[];
};

export type Signal = {
    id: string;
    type: SignalType;
    value: string | null;
    expiresAt: string | null;
    createdAt: string;
};

export type ClientPresence = {
    clientId: string;
    role: Role;
    displayName: string;
    joinedAt: string;
};

export type RoomSnapshot = {
    id: string;
    code: string;
    name: string;
    activeHostClientId: string | null;
    lastState: PlaybackState;
    script: ScriptDocument;
    config: RoomConfig;
    activeSignal: Signal | null;
    followers: ClientPresence[];
};

export type JoinedRoom = {
    snapshot: RoomSnapshot;
    token: string;
    realtimeTopic: string;
};

export type MasterPatch = {
    script?: string;
    scriptBlocks?: ScriptBlock[];
    config?: Partial<RoomConfig>;
    playback?: Partial<Pick<PlaybackState, "isPlaying" | "scrollTop" | "scrollRatio" | "speed">>;
    signal?: Pick<Signal, "type" | "value" | "expiresAt"> | null;
    clearSignal?: boolean;
};

export type ApiResult<TData> =
    | {
          success: true;
          data: TData;
      }
    | {
          success: false;
          error: string;
      };
