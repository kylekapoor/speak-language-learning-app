// Course "database" entities, mirroring server/data/course.json.

export interface Lesson {
  id: string;
  title: string;
  subtitle: string;
  thumbnailImageUrl: string;
}

export interface Course {
  id: string;
  title: string;
  subtitle: string;
  language: string;
  thumbnailImageUrl: string;
  backgroundImageUrl: string;
  lessons: Lesson[];
}

// ---- REST response shapes ----

/** A course without its lessons, for the catalog list. */
export type CourseSummary = Omit<Course, "lessons"> & { lessonCount: number };

export interface CourseListResponse {
  courses: CourseSummary[];
}

export interface CourseResponse {
  course: Course;
}

export interface LessonResponse {
  course: CourseSummary;
  lesson: Lesson;
  /** 1-based position of the lesson within its course. */
  position: number;
  previousLessonId: string | null;
  nextLessonId: string | null;
}

export interface ApiErrorResponse {
  error: { code: string; message: string };
}
