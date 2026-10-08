import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import { ASR_WS_PATH, type AsrServerMessage } from "../../shared/asr.ts";
import { attachAsrProxy } from "../src/asr/proxy.ts";
import { startMockAsrUpstream } from "../src/asr/mockUpstream.ts";

const START = {
  type: "asrStart",
  lessonId: "day_0",
  learningLocale: "en-US",
  metadata: {
    recording: { lessonId: "day_0", lineId: "line-1" },
    deviceAudio: { inputSampleRate: 16000 },
  },
};
// One second of silent 16 kHz/16-bit audio, enough for the mock to "hear" every word.
const ONE_SECOND = Buffer.alloc(32_000).toString("base64");

const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});

async function startProxy(upstreamUrl: string) {
  const server: Server = createServer();
  const proxy = attachAsrProxy(server, {
    upstreamUrl,
    upstreamHeaders: { "X-Access-Token": "test-token", "X-Client-Info": "test-suite" },
    log: () => {},
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  cleanups.push(() => new Promise((resolve) => server.close(resolve)), () => proxy.close());
  return `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** Opens a browser-side socket and collects every message it receives. */
async function connect(baseUrl: string) {
  const socket = new WebSocket(baseUrl + ASR_WS_PATH);
  const received: AsrServerMessage[] = [];
  socket.on("message", (data) => received.push(JSON.parse(data.toString())));
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  cleanups.push(() => socket.terminate());

  const waitFor = (predicate: (m: AsrServerMessage) => boolean, timeoutMs = 2_000) =>
    new Promise<AsrServerMessage>((resolve, reject) => {
      const deadline = Date.now() + timeoutMs;
      const check = () => {
        const match = received.find(predicate);
        if (match) return resolve(match);
        if (Date.now() > deadline) return reject(new Error("Timed out waiting for message"));
        setTimeout(check, 10);
      };
      check();
    });

  return { socket, received, waitFor };
}

describe("ASR WebSocket proxy", () => {
  it("adds auth headers to the upstream handshake", async () => {
    let headers: IncomingHttpHeaders | undefined;
    const upstream = new WebSocketServer({ port: 0 });
    upstream.on("connection", (_socket, req) => (headers = req.headers));
    cleanups.push(() => new Promise((resolve) => upstream.close(resolve)));

    const proxyUrl = await startProxy(`ws://127.0.0.1:${(upstream.address() as AddressInfo).port}`);
    await connect(proxyUrl);
    await expect.poll(() => headers).toBeDefined();

    expect(headers?.["x-access-token"]).toBe("test-token");
    expect(headers?.["x-client-info"]).toBe("test-suite");
  });

  it("relays a full recording session in both directions", async () => {
    const upstream = await startMockAsrUpstream({ latencyMs: 0 });
    cleanups.push(upstream.close);
    const { socket, waitFor } = await connect(await startProxy(upstream.url));

    // Sent before the upstream handshake finishes: the proxy must buffer it.
    socket.send(JSON.stringify(START));
    await waitFor((m) => m.type === "asrMetadata");

    socket.send(JSON.stringify({ type: "asrStream", chunk: ONE_SECOND, isFinal: false }));
    await waitFor((m) => m.type === "asrResult" && !m.isFinal);

    socket.send(JSON.stringify({ type: "asrStream", chunk: ONE_SECOND, isFinal: true }));
    const final = await waitFor((m) => m.type === "asrResult" && m.isFinal);
    expect(final).toMatchObject({ text: "This is not what we ordered." });
  });

  it("relays upstream asrError when a session is already active", async () => {
    const upstream = await startMockAsrUpstream({ latencyMs: 0 });
    cleanups.push(upstream.close);
    const { socket, waitFor } = await connect(await startProxy(upstream.url));

    socket.send(JSON.stringify(START));
    socket.send(JSON.stringify(START));
    const error = await waitFor((m) => m.type === "asrError");
    expect(error).toMatchObject({ message: "sessionAlreadyActive" });
  });

  it("rejects messages outside the ASR protocol without forwarding them", async () => {
    const forwarded: string[] = [];
    const upstream = new WebSocketServer({ port: 0 });
    upstream.on("connection", (s) => s.on("message", (d) => forwarded.push(d.toString())));
    cleanups.push(() => new Promise((resolve) => upstream.close(resolve)));

    const { socket, waitFor } = await connect(
      await startProxy(`ws://127.0.0.1:${(upstream.address() as AddressInfo).port}`),
    );
    socket.send("not json");
    socket.send(JSON.stringify({ type: "deleteEverything" }));
    socket.send(JSON.stringify({ type: "asrStream", chunk: "%%%", isFinal: false }));

    await waitFor((m) => m.type === "proxyError" && m.message.startsWith("Malformed asrStream"));
    expect(forwarded).toEqual([]);
  });

  it("closes connections that send oversized frames", async () => {
    const upstream = await startMockAsrUpstream({ latencyMs: 0 });
    cleanups.push(upstream.close);
    const { socket } = await connect(await startProxy(upstream.url));

    socket.send("x".repeat(65 * 1024));
    const code = await new Promise((resolve) => socket.once("close", resolve));
    expect(code).toBe(1009);
  });

  it("refuses upgrades from other sites", async () => {
    const upstream = await startMockAsrUpstream({ latencyMs: 0 });
    cleanups.push(upstream.close);
    const proxyUrl = await startProxy(upstream.url);

    const socket = new WebSocket(proxyUrl + ASR_WS_PATH, { origin: "https://evil.example" });
    const status = await new Promise((resolve) =>
      socket.once("unexpected-response", (_req, res) => resolve(res.statusCode)),
    );
    expect(status).toBe(403);
  });

  it("reports an unreachable upstream and closes the client", async () => {
    const { received, socket } = await connect(await startProxy("ws://127.0.0.1:1"));
    const closeCode = await new Promise<number>((resolve) => socket.once("close", resolve));

    expect(received).toContainEqual(expect.objectContaining({ code: "upstreamUnavailable" }));
    expect(closeCode).toBe(1011);
  });
});
