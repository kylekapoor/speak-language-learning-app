// Drives the client's RecordingController headless through the real proxy, to
// cover the session lifecycle across the whole real-time path.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { attachAsrProxy } from "../src/asr/proxy.ts";
import { startMockAsrUpstream } from "../src/asr/mockUpstream.ts";

// Imported through a variable so the server's type-check doesn't pull in
// browser-only client code. Vitest still transforms it like any other module.
const clientAsr = new URL("../../client/src/asr", import.meta.url).pathname;
const { RecordingController } = await import(`${clientAsr}/recordingController.ts`);
const { initialSessionState, sessionReducer } = await import(`${clientAsr}/sessionState.ts`);

type Phase = "idle" | "connecting" | "recording" | "finishing" | "done" | "error";

const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});

async function startProxy(upstreamUrl: string) {
  const server = createServer();
  const proxy = attachAsrProxy(server, {
    upstreamUrl,
    upstreamHeaders: { "X-Access-Token": "t", "X-Client-Info": "c" },
    log: () => {},
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  cleanups.push(() => new Promise((resolve) => server.close(resolve)), () => proxy.close());
  return `127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function record(host: string) {
  // The controller connects to the page's own host, like it does in the browser.
  (globalThis as { window?: unknown }).window = { location: { protocol: "http:", host } };
  let state = initialSessionState;
  const controller = new RecordingController("day_0", (event: unknown) => {
    state = sessionReducer(state, event);
  });
  cleanups.push(() => controller.dispose());
  const phase = () => state.phase as Phase;
  const reach = (expected: Phase) => expect.poll(phase, { timeout: 4_000 }).toBe(expected);
  return { controller, phase, reach, transcript: () => state.transcript?.text };
}

/**
 * An upstream that finalizes on its own after a few chunks (as recognizers with
 * endpointing do), while keeping the session open until the client's final
 * chunk, exactly as the protocol says. Optionally sends a leftover result from
 * an earlier session before asrMetadata.
 */
async function startEagerUpstream({ staleResultFirst = false } = {}) {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise((resolve) => wss.once("listening", resolve));
  wss.on("connection", (socket) => {
    let sessionOpen = false;
    let chunks = 0;
    const send = (message: object) => socket.send(JSON.stringify(message));
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === "asrStart") {
        if (sessionOpen) return send({ type: "asrError", message: "sessionAlreadyActive" });
        sessionOpen = true;
        chunks = 0;
        if (staleResultFirst) send({ type: "asrResult", id: "old", text: "stale", isFinal: true });
        send({ type: "asrMetadata", id: "s", recordingId: "r" });
      } else if (message.type === "asrStream") {
        if (++chunks === 5) send({ type: "asrResult", id: "r", text: "this is", isFinal: true });
        if (message.isFinal) sessionOpen = false;
      }
    });
  });
  cleanups.push(() => new Promise((resolve) => wss.close(resolve)));
  return `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`;
}

describe("recording session through the proxy", () => {
  it("records, stops early, and records again on the same connection", async () => {
    const upstream = await startMockAsrUpstream({ latencyMs: 0 });
    cleanups.push(upstream.close);
    const session = record(await startProxy(upstream.url));

    for (let take = 0; take < 2; take++) {
      void session.controller.start();
      await session.reach("recording");
      await expect.poll(session.transcript, { timeout: 4_000 }).toBe("this is");
      session.controller.stop();
      await session.reach("done");
      expect(session.transcript()).toBe("This is");
    }
  });

  it("starts cleanly after the recognizer finalized before the last chunk", async () => {
    const session = record(await startProxy(await startEagerUpstream()));

    void session.controller.start();
    await session.reach("done");
    expect(session.transcript()).toBe("this is");

    void session.controller.start();
    await session.reach("recording");
  });

  it("ignores a stale result that arrives before asrMetadata", async () => {
    const session = record(await startProxy(await startEagerUpstream({ staleResultFirst: true })));

    void session.controller.start();
    await session.reach("recording");
    expect(session.transcript()).toBeUndefined();
  });
});
