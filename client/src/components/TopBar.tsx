import { Link } from "react-router";
import { ChevronLeftIcon } from "./icons.tsx";

interface TopBarProps {
  backTo?: string;
  backLabel?: string;
  title?: string;
}

export function TopBar({ backTo, backLabel = "Back", title }: TopBarProps) {
  return (
    <header className="top-bar">
      {backTo ? (
        <Link to={backTo} className="icon-button" aria-label={backLabel}>
          <ChevronLeftIcon />
        </Link>
      ) : (
        <span className="icon-button-spacer" />
      )}
      {title && <span className="top-bar-title">{title}</span>}
      <span className="icon-button-spacer" />
    </header>
  );
}
