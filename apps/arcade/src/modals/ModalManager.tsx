import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Promise-based modal stack. Any component (or hook such as useGate) can `open(render)` and await the result.
 * The render function receives `resolve(value)` and `dismiss()`; dismissing resolves with `undefined`.
 */
export interface ModalHandle<R> { resolve: (r: R) => void; dismiss: () => void }
type Renderer<R> = (h: ModalHandle<R>) => ReactNode;
interface Entry { id: number; node: ReactNode }

interface ModalsCtx {
  open: <R = void>(render: Renderer<R>) => Promise<R | undefined>;
  closeAll: () => void;
  count: number;
}
const Ctx = createContext<ModalsCtx | null>(null);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Entry[]>([]);
  const seq = useRef(0);
  const closers = useRef(new Map<number, () => void>());

  const open = useCallback(<R,>(render: Renderer<R>) => {
    const id = ++seq.current;
    return new Promise<R | undefined>((res) => {
      let done = false;
      const finish = (v: R | undefined) => {
        if (done) return; done = true;
        closers.current.delete(id);
        setStack((s) => s.filter((e) => e.id !== id));
        res(v);
      };
      closers.current.set(id, () => finish(undefined));
      const node = render({ resolve: (r) => finish(r), dismiss: () => finish(undefined) });
      setStack((s) => [...s, { id, node }]);
    });
  }, []);

  const closeAll = useCallback(() => { for (const c of Array.from(closers.current.values())) c(); }, []);
  const value = useMemo<ModalsCtx>(() => ({ open, closeAll, count: stack.length }), [open, closeAll, stack.length]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {stack.map((e, i) => (
        <div key={e.id} className="modal-layer" style={{ zIndex: 1000 + i }} aria-hidden={i < stack.length - 1 ? true : undefined} inert={i < stack.length - 1 ? true : undefined}>
          {e.node}
        </div>
      ))}
    </Ctx.Provider>
  );
}

export function useModals(): ModalsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useModals outside ModalProvider");
  return c;
}
