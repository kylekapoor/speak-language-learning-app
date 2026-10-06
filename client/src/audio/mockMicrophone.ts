import { base64ToBytes, durationMs, level, pcmSamples } from "./pcm.ts";

export interface AudioChunk {
  /** Base64 audio, sent upstream as-is. */
  data: string;
  /** True for the last chunk of the recording. */
  isFinal: boolean;
  /** Loudness 0..1, for visual feedback. */
  level: number;
  /** Audio captured so far, in milliseconds. */
  elapsedMs: number;
}

interface PreparedChunk {
  data: string;
  level: number;
  durationMs: number;
}

let prepared: Promise<PreparedChunk[]> | null = null;

/** Lazily loads (and code-splits) the sample recording, decoding it once. */
function loadSampleAudio(): Promise<PreparedChunk[]> {
  prepared ??= import("../assets/mock-audio.json")
    .then(({ default: events }) =>
      (events as Array<{ chunk: string }>).map(({ chunk }) => {
        const samples = pcmSamples(base64ToBytes(chunk));
        return { data: chunk, level: level(samples), durationMs: durationMs(samples) };
      }),
    )
    .catch((err) => {
      prepared = null; // allow a retry
      throw err;
    });
  return prepared;
}

/** Warms the audio cache so pressing Record doesn't wait on a download. */
export const preloadSampleAudio = () => void loadSampleAudio().catch(() => {});

/**
 * Stands in for a real microphone: replays the provided sample recording,
 * emitting each chunk once that much "real" time has passed, the way a
 * MediaRecorder/AudioWorklet pipeline would. Swapping in real capture only
 * means producing the same AudioChunk stream.
 */
export class MockMicrophone {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private emitNext: (() => void) | null = null;
  private stopRequested = false;
  /** Bumped by abort() so a start() still awaiting audio knows to bail. */
  private generation = 0;

  async start(onChunk: (chunk: AudioChunk) => void): Promise<void> {
    const generation = ++this.generation;
    const chunks = await loadSampleAudio();
    if (generation !== this.generation) return;
    this.stopRequested = false;

    const startedAt = performance.now();
    let elapsedMs = 0;
    let index = 0;

    this.emitNext = () => {
      const chunk = chunks[index++];
      elapsedMs += chunk.durationMs;
      const isFinal = this.stopRequested || index === chunks.length;
      onChunk({ data: chunk.data, isFinal, level: chunk.level, elapsedMs });

      if (isFinal) {
        this.emitNext = null;
        return;
      }
      // A chunk is ready once its audio has been "captured". Scheduling
      // against the start time keeps timer drift from accumulating.
      const dueAt = startedAt + elapsedMs + chunks[index].durationMs;
      this.timer = setTimeout(() => this.emitNext?.(), Math.max(0, dueAt - performance.now()));
    };

    this.timer = setTimeout(() => this.emitNext?.(), chunks[0].durationMs);
  }

  get isRecording(): boolean {
    return this.emitNext !== null;
  }

  /** Ends the recording: the next chunk goes out immediately, marked final. */
  stop(): void {
    if (!this.emitNext || this.stopRequested) return;
    this.stopRequested = true;
    clearTimeout(this.timer);
    this.emitNext();
  }

  /** Stops without emitting anything further (errors, unmount). */
  abort(): void {
    this.generation++;
    clearTimeout(this.timer);
    this.emitNext = null;
  }
}
