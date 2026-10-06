import type { AsrClientMessage } from "../../../shared/asr.ts";

/** Generous upper bound: the mock audio chunks are ~1.4 KB once base64-encoded. */
export const MAX_CLIENT_MESSAGE_BYTES = 64 * 1024;

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export type ParseResult =
  | { ok: true; message: AsrClientMessage }
  | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0;

/**
 * Validates a browser message before it is forwarded upstream. The proxy only
 * relays the two message types the ASR protocol defines, so a buggy or
 * malicious client can't push arbitrary payloads through our credentials.
 */
export function parseClientMessage(raw: string): ParseResult {
  if (Buffer.byteLength(raw) > MAX_CLIENT_MESSAGE_BYTES) {
    return { ok: false, error: `Message exceeds ${MAX_CLIENT_MESSAGE_BYTES} bytes` };
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Message is not valid JSON" };
  }
  if (!isObject(data)) return { ok: false, error: "Message must be a JSON object" };

  switch (data.type) {
    case "asrStart": {
      const { metadata } = data;
      const valid =
        isNonEmptyString(data.lessonId) &&
        isNonEmptyString(data.learningLocale) &&
        isObject(metadata) &&
        isObject(metadata.recording) &&
        isObject(metadata.deviceAudio) &&
        typeof metadata.deviceAudio.inputSampleRate === "number";
      return valid
        ? { ok: true, message: data as unknown as AsrClientMessage }
        : { ok: false, error: "Malformed asrStart message" };
    }
    case "asrStream": {
      const valid =
        typeof data.chunk === "string" &&
        BASE64.test(data.chunk) &&
        typeof data.isFinal === "boolean";
      return valid
        ? { ok: true, message: data as unknown as AsrClientMessage }
        : { ok: false, error: "Malformed asrStream message" };
    }
    default:
      return { ok: false, error: `Unsupported message type: ${String(data.type)}` };
  }
}
