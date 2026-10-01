import { gradientFor, initials } from "../lib/format.ts";

export function Avatar({ name, url, size = 40, className = "" }: { name: string; url?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.max(11, size * 0.38) } as const;
  if (url) return <img className={`avatar ${className}`} src={url} alt="" width={size} height={size} style={style} loading="lazy" />;
  return <span className={`avatar avatar--fallback ${className}`} style={{ ...style, background: gradientFor(name) }} aria-hidden="true">{initials(name)}</span>;
}
