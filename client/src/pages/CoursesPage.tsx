import { Link } from "react-router";
import { fetchCourses } from "../api/courses.ts";
import { ChevronRightIcon } from "../components/icons.tsx";
import { ErrorState, ListSkeleton } from "../components/StatusViews.tsx";
import { useAsync } from "../hooks/useAsync.ts";

export function CoursesPage() {
  const courses = useAsync((signal) => fetchCourses(signal), []);

  return (
    <main className="page">
      <header className="page-header">
        <p className="eyebrow">Speak Lite</p>
        <h1>Courses</h1>
        <p className="lede">Pick a course and practice out loud.</p>
      </header>

      {courses.status === "loading" && <ListSkeleton />}
      {courses.status === "error" && <ErrorState error={courses.error} onRetry={courses.retry} />}
      {courses.status === "success" && (
        <ul className="card-list">
          {courses.data.courses.map((course) => (
            <li key={course.id}>
              <Link to={`/courses/${course.id}`} className="course-card">
                <img src={course.thumbnailImageUrl} alt="" className="course-card-thumb" />
                <div className="course-card-body">
                  <span className="pill">{course.language}</span>
                  <h2 className="course-card-title">{course.title}</h2>
                  <p className="course-card-meta">
                    {course.subtitle} · {course.lessonCount} lessons
                  </p>
                </div>
                <ChevronRightIcon className="chevron" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
