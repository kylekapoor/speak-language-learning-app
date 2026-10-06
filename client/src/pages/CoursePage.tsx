import { Link, useParams } from "react-router";
import { fetchCourse } from "../api/courses.ts";
import { ChevronRightIcon } from "../components/icons.tsx";
import { ErrorState, ListSkeleton } from "../components/StatusViews.tsx";
import { TopBar } from "../components/TopBar.tsx";
import { useAsync } from "../hooks/useAsync.ts";

export function CoursePage() {
  const { courseId = "" } = useParams();
  const result = useAsync((signal) => fetchCourse(courseId, signal), [courseId]);

  if (result.status !== "success") {
    return (
      <main className="page">
        <TopBar backTo="/" backLabel="All courses" />
        {result.status === "loading" ? (
          <>
            <div className="skeleton skeleton-hero" />
            <ListSkeleton />
          </>
        ) : (
          <ErrorState error={result.error} onRetry={result.retry} />
        )}
      </main>
    );
  }

  const { course } = result.data;
  return (
    <main className="page page-flush">
      <section
        className="course-hero"
        style={{ backgroundImage: `url(${JSON.stringify(course.backgroundImageUrl)})` }}
      >
        <TopBar backTo="/" backLabel="All courses" />
        <div className="course-hero-text">
          <span className="pill pill-on-dark">{course.language}</span>
          <h1>{course.title}</h1>
          <p>{course.subtitle}</p>
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">
          Lessons <span className="count">{course.lessons.length}</span>
        </h2>
        <ol className="lesson-list">
          {course.lessons.map((lesson, i) => (
            <li key={lesson.id}>
              <Link to={`/courses/${course.id}/lessons/${lesson.id}`} className="lesson-row">
                <span className="lesson-number">{i + 1}</span>
                <img src={lesson.thumbnailImageUrl} alt="" className="lesson-thumb" />
                <span className="lesson-text">
                  <span className="lesson-title">{lesson.title}</span>
                  <span className="lesson-subtitle">{lesson.subtitle}</span>
                </span>
                <ChevronRightIcon className="chevron" />
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
