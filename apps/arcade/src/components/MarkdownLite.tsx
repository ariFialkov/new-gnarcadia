import { Fragment, type ReactNode } from "react";

/**
 * Renders a tiny markdown subset used by the legal pages: #/##/### headings, "- " bullets, "1. " numbered lists,
 * blank-line paragraphs, **bold**, *italic*, `code`, [text](url) and > callouts. No raw HTML, ever.
 */
export function MarkdownLite({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0, key = 0;
  const para: string[] = [];
  const flushPara = () => { if (para.length) { out.push(<p key={key++}>{inline(para.join(" "))}</p>); para.length = 0; } };
  while (i < lines.length) {
    const line = lines[i];
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { flushPara(); const lvl = h[1].length; const txt = inline(h[2]); out.push(lvl === 1 ? <h1 key={key++}>{txt}</h1> : lvl === 2 ? <h2 key={key++}>{txt}</h2> : <h3 key={key++}>{txt}</h3>); i++; continue; }
    if (/^\s*[-*]\s+/.test(line)) { flushPara(); const items: string[] = []; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i].replace(/^\s*[-*]\s+/, "")), i++; out.push(<ul key={key++}>{items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ul>); continue; }
    if (/^\s*\d+\.\s+/.test(line)) { flushPara(); const items: string[] = []; while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i].replace(/^\s*\d+\.\s+/, "")), i++; out.push(<ol key={key++}>{items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ol>); continue; }
    if (/^>\s?/.test(line)) { flushPara(); const q: string[] = []; while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i].replace(/^>\s?/, "")), i++; out.push(<blockquote key={key++}>{inline(q.join(" "))}</blockquote>); continue; }
    if (/^---+$/.test(line.trim())) { flushPara(); out.push(<hr key={key++} />); i++; continue; }
    if (!line.trim()) { flushPara(); i++; continue; }
    para.push(line.trim()); i++;
  }
  flushPara();
  return <div className="md">{out}</div>;
}

function inline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(<Fragment key={k++}>{text.slice(last, m.index)}</Fragment>);
    const tok = m[0];
    if (tok.startsWith("**")) parts.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) parts.push(<code key={k++}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("*")) parts.push(<em key={k++}>{tok.slice(1, -1)}</em>);
    else { const lm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)!; const href = lm[2]; const ext = /^https?:/.test(href); parts.push(<a key={k++} href={href} target={ext ? "_blank" : undefined} rel={ext ? "noreferrer" : undefined}>{lm[1]}</a>); }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(<Fragment key={k++}>{text.slice(last)}</Fragment>);
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}
