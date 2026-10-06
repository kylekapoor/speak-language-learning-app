import { createServer } from "node:http";
import { ASR_WS_PATH } from "../../shared/asr.ts";
import { createApp } from "./app.ts";
import { attachAsrProxy } from "./asr/proxy.ts";
import { startMockAsrUpstream } from "./asr/mockUpstream.ts";
import { loadConfig } from "./config.ts";
import { loadCourseRepository } from "./courses/repository.ts";

const config = loadConfig();
const courses = loadCourseRepository(config.courseDataPath);

let upstreamUrl = config.asr.upstreamUrl;
const mock = config.asr.mode === "mock" ? await startMockAsrUpstream() : null;
if (mock) {
  upstreamUrl = mock.url;
  console.log(`ASR_MODE=mock: proxying to local mock ASR at ${mock.url}`);
}

const app = createApp({
  courses,
  clientDistPath: config.isProduction ? config.clientDistPath : undefined,
});
const server = createServer(app);
const proxy = attachAsrProxy(server, {
  upstreamUrl,
  upstreamHeaders: {
    "X-Access-Token": config.asr.accessToken,
    "X-Client-Info": config.asr.clientInfo,
  },
});

server.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
  console.log(`  REST:      /api/courses`);
  console.log(`  WebSocket: ${ASR_WS_PATH} -> ${upstreamUrl}`);
});

function shutdown() {
  proxy.close();
  server.close(() => process.exit(0));
  void mock?.close();
  // Don't hang forever on lingering keep-alive connections.
  setTimeout(() => process.exit(0), 2_000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
