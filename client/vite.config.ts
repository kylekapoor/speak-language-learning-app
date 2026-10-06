import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_SERVER = process.env.API_SERVER ?? "http://localhost:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin in dev, exactly like production where Express serves the build.
    proxy: {
      "/api": API_SERVER,
      "/ws": { target: API_SERVER.replace(/^http/, "ws"), ws: true },
    },
  },
});
