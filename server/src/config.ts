import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Load server/.env if present. Real environment variables take precedence.
try {
  process.loadEnvFile(path.join(serverRoot, ".env"));
} catch {
  // No .env file: rely on the environment.
}

export type AsrMode = "live" | "mock";

export interface Config {
  port: number;
  isProduction: boolean;
  courseDataPath: string;
  clientDistPath: string;
  asr: {
    /** `mock` runs a local stand-in for the upstream ASR host. */
    mode: AsrMode;
    upstreamUrl: string;
    accessToken: string;
    clientInfo: string;
  };
}

function readAsrMode(value: string | undefined): AsrMode {
  if (value === undefined || value === "live") return "live";
  if (value === "mock") return "mock";
  throw new Error(`ASR_MODE must be "live" or "mock", got "${value}"`);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy server/.env.example to server/.env (see README).`,
    );
  }
  return value;
}

export function loadConfig(): Config {
  const mode = readAsrMode(process.env.ASR_MODE);
  return {
    port: Number(process.env.PORT ?? 3001),
    isProduction: process.env.NODE_ENV === "production",
    courseDataPath: path.join(serverRoot, "data", "course.json"),
    clientDistPath: path.resolve(serverRoot, "..", "client", "dist"),
    asr: {
      mode,
      // In mock mode the upstream URL is filled in once the mock is listening.
      upstreamUrl: mode === "mock" ? "" : required("ASR_UPSTREAM_URL"),
      accessToken: mode === "mock" ? "mock-token" : required("ASR_ACCESS_TOKEN"),
      clientInfo: process.env.ASR_CLIENT_INFO ?? "Speak Interview Test",
    },
  };
}
