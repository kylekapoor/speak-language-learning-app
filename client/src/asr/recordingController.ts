import type { AsrServerMessage, AsrStartMessage } from "../../../shared/asr.ts";
import { MockMicrophone, type AudioChunk } from "../audio/mockMicrophone.ts";
import { SAMPLE_RATE } from "../audio/pcm.ts";
import { AsrSocket } from "./asrSocket.ts";
import { describeAsrError, describeProxyError } from "./errors.ts";
import type { SessionError, SessionEvent } from "./sessionState.ts";

/** How long to wait for asrMetadata after asrStart. */
const START_TIMEOUT_MS = 8_000;
/** How long to wait for the final asrResult after the last chunk is sent. */
const FINAL_RESULT_TIMEOUT_MS = 5_000;

/**
 * Drives one lesson's recordings: owns the socket, the microphone and the
 * protocol timers, and reports progress as SessionEvents. Kept outside React
 * so the protocol logic doesn't depend on render timing.
 */
export class RecordingController {
  private readonly socket: AsrSocket;
  private readonly mic = new MockMicrophone();
  private readonly lessonId: string;
  private readonly emit: (event: SessionEvent) => void;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** True from start() until the session finishes or fails. */
  private active = false;
  /** True once asrMetadata arrives; results before that belong to an earlier session. */
  private streaming = false;
  /** True once the final chunk is sent, which is what ends the session upstream. */
  private finalSent = false;

  constructor(lessonId: string, emit: (event: SessionEvent) => void) {
    this.lessonId = lessonId;
    this.emit = emit;
    this.socket = new AsrSocket({
      onMessage: (message) => this.handleMessage(message),
      onClose: () => {
        if (this.active) this.fail({ title: "Connection lost", detail: "Tap the mic to try again." });
      },
    });
  }

  async start(): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.finalSent = false;
    this.emit({ type: "start" });

    try {
      await this.socket.ensureOpen();
    } catch {
      this.fail({ title: "Couldn't connect", detail: "Check that the server is running." });
      return;
    }
    if (!this.active) return; // disposed while connecting

    this.socket.send(this.startMessage());
    this.armTimer(START_TIMEOUT_MS, () =>
      this.fail({ title: "The speech service didn't respond", detail: "Please try again." }),
    );
  }

  /** User tapped stop: the mic flushes one last chunk marked final. */
  stop(): void {
    this.mic.stop();
  }

  dispose(): void {
    this.end();
    this.socket.close();
  }

  private handleMessage(message: AsrServerMessage): void {
    if (!this.active) return;

    switch (message.type) {
      case "asrMetadata":
        if (this.streaming) return;
        this.streaming = true;
        clearTimeout(this.timer);
        this.emit({ type: "started" });
        this.mic.start((chunk) => this.sendChunk(chunk)).catch(() =>
          this.fail({ title: "Couldn't load the sample audio", detail: "Please try again." }),
        );
        break;

      case "asrResult": {
        if (!this.streaming) return;
        this.emit({ type: "result", text: message.text, isFinal: message.isFinal });
        if (!message.isFinal) break;
        const sessionStillOpen = !this.finalSent;
        this.end();
        // The recognizer finished before our last chunk went out, so the session is
        // still open upstream. Drop the socket so the next recording starts clean.
        if (sessionStillOpen) this.socket.close();
        break;
      }

      case "asrError":
        this.fail(describeAsrError(message.message));
        break;

      case "proxyError":
        this.fail(describeProxyError(message.code, message.message));
        break;
    }
  }

  private sendChunk(chunk: AudioChunk): void {
    this.socket.send({ type: "asrStream", chunk: chunk.data, isFinal: chunk.isFinal });
    this.emit({ type: "audio", level: chunk.level, elapsedMs: chunk.elapsedMs });
    if (!chunk.isFinal) return;

    this.finalSent = true;
    this.emit({ type: "stopping" });
    this.armTimer(FINAL_RESULT_TIMEOUT_MS, () => {
      // No final result: keep the last partial one, and drop the connection
      // so a lingering upstream session can't collide with the next one.
      this.emit({ type: "settled" });
      this.end();
      this.socket.close();
    });
  }

  private startMessage(): AsrStartMessage {
    return {
      type: "asrStart",
      lessonId: this.lessonId,
      learningLocale: "en-US",
      metadata: {
        // Lessons in course.json have no individual lines, so the line is a placeholder.
        recording: { lessonId: this.lessonId, lineId: "line-1" },
        deviceAudio: { inputSampleRate: SAMPLE_RATE },
      },
    };
  }

  private fail(error: SessionError): void {
    if (!this.active) return; // already finished, or disposed
    this.end();
    // Start the next attempt on a fresh connection, so no stale messages
    // from this session can leak into it.
    this.socket.close();
    this.emit({ type: "failed", error });
  }

  private end(): void {
    this.active = false;
    this.streaming = false;
    clearTimeout(this.timer);
    this.mic.abort();
  }

  private armTimer(ms: number, onTimeout: () => void): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(onTimeout, ms);
  }
}
