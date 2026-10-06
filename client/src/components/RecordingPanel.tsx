import type { CSSProperties } from "react";
import { useRecordingSession } from "../asr/useRecordingSession.ts";
import { LEVEL_HISTORY, type SessionState } from "../asr/sessionState.ts";
import { AlertIcon, CheckIcon, MicIcon, StopIcon } from "./icons.tsx";

export function RecordingPanel({ lessonId }: { lessonId: string }) {
  const { state, start, stop } = useRecordingSession(lessonId);
  const { phase } = state;
  const isRecording = phase === "recording";
  const isBusy = phase === "connecting" || phase === "finishing";
  const latestLevel = state.levels.at(-1) ?? 0;

  return (
    <section className="recording-panel" aria-label="Speaking practice">
      <Transcript state={state} />

      <Waveform levels={state.levels} active={isRecording} />

      <div className="record-control">
        <button
          type="button"
          className={`record-button record-button-${phase}`}
          style={{ "--level": latestLevel } as CSSProperties}
          onClick={isRecording ? stop : start}
          disabled={isBusy}
          aria-label={isRecording ? "Stop recording" : "Record"}
        >
          {isRecording ? <StopIcon /> : <MicIcon />}
        </button>
        <p className="record-caption" aria-live="polite">
          {caption(state)}
        </p>
      </div>
      <p className="demo-note">Demo mode: plays a sample recording instead of using your mic.</p>
    </section>
  );
}

function Transcript({ state }: { state: SessionState }) {
  if (state.phase === "error" && state.error) {
    return (
      <div className="transcript transcript-error" role="alert">
        <AlertIcon className="transcript-icon" />
        <div>
          <p className="transcript-title">{state.error.title}</p>
          {state.error.detail && <p className="transcript-detail">{state.error.detail}</p>}
        </div>
      </div>
    );
  }

  const text = state.transcript?.text;
  const isFinal = state.phase === "done";
  const listening = state.phase === "recording" || state.phase === "finishing";

  return (
    <div className={`transcript ${isFinal ? "transcript-final" : ""}`} aria-live="polite">
      <p className="transcript-label">
        {isFinal ? (
          <>
            <CheckIcon className="inline-icon" /> We heard
          </>
        ) : (
          "Your answer"
        )}
      </p>
      {text ? (
        <p className={`transcript-text ${isFinal ? "" : "transcript-interim"}`}>{text}</p>
      ) : (
        <p className="transcript-placeholder">
          {isFinal
            ? "We didn't catch anything that time."
            : listening
              ? "Listening…"
              : "Tap the mic and say the phrase out loud."}
        </p>
      )}
    </div>
  );
}

function Waveform({ levels, active }: { levels: number[]; active: boolean }) {
  // Pad on the left so new levels enter from the right edge.
  const bars = [...Array(Math.max(0, LEVEL_HISTORY - levels.length)).fill(0), ...levels];
  return (
    <div className={`waveform ${active ? "waveform-active" : ""}`} aria-hidden="true">
      {bars.map((value, i) => (
        <span key={i} style={{ transform: `scaleY(${0.08 + value * 0.92})` }} />
      ))}
    </div>
  );
}

function caption({ phase, elapsedMs }: SessionState): string {
  switch (phase) {
    case "idle":
      return "Tap to record";
    case "connecting":
      return "Connecting…";
    case "recording":
      return `Recording · ${formatSeconds(elapsedMs)} · tap to stop`;
    case "finishing":
      return "Finishing up…";
    case "done":
    case "error":
      return "Tap to try again";
  }
}

const formatSeconds = (ms: number) => `0:${String(Math.floor(ms / 1000)).padStart(2, "0")}`;
