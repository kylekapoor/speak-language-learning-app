import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import type { AsrServerMessage } from "../../../shared/asr.ts";

/**
 * A local stand-in for the upstream ASR host that follows the documented
 * protocol: asrStart -> asrMetadata, asrStream -> asrResult (interim results
 * as words are "heard", then a final one on isFinal), and asrError when a
 * session is already active. Used for offline demos and in tests.
 *
 * Results are driven by how much audio has arrived, so pacing, partial
 * results and stopping early all behave like a real streaming recognizer.
 */

interface TimedWord {
  word: string;
  /** Seconds from the start of the recording at which the word ends. */
  end: number;
}

/**
 * What the provided assets/audio.json says, with word end times taken from
 * transcribing it offline (Whisper small.en).
 */
const SAMPLE_TRANSCRIPT: TimedWord[] = [
  { word: "this", end: 0.86 },
  { word: "is", end: 1.02 },
  { word: "not", end: 1.22 },
  { word: "what", end: 1.4 },
  { word: "we", end: 1.6 },
  { word: "ordered", end: 1.96 },
];

const WAV_HEADER_BYTES = 44;
const BYTES_PER_SECOND = 16_000 * 2; // 16 kHz, 16-bit mono

interface Session {
  id: string;
  audioBytes: number;
  wordsHeard: number;
  resultCount: number;
}

/** Starts on a free port. `latencyMs` simulates recognition delay before each result. */
export async function startMockAsrUpstream({ latencyMs = 150 } = {}) {
  const transcript = SAMPLE_TRANSCRIPT;
  const wss = new WebSocketServer({
    port: 0,
    // Mirror the real host: refuse handshakes without the required headers.
    verifyClient: ({ req }: { req: IncomingMessage }) =>
      Boolean(req.headers["x-access-token"] && req.headers["x-client-info"]),
  });
  await new Promise<void>((resolve) => wss.once("listening", resolve));

  wss.on("connection", (socket) => {
    let session: Session | null = null;
    const send = (message: AsrServerMessage) =>
      setTimeout(() => socket.readyState === socket.OPEN && socket.send(JSON.stringify(message)), latencyMs);

    socket.on("message", (data) => {
      let message: { type?: unknown; chunk?: unknown; isFinal?: unknown };
      try {
        message = JSON.parse(data.toString());
      } catch {
        return send({ type: "asrError", message: "invalidMessage" });
      }

      if (message.type === "asrStart") {
        if (session) return send({ type: "asrError", message: "sessionAlreadyActive" });
        session = { id: randomUUID(), audioBytes: 0, wordsHeard: 0, resultCount: 0 };
        return send({ type: "asrMetadata", id: session.id, recordingId: randomUUID() });
      }

      if (message.type === "asrStream") {
        if (!session) return send({ type: "asrError", message: "noActiveSession" });
        if (typeof message.chunk === "string") {
          session.audioBytes += Buffer.from(message.chunk, "base64").length;
        }
        const seconds = Math.max(0, session.audioBytes - WAV_HEADER_BYTES) / BYTES_PER_SECOND;
        const heard = transcript.filter((w) => w.end <= seconds).length;
        const isFinal = message.isFinal === true;

        if (heard > session.wordsHeard || isFinal) {
          session.wordsHeard = heard;
          const words = transcript.slice(0, heard).map((w) => w.word);
          send({
            type: "asrResult",
            id: `${session.id}:${session.resultCount++}`,
            text: isFinal ? formatFinal(words, heard === transcript.length) : words.join(" "),
            isFinal,
          });
        }
        if (isFinal) session = null;
        return;
      }

      send({ type: "asrError", message: "unsupportedMessageType" });
    });
  });

  const { port: boundPort } = wss.address() as AddressInfo;
  return {
    url: `ws://127.0.0.1:${boundPort}`,
    close: () => new Promise<void>((resolve) => wss.close(() => resolve())),
  };
}

function formatFinal(words: string[], complete: boolean): string {
  if (words.length === 0) return "";
  const sentence = words.join(" ");
  return sentence[0].toUpperCase() + sentence.slice(1) + (complete ? "." : "");
}
