import type {
  ApiErrorResponse,
  CourseListResponse,
  CourseResponse,
  LessonResponse,
} from "../../../shared/course.ts";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiError(0, "network", "Can't reach the server. Check your connection.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorResponse | null;
    throw new ApiError(
      res.status,
      body?.error.code ?? "unknown",
      body?.error.message ?? `Request failed (${res.status})`,
    );
  }
  return res.json() as Promise<T>;
}

const enc = encodeURIComponent;

export const fetchCourses = (signal?: AbortSignal) =>
  getJson<CourseListResponse>("/courses", signal);

export const fetchCourse = (courseId: string, signal?: AbortSignal) =>
  getJson<CourseResponse>(`/courses/${enc(courseId)}`, signal);

export const fetchLesson = (courseId: string, lessonId: string, signal?: AbortSignal) =>
  getJson<LessonResponse>(`/courses/${enc(courseId)}/lessons/${enc(lessonId)}`, signal);
