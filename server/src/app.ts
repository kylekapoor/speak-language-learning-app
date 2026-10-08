import path from "node:path";
import express, { type ErrorRequestHandler } from "express";
import type { ApiErrorResponse } from "../../shared/course.ts";
import type { CourseRepository } from "./courses/repository.ts";
import { courseRoutes } from "./courses/routes.ts";

export interface AppOptions {
  courses: CourseRepository;
  /** When set, serve the built React app from this directory. */
  clientDistPath?: string;
}

export function createApp({ courses, clientDistPath }: AppOptions) {
  const app = express();
  app.disable("x-powered-by");

  const api = express.Router();
  api.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  api.use(courseRoutes(courses));
  api.use((req, res) => {
    const body: ApiErrorResponse = {
      error: { code: "notFound", message: `No route for ${req.method} ${req.originalUrl}` },
    };
    res.status(404).json(body);
  });
  app.use("/api", api);

  if (clientDistPath) {
    // Vite puts content hashes in these filenames, so they can be cached forever.
    app.use("/assets", express.static(path.join(clientDistPath, "assets"), { immutable: true, maxAge: "1y" }));
    app.use(express.static(clientDistPath));
    // Client-side routes get the SPA shell. Paths with an extension are files, so a
    // missing one should 404 rather than come back as HTML.
    app.use((req, res, next) => {
      if (req.method !== "GET" || path.extname(req.path)) return next();
      res.sendFile(path.join(clientDistPath, "index.html"));
    });
  }

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    const body: ApiErrorResponse = {
      error: { code: "internal", message: "Something went wrong" },
    };
    res.status(500).json(body);
  };
  app.use(onError);

  return app;
}
