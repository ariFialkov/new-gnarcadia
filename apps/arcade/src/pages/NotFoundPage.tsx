import { Link } from "react-router-dom";
import { EmptyState } from "../components/Primitives.tsx";
import { useDocumentTitle } from "../lib/hooks.ts";

export function NotFoundPage() {
  useDocumentTitle("Not found");
  return <div className="container page"><EmptyState emoji="🛸" title="404 — lost in the arcade" body="That page doesn't exist (or got eaten by a boss)." action={<Link to="/games" className="btn btn--primary">Back to games</Link>} /></div>;
}
