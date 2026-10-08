import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import WebSocket, { WebSocketServer, type RawData } from "ws";
import {
  ASR_WS_PATH,
  type ProxyErrorCode,
  type ProxyErrorMessage,
} from "../../../shared/asr.ts";
import { parseClientMessage } from "./validation.ts";

export interface AsrProxyOptions {
  upstreamUrl: string;
  /** Headers added to the upstream handshake (browsers can't set these). */
  upstreamHeaders: Record<string, string>;
  log?: (message: string) => void;
  /** How often to ping browser sockets and drop ones that stop answering. */
  heartbeatMs?: number;
}

const UPSTREAM_HANDSHAKE_TIMEOUT_MS = 10_000;
/** Messages buffered while the upstream handshake is still in flight. */
const MAX_PENDING_MESSAGES = 512;

/**
 * Attaches a WebSocket endpoint at ASR_WS_PATH that pairs every browser
 * connection with its own upstream ASR connection and relays messages both
 * ways. Each side's lifetime is tied to the other: when one closes, so does
 * its partner.
 */
export function attachAsrProxy(server: Server, options: AsrProxyOptions) {
  const log = options.log ?? ((message) => console.log(message));
  const wss = new WebSocketServer({ noServer: true });
  const alive = new WeakSet<WebSocket>();

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (pathname !== ASR_WS_PATH) {
      socket.destroy();
      return;
    }
    if (!isSameOrigin(req)) {
      // Otherwise any site the user visits could open this socket and spend our upstream credentials.
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (client) => {
      alive.add(client);
      client.on("pong", () => alive.add(client));
      bridge(client, options, log);
    });
  };
  server.on("upgrade", onUpgrade);

  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (!alive.has(client)) {
        client.terminate();
        continue;
      }
      alive.delete(client);
      client.ping();
    }
  }, options.heartbeatMs ?? 30_000);
  heartbeat.unref();

  return {
    close() {
      clearInterval(heartbeat);
      server.off("upgrade", onUpgrade);
      for (const client of wss.clients) client.close(1001, "Server shutting down");
      wss.close();
    },
  };
}

function bridge(
  client: WebSocket,
  { upstreamUrl, upstreamHeaders }: AsrProxyOptions,
  baseLog: (message: string) => void,
) {
  const id = randomUUID().slice(0, 8);
  const log = (message: string) => baseLog(`[asr-proxy ${id}] ${message}`);
  log("client connected, dialing upstream");

  const upstream = new WebSocket(upstreamUrl, {
    headers: upstreamHeaders,
    handshakeTimeout: UPSTREAM_HANDSHAKE_TIMEOUT_MS,
  });
  const pending: string[] = [];
  let upstreamOpened = false;

  const sendProxyError = (code: ProxyErrorCode, message: string) => {
    if (client.readyState !== WebSocket.OPEN) return;
    const payload: ProxyErrorMessage = { type: "proxyError", code, message };
    client.send(JSON.stringify(payload));
  };

  // ---- browser -> upstream ----
  client.on("message", (data: RawData, isBinary: boolean) => {
    if (isBinary) {
      sendProxyError("invalidMessage", "Binary frames are not supported");
      return;
    }
    const text = data.toString();
    const parsed = parseClientMessage(text);
    if (!parsed.ok) {
      log(`rejected client message: ${parsed.error}`);
      sendProxyError("invalidMessage", parsed.error);
      return;
    }

    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(text);
    } else if (upstream.readyState === WebSocket.CONNECTING) {
      if (pending.length >= MAX_PENDING_MESSAGES) {
        sendProxyError("upstreamUnavailable", "Upstream is not accepting data yet");
        client.close(1013, "Upstream backlog full");
        return;
      }
      pending.push(text);
    }
    // CLOSING/CLOSED: the upstream close handler is already tearing down the client.
  });

  client.on("close", (code) => {
    log(`client closed (${code})`);
    pending.length = 0;
    if (upstream.readyState === WebSocket.CONNECTING) upstream.terminate();
    else if (upstream.readyState === WebSocket.OPEN) upstream.close(1000);
  });

  client.on("error", (err) => log(`client error: ${err.message}`));

  // ---- upstream -> browser ----
  upstream.on("open", () => {
    upstreamOpened = true;
    log(`upstream open, flushing ${pending.length} buffered message(s)`);
    for (const text of pending.splice(0)) upstream.send(text);
  });

  upstream.on("message", (data: RawData, isBinary: boolean) => {
    if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
  });

  upstream.on("error", (err) => {
    log(`upstream error: ${err.message}`);
    if (!upstreamOpened) {
      sendProxyError("upstreamUnavailable", "Could not reach the speech recognition service");
    }
  });

  upstream.on("close", (code, reason) => {
    log(`upstream closed (${code}${reason.length ? `: ${reason}` : ""})`);
    if (upstreamOpened && code !== 1000 && client.readyState === WebSocket.OPEN) {
      sendProxyError("upstreamClosed", "The speech recognition service closed the connection");
    }
    if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
      client.close(toSendableCloseCode(code), "Upstream closed");
    }
  });
}

/** Browsers always send Origin on WebSocket upgrades; non-browser clients may omit it. */
function isSameOrigin(req: IncomingMessage): boolean {
  const { origin, host } = req.headers;
  if (!origin) return true;
  return URL.canParse(origin) && new URL(origin).host === host;
}

/** 1005/1006/1015 are reserved and can't be sent in a close frame. */
function toSendableCloseCode(code: number): number {
  const sendable =
    (code >= 1000 && code <= 1003) || (code >= 1007 && code <= 1014) || (code >= 3000 && code <= 4999);
  return sendable ? code : 1011;
}
