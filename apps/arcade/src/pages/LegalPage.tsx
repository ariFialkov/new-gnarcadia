import { Link, useParams } from "react-router-dom";
import { MarkdownLite } from "../components/MarkdownLite.tsx";
import { PRIVACY, RESPONSIBLE_PLAY, TERMS, TERMS_VERSION_LABEL } from "../legal/index.ts";
import { useDocumentTitle } from "../lib/hooks.ts";
import { EmptyState } from "../components/Primitives.tsx";

const DOCS: Record<string, { title: string; body: string }> = {
  terms: { title: "Terms of Service", body: TERMS },
  privacy: { title: "Privacy Policy", body: PRIVACY },
  "responsible-play": { title: "Responsible Play", body: RESPONSIBLE_PLAY },
};

export function LegalPage() {
  const { doc = "terms" } = useParams();
  const d = DOCS[doc];
  useDocumentTitle(d?.title ?? "Legal");
  if (!d) return <div className="container page"><EmptyState emoji="📄" title="Page not found" action={<Link to="/legal/terms" className="btn btn--primary">Terms of Service</Link>} /></div>;
  return (
    <div className="container page page--legal">
      <nav className="chips" aria-label="Legal documents">{Object.entries(DOCS).map(([k, v]) => <Link key={k} to={`/legal/${k}`} className={`chip ${k === doc ? "is-active" : ""}`}>{v.title}</Link>)}</nav>
      <article className="card card--pad legal">
        <div className="banner banner--warn"><span aria-hidden="true">📝</span><span><strong>Draft.</strong> {TERMS_VERSION_LABEL}. Placeholder text pending counsel review — not a binding document yet.</span></div>
        <MarkdownLite source={d.body} />
      </article>
    </div>
  );
}
