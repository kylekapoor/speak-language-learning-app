import { describe, expect, it } from "vitest";
import { durationMs, level, pcmSamples } from "./pcm.ts";

function wavBytes(samples: number[], withHeader: boolean): Uint8Array {
  const header = withHeader ? 44 : 0;
  const bytes = new Uint8Array(header + samples.length * 2);
  if (withHeader) bytes.set([0x52, 0x49, 0x46, 0x46]); // "RIFF"
  const view = new DataView(bytes.buffer);
  samples.forEach((s, i) => view.setInt16(header + i * 2, s, true));
  return bytes;
}

describe("pcm helpers", () => {
  it("skips the WAV header only on chunks that carry one", () => {
    expect(Array.from(pcmSamples(wavBytes([1, -2, 3], true)))).toEqual([1, -2, 3]);
    expect(Array.from(pcmSamples(wavBytes([1, -2, 3], false)))).toEqual([1, -2, 3]);
  });

  it("converts sample counts to milliseconds at 16 kHz", () => {
    expect(durationMs(new Int16Array(16_000))).toBe(1000);
  });

  it("maps silence to 0 and loud audio to 1", () => {
    expect(level(new Int16Array(100))).toBe(0);
    expect(level(new Int16Array(100).fill(30_000))).toBe(1);
    const speech = level(new Int16Array(100).fill(3_000)); // about -21 dBFS
    expect(speech).toBeGreaterThan(0.7);
    expect(speech).toBeLessThan(1);
  });
});
