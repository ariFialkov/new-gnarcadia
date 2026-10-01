import { useState } from "react";
import { Modal } from "../components/Modal.tsx";
import type { ModalHandle } from "./ModalManager.tsx";

interface Props extends ModalHandle<boolean> {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Require typing this word to enable the confirm button (serious actions like self-exclusion). */
  typeToConfirm?: string;
}

export function ConfirmModal({ resolve, dismiss, title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", danger, typeToConfirm }: Props) {
  const [typed, setTyped] = useState("");
  const ok = !typeToConfirm || typed.trim().toUpperCase() === typeToConfirm.toUpperCase();
  return (
    <Modal title={title} onClose={dismiss} size="sm">
      <div className="stack">
        <div className="muted">{message}</div>
        {typeToConfirm && (
          <label className="field">
            <span>Type <strong>{typeToConfirm}</strong> to confirm</span>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-autofocus />
          </label>
        )}
        <div className="row row--end">
          <button type="button" className="btn btn--ghost" onClick={() => resolve(false)}>{cancelLabel}</button>
          <button type="button" className={`btn ${danger ? "btn--danger" : "btn--primary"}`} disabled={!ok} onClick={() => resolve(true)} data-autofocus={!typeToConfirm ? true : undefined}>{confirmLabel}</button>
        </div>
      </div>
    </Modal>
  );
}
