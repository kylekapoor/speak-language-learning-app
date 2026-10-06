// Helpers for the 16 kHz, 16-bit mono PCM WAV stream in the mock audio.

export const SAMPLE_RATE = 16_000;
const BYTES_PER_SAMPLE = 2;
const WAV_HEADER_BYTES = 44;

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const hasWavHeader = (bytes: Uint8Array) =>
  bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46; // "RIFF"

/** Strips the WAV header that only the first chunk of a stream carries. */
export function pcmSamples(bytes: Uint8Array): Int16Array {
  const start = hasWavHeader(bytes) ? WAV_HEADER_BYTES : 0;
  const sampleCount = Math.floor((bytes.length - start) / BYTES_PER_SAMPLE);
  const view = new DataView(bytes.buffer, bytes.byteOffset + start, sampleCount * BYTES_PER_SAMPLE);
  const samples = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) samples[i] = view.getInt16(i * BYTES_PER_SAMPLE, true);
  return samples;
}

export function durationMs(samples: Int16Array): number {
  return (samples.length / SAMPLE_RATE) * 1000;
}

const FLOOR_DB = -60;
const CEILING_DB = -15;

/** Loudness of a chunk mapped to 0..1 on a dB scale, for the level meter. */
export function level(samples: Int16Array): number {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (const s of samples) sumSquares += (s / 32768) ** 2;
  const rms = Math.sqrt(sumSquares / samples.length);
  const db = 20 * Math.log10(rms || 1e-9);
  return Math.min(1, Math.max(0, (db - FLOOR_DB) / (CEILING_DB - FLOOR_DB)));
}
