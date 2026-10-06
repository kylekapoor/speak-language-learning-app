// Wire protocol for the streaming speech recognition (ASR) WebSocket.
//
// The browser talks to our server at ASR_WS_PATH. The server proxies every
// message verbatim to the upstream ASR host (adding the auth headers browsers
// can't set) and relays upstream messages back. The only messages the proxy
// originates itself are `proxyError`s.

export const ASR_WS_PATH = "/ws/asr";

// ---- Client -> upstream ----

export interface AsrStartMessage {
  type: "asrStart";
  lessonId: string;
  learningLocale: string;
  metadata: {
    recording: { lessonId: string; lineId: string };
    deviceAudio: { inputSampleRate: number };
  };
}

export interface AsrStreamMessage {
  type: "asrStream";
  /** Base64-encoded slice of a 16 kHz mono 16-bit PCM WAV stream. */
  chunk: string;
  isFinal: boolean;
}

export type AsrClientMessage = AsrStartMessage | AsrStreamMessage;

// ---- Upstream -> client ----

export interface AsrMetadataMessage {
  type: "asrMetadata";
  id: string;
  recordingId: string;
}

export interface AsrResultMessage {
  type: "asrResult";
  id: string;
  text: string;
  isFinal: boolean;
}

export interface AsrErrorMessage {
  type: "asrError";
  message: string;
}

// ---- Proxy -> client ----

export type ProxyErrorCode =
  | "invalidMessage"
  | "upstreamUnavailable"
  | "upstreamClosed";

export interface ProxyErrorMessage {
  type: "proxyError";
  code: ProxyErrorCode;
  message: string;
}

export type AsrServerMessage =
  | AsrMetadataMessage
  | AsrResultMessage
  | AsrErrorMessage
  | ProxyErrorMessage;
