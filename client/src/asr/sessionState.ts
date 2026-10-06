// State of one recording on the lesson page, as a pure reducer.
//
//   idle ──start──▶ connecting ──started──▶ recording ──stopping──▶ finishing
//                       │                       │                       │
//                       └───────failed──────────┴──────failed───────────┤
//                                               │                       │
//                         result(isFinal) ──────┴───────────────────────┴──▶ done
//
// `error` and `done` both accept `start` again.

export type Phase = "idle" | "connecting" | "recording" | "finishing" | "done" | "error";

export interface Transcript {
  text: string;
  isFinal: boolean;
}

export interface SessionError {
  title: string;
  detail?: string;
}

export interface SessionState {
  phase: Phase;
  /** Only the most recent result is kept: each one supersedes the last. */
  transcript: Transcript | null;
  error: SessionError | null;
  /** Recent input levels (0..1), newest last, for the live waveform. */
  levels: number[];
  elapsedMs: number;
}

export type SessionEvent =
  | { type: "start" }
  | { type: "started" }
  | { type: "audio"; level: number; elapsedMs: number }
  | { type: "stopping" }
  | { type: "result"; text: string; isFinal: boolean }
  | { type: "settled" }
  | { type: "failed"; error: SessionError };

export const LEVEL_HISTORY = 40;

export const initialSessionState: SessionState = {
  phase: "idle",
  transcript: null,
  error: null,
  levels: [],
  elapsedMs: 0,
};

const isActive = (phase: Phase) =>
  phase === "connecting" || phase === "recording" || phase === "finishing";

export function sessionReducer(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case "start":
      return isActive(state.phase) ? state : { ...initialSessionState, phase: "connecting" };

    case "started":
      return state.phase === "connecting" ? { ...state, phase: "recording" } : state;

    case "audio":
      if (state.phase !== "recording") return state;
      return {
        ...state,
        levels: [...state.levels, event.level].slice(-LEVEL_HISTORY),
        elapsedMs: event.elapsedMs,
      };

    case "stopping":
      return state.phase === "recording" ? { ...state, phase: "finishing" } : state;

    case "result":
      if (state.phase !== "recording" && state.phase !== "finishing") return state;
      return {
        ...state,
        transcript: { text: event.text, isFinal: event.isFinal },
        phase: event.isFinal ? "done" : state.phase,
      };

    case "settled":
      return state.phase === "finishing" ? { ...state, phase: "done" } : state;

    case "failed":
      return isActive(state.phase) ? { ...state, phase: "error", error: event.error } : state;
  }
}
