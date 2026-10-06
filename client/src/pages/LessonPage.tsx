import { Link, useParams } from "react-router";
import { fetchLesson } from "../api/courses.ts";
import { ChevronLeftIcon, ChevronRightIcon } from "../components/icons.tsx";
import { RecordingPanel } from "../components/RecordingPanel.tsx";
import { ErrorState } from "../components/StatusViews.tsx";
import { TopBar } from "../components/TopBar.tsx";
import { useAsync } from "../hooks/useAsync.ts";

export function LessonPage() {
  const { courseId = "", lessonId = "" } = useParams();
  const result = useAsync((signal) => fetchLesson(courseId, lessonId, signal), [courseId, lessonId]);
  const courseUrl = `/courses/${courseId}`;

  if (result.status !== "success") {
    return (
      <main className="page">
        <TopBar backTo={courseUrl} backLabel="Back to course" />
        {result.status === "loading" ? (
          <div aria-busy="true" aria-label="Loading">
            <div className="skeleton skeleton-image" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line short" />
          </div>
        ) : (
          <ErrorState error={result.error} onRetry={result.retry} />
        )}
      </main>
    );
  }

  const { course, lesson, position, previousLessonId, nextLessonId } = result.data;
  const lessonUrl = (id: string) => `${courseUrl}/lessons/${id}`;

  return (
    <main className="page">
      <TopBar
        backTo={courseUrl}
        backLabel="Back to course"
        title={`Lesson ${position} of ${course.lessonCount}`}
      />

      <img src={lesson.thumbnailImageUrl} alt="" className="lesson-image" />
      <p className="eyebrow">{course.title}</p>
      <h1 className="lesson-heading">{lesson.title}</h1>
      <p className="lesson-translation">{lesson.subtitle}</p>

      {/* Keyed so moving to another lesson starts a fresh session. */}
      <RecordingPanel key={lesson.id} lessonId={lesson.id} />

      <nav className="lesson-nav" aria-label="Lessons">
        {previousLessonId ? (
          <Link to={lessonUrl(previousLessonId)} className="button button-ghost">
            <ChevronLeftIcon /> Previous
          </Link>
        ) : (
          <span />
        )}
        {nextLessonId && (
          <Link to={lessonUrl(nextLessonId)} className="button button-ghost">
            Next <ChevronRightIcon />
          </Link>
        )}
      </nav>
    </main>
  );
}
