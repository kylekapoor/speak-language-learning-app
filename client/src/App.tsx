import { useEffect } from "react";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router";
import { CoursePage } from "./pages/CoursePage.tsx";
import { CoursesPage } from "./pages/CoursesPage.tsx";
import { LessonPage } from "./pages/LessonPage.tsx";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function NotFoundPage() {
  return (
    <main className="page">
      <div className="status-view">
        <h2>Page not found</h2>
        <Link to="/" className="button button-secondary">
          Browse courses
        </Link>
      </div>
    </main>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <div className="app">
        <Routes>
          <Route path="/" element={<CoursesPage />} />
          <Route path="/courses/:courseId" element={<CoursePage />} />
          <Route path="/courses/:courseId/lessons/:lessonId" element={<LessonPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
