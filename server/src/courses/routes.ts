import { Router, type Response } from "express";
import type {
  ApiErrorResponse,
  CourseListResponse,
  CourseResponse,
  LessonResponse,
} from "../../../shared/course.ts";
import { toSummary, type CourseRepository } from "./repository.ts";

function notFound(res: Response, message: string) {
  const body: ApiErrorResponse = { error: { code: "notFound", message } };
  res.status(404).json(body);
}

export function courseRoutes(repo: CourseRepository): Router {
  const router = Router();

  // The data is static for the lifetime of the process; let clients cache briefly.
  router.use((_req, res, next) => {
    res.set("Cache-Control", "public, max-age=60");
    next();
  });

  router.get("/courses", (_req, res) => {
    const body: CourseListResponse = { courses: repo.listCourses() };
    res.json(body);
  });

  router.get("/courses/:courseId", (req, res) => {
    const course = repo.getCourse(req.params.courseId);
    if (!course) return notFound(res, `Course "${req.params.courseId}" not found`);
    const body: CourseResponse = { course };
    res.json(body);
  });

  router.get("/courses/:courseId/lessons/:lessonId", (req, res) => {
    const { courseId, lessonId } = req.params;
    const found = repo.getLesson(courseId, lessonId);
    if (!found) return notFound(res, `Lesson "${lessonId}" not found in course "${courseId}"`);

    const { course, lesson, index } = found;
    const body: LessonResponse = {
      course: toSummary(course),
      lesson,
      position: index + 1,
      previousLessonId: course.lessons[index - 1]?.id ?? null,
      nextLessonId: course.lessons[index + 1]?.id ?? null,
    };
    res.json(body);
  });

  return router;
}
