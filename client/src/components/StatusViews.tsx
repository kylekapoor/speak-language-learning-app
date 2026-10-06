import { Link } from "react-router";
import { ApiError } from "../api/courses.ts";
import { AlertIcon } from "./icons.tsx";

export function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  if (error instanceof ApiError && error.status === 404) {
    return (
      <div className="status-view">
        <h2>We couldn't find that</h2>
        <p>It may have moved, or the link is wrong.</p>
        <Link to="/" className="button button-secondary">
          Browse courses
        </Link>
      </div>
    );
  }
  return (
    <div className="status-view" role="alert">
      <AlertIcon className="status-icon" />
      <h2>Something went wrong</h2>
      <p>{error.message}</p>
      <button type="button" className="button button-secondary" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

/** Placeholder rows shaped like the content that's loading. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton-list" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton skeleton-thumb" />
          <div className="skeleton-lines">
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line short" />
          </div>
        </div>
      ))}
    </div>
  );
}
