import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { loadCourseRepository } from "../src/courses/repository.ts";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const courses = loadCourseRepository(path.resolve(import.meta.dirname, "../data/course.json"));
  server = createApp({ courses }).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));

const get = async (route: string) => {
  const res = await fetch(baseUrl + route);
  return { status: res.status, body: (await res.json()) as any };
};

describe("course API", () => {
  it("lists courses as summaries without lessons", async () => {
    const { status, body } = await get("/courses");
    expect(status).toBe(200);
    expect(body.courses.map((c: { id: string }) => c.id)).toEqual(["te_1", "es_1", "fr_1"]);
    expect(body.courses[0]).toMatchObject({ lessonCount: 3 });
    expect(body.courses[0]).not.toHaveProperty("lessons");
  });

  it("returns a course with its lessons", async () => {
    const { status, body } = await get("/courses/fr_1");
    expect(status).toBe(200);
    expect(body.course.lessons).toHaveLength(3);
  });

  it("returns a lesson with its neighbours", async () => {
    const { body } = await get("/courses/te_1/lessons/day_0");
    expect(body).toMatchObject({ position: 1, previousLessonId: null, nextLessonId: "day_1" });
    expect(body.course).not.toHaveProperty("lessons");
  });

  it("404s with a JSON error for unknown ids", async () => {
    expect(await get("/courses/nope")).toMatchObject({ status: 404, body: { error: { code: "notFound" } } });
    expect((await get("/courses/te_1/lessons/es_day_0")).status).toBe(404);
  });

  it("is read-only", async () => {
    const res = await fetch(baseUrl + "/courses", { method: "POST" });
    expect(res.status).toBe(404);
  });
});
