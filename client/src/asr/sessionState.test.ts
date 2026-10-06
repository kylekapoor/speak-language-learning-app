import { describe, expect, it } from "vitest";
import {
  initialSessionState,
  LEVEL_HISTORY,
  sessionReducer,
  type SessionEvent,
  type SessionState,
} from "./sessionState.ts";

const run = (events: SessionEvent[], from: SessionState = initialSessionState) =>
  events.reduce(sessionReducer, from);

describe("sessionReducer", () => {
  it("walks the happy path and keeps only the latest result", () => {
    const state = run([
      { type: "start" },
      { type: "started" },
      { type: "result", text: "this is", isFinal: false },
      { type: "result", text: "this is not", isFinal: false },
      { type: "stopping" },
      { type: "result", text: "This is not what we ordered.", isFinal: true },
    ]);
    expect(state.phase).toBe("done");
    expect(state.transcript).toEqual({ text: "This is not what we ordered.", isFinal: true });
  });

  it("ignores results that arrive outside an active recording", () => {
    const done = run([{ type: "start" }, { type: "started" }, { type: "result", text: "a", isFinal: true }]);
    expect(sessionReducer(done, { type: "result", text: "late", isFinal: false })).toBe(done);
  });

  it("settles on the last partial result if no final one arrives", () => {
    const state = run([
      { type: "start" },
      { type: "started" },
      { type: "result", text: "this is not", isFinal: false },
      { type: "stopping" },
      { type: "settled" },
    ]);
    expect(state.phase).toBe("done");
    expect(state.transcript?.text).toBe("this is not");
  });

  it("moves to error from any active phase, and can start again", () => {
    const error = { title: "Connection lost" };
    const failed = run([{ type: "start" }, { type: "failed", error }]);
    expect(failed).toMatchObject({ phase: "error", error });

    const retried = sessionReducer(failed, { type: "start" });
    expect(retried).toMatchObject({ phase: "connecting", error: null, transcript: null });
  });

  it("ignores start while a recording is in flight", () => {
    const recording = run([{ type: "start" }, { type: "started" }]);
    expect(sessionReducer(recording, { type: "start" })).toBe(recording);
  });

  it("keeps a bounded history of input levels", () => {
    const audio = Array.from({ length: LEVEL_HISTORY + 10 }, (_, i): SessionEvent => ({
      type: "audio",
      level: i / 100,
      elapsedMs: i * 31,
    }));
    const state = run([{ type: "start" }, { type: "started" }, ...audio]);
    expect(state.levels).toHaveLength(LEVEL_HISTORY);
    expect(state.levels.at(-1)).toBe((LEVEL_HISTORY + 9) / 100);
  });
});
