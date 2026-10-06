import {
  ASR_WS_PATH,
  type AsrClientMessage,
  type AsrServerMessage,
} from "../../../shared/asr.ts";

export interface AsrSocketHandlers {
  onMessage(message: AsrServerMessage): void;
  /** Called when an open socket closes, whoever closed it. */
  onClose(): void;
}

const CONNECT_TIMEOUT_MS = 8_000;

function proxyUrl(): string {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.host}${ASR_WS_PATH}`;
}

/**
 * Thin wrapper around the browser WebSocket to our proxy. It connects lazily
 * and is reused across recordings; after any failure it is closed, and the
 * next recording reconnects with a clean slate.
 */
export class AsrSocket {
  private socket: WebSocket | null = null;
  private opening: Promise<void> | null = null;
  private readonly handlers: AsrSocketHandlers;

  constructor(handlers: AsrSocketHandlers) {
    this.handlers = handlers;
  }

  ensureOpen(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    this.opening ??= this.connect().finally(() => (this.opening = null));
    return this.opening;
  }

  send(message: AsrClientMessage): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  close(): void {
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000);
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(proxyUrl());
      this.socket = socket;
      let opened = false;

      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error("Timed out connecting to the server"));
      }, CONNECT_TIMEOUT_MS);

      socket.onopen = () => {
        opened = true;
        clearTimeout(timeout);
        resolve();
      };
      socket.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Could not connect to the server"));
      };
      socket.onmessage = (event) => {
        if (this.socket !== socket) return; // a replaced socket's leftovers
        try {
          this.handlers.onMessage(JSON.parse(event.data as string) as AsrServerMessage);
        } catch {
          console.warn("Ignoring non-JSON message from ASR proxy", event.data);
        }
      };
      socket.onclose = () => {
        clearTimeout(timeout);
        if (this.socket !== socket) return; // closed deliberately via close()
        this.socket = null;
        reject(new Error("Connection closed"));
        if (opened) this.handlers.onClose();
      };
    });
  }
}
