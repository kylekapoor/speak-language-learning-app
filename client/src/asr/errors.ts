import type { ProxyErrorCode } from "../../../shared/asr.ts";
import type { SessionError } from "./sessionState.ts";

/** Learner-facing copy for asrError codes from the upstream host. */
export function describeAsrError(code: string): SessionError {
  switch (code) {
    case "sessionAlreadyActive":
      return { title: "A recording is already in progress", detail: "Wait a moment, then try again." };
    case "matchingRequired":
      return {
        title: "The speech service didn't accept this recording",
        detail: `It replied “${code}”. Try again, or run the server with ASR_MODE=mock.`,
      };
    default:
      return { title: "Speech recognition failed", detail: `The service replied “${code}”.` };
  }
}

export function describeProxyError(code: ProxyErrorCode, message: string): SessionError {
  switch (code) {
    case "upstreamUnavailable":
      return { title: "Couldn't reach the speech service", detail: "Please try again in a moment." };
    case "upstreamClosed":
      return { title: "The speech service hung up", detail: "Tap the mic to try again." };
    case "invalidMessage":
      return { title: "Something went wrong", detail: message };
  }
}
