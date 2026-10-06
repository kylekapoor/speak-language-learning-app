import { readFileSync } from "node:fs";
import type { Course, CourseSummary, Lesson } from "../../../shared/course.ts";

/**
 * Read-only access to the course "database". The JSON file is loaded once at
 * startup and deep-frozen, so nothing in the process can mutate it.
 */
export interface CourseRepository {
  listCourses(): CourseSummary[];
  getCourse(courseId: string): Course | undefined;
  getLesson(
    courseId: string,
    lessonId: string,
  ): { course: Course; lesson: Lesson; index: number } | undefined;
}

export function toSummary({ lessons, ...rest }: Course): CourseSummary {
  return { ...rest, lessonCount: lessons.length };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export function createCourseRepository(courses: Course[]): CourseRepository {
  const frozen = deepFreeze(structuredClone(courses));
  const byId = new Map(frozen.map((course) => [course.id, course]));

  return {
    listCourses: () => frozen.map(toSummary),
    getCourse: (courseId) => byId.get(courseId),
    getLesson(courseId, lessonId) {
      const course = byId.get(courseId);
      const index = course?.lessons.findIndex((l) => l.id === lessonId) ?? -1;
      if (!course || index === -1) return undefined;
      return { course, lesson: course.lessons[index], index };
    },
  };
}

export function loadCourseRepository(filePath: string): CourseRepository {
  const data = JSON.parse(readFileSync(filePath, "utf8")) as { courses: Course[] };
  if (!Array.isArray(data.courses)) {
    throw new Error(`${filePath} must contain a "courses" array`);
  }
  return createCourseRepository(data.courses);
}
