import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export type ToastKind = "info" | "success" | "error" | "warn";
export interface ToastInput { title?: string; message: string; kind?: ToastKind; durationMs?: number; action?: { label: string; onClick: () => void } }
interface Toast extends ToastInput { id: number; kind: ToastKind }

type ToastFn = (t: ToastInput | string) => void;
/** Callable (`toast("hi")` / `toast({...})`) with helpers attached. */
export type ToastCtx = ToastFn & { toast: ToastFn; success: (m: string, title?: string) => void; error: (m: string, title?: string) => void; dismiss: (id: number) => void }
const Ctx = createContext<ToastCtx | null>(null);

const ICONS: Record<ToastKind, string> = { info: "💬", success: "🎉", error: "⚠️", warn: "⏰" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((input: ToastInput | string) => {
    const t: ToastInput = typeof input === "string" ? { message: input } : input;
    const id = ++seq.current;
    const kind = t.kind ?? "info";
    setToasts((list) => [...list.slice(-3), { ...t, id, kind }]);
    const dur = t.durationMs ?? (kind === "error" ? 6500 : 4200);
    if (dur > 0) window.setTimeout(() => dismiss(id), dur);
  }, [dismiss]);
  const value = useMemo<ToastCtx>(() => Object.assign(((t: ToastInput | string) => toast(t)) as ToastFn, {
    toast,
    success: (message: string, title?: string) => toast({ message, title, kind: "success" }),
    error: (message: string, title?: string) => toast({ message, title, kind: "error" }),
    dismiss,
  }), [toast, dismiss]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toast-host" aria-live="polite" aria-atomic="false" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`}>
            <span className="toast__icon" aria-hidden="true">{ICONS[t.kind]}</span>
            <div className="toast__body">
              {t.title && <strong className="toast__title">{t.title}</strong>}
              <div className="toast__msg">{t.message}</div>
              {t.action && <button type="button" className="toast__action" onClick={() => { t.action!.onClick(); dismiss(t.id); }}>{t.action.label}</button>}
            </div>
            <button type="button" className="toast__close" aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast outside ToastProvider");
  return c;
}
