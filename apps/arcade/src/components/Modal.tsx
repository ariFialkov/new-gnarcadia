import { useEffect, useId, useRef, type ReactNode } from "react";

interface ModalProps {
  title?: ReactNode;
  /** Visually hidden label when there's no visible title. */
  ariaLabel?: string;
  children: ReactNode;
  onClose?: () => void;
  /** Esc / backdrop click close the modal (default true). */
  dismissible?: boolean;
  size?: "sm" | "md" | "lg" | "full";
  /** Optional decorative header (gradient band). */
  hero?: ReactNode;
  className?: string;
  footer?: ReactNode;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Accessible dialog shell: focus trap, Esc to close, scroll lock, restores focus, safe-area aware sheet on mobile. */
export function Modal({ title, ariaLabel, children, onClose, dismissible = true, size = "md", hero, className = "", footer }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el)?.focus({ preventScroll: true });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (el?.closest("[inert]")) return; // another modal is stacked on top
      if (e.key === "Escape" && dismissible && onClose) { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab" || !el) return;
      const nodes = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (!nodes.length) { e.preventDefault(); el.focus(); return; }
      const firstN = nodes[0], lastN = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === firstN || document.activeElement === el)) { e.preventDefault(); lastN.focus(); }
      else if (!e.shiftKey && document.activeElement === lastN) { e.preventDefault(); firstN.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      (previouslyFocused.current as HTMLElement | null)?.focus?.({ preventScroll: true });
    };
  }, [dismissible, onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && dismissible && onClose) onClose(); }}>
      <div ref={ref} className={`modal modal--${size} ${className}`} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} aria-label={!title ? ariaLabel : undefined} tabIndex={-1}>
        {hero && <div className="modal__hero">{hero}</div>}
        <div className="modal__head">
          {title ? <h2 id={titleId} className="modal__title">{title}</h2> : <span />}
          {onClose && <button type="button" className="icon-btn modal__close" aria-label="Close" onClick={onClose}>✕</button>}
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}
