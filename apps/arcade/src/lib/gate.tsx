import { useCallback } from "react";
import { useAuth } from "./auth.tsx";
import { useModals } from "../modals/ModalManager.tsx";
import { useToast } from "../components/Toast.tsx";
import { AuthModal } from "../modals/AuthModal.tsx";
import { TermsModal } from "../modals/TermsModal.tsx";
import { GeoGateModal } from "../modals/GeoGateModal.tsx";
import { KycModal } from "../modals/KycModal.tsx";
import { isApiError, type Eligibility, type Me } from "./api.ts";
import { dateTime } from "./format.ts";

/**
 * useGate(): resolves everything standing between the player and a cash action.
 *   - not signed in       -> AuthModal
 *   - terms_required      -> TermsModal
 *   - geo_required/blocked-> GeoGateModal
 *   - kyc_required        -> KycModal
 *   - underage / self_excluded / cooldown / account_frozen -> explained in a toast, returns false
 * Returns true when the user is eligible. Also exposes `handleGateError(err)` for 403s thrown by
 * an action itself (the API re-checks on every call) so callers can retry after the modal resolves.
 */
export function useGate() {
  const auth = useAuth();
  const modals = useModals();
  const toast = useToast();

  const requireAuth = useCallback(async (reason?: string): Promise<Me | null> => {
    if (auth.user) return auth.user;
    const me = await modals.open<Me>((h) => <AuthModal {...h} reason={reason} initialTab="signup" />);
    return me ?? null;
  }, [auth.user, modals]);

  /** Resolve a single eligibility failure. Returns true when the modal reports success and we should re-check. */
  const resolveCode = useCallback(async (el: Eligibility): Promise<boolean> => {
    switch (el.code) {
      case "terms_required": return !!(await modals.open<boolean>((h) => <TermsModal {...h} />));
      case "geo_required": return !!(await modals.open<boolean>((h) => <GeoGateModal {...h} />));
      case "geo_blocked": return !!(await modals.open<boolean>((h) => <GeoGateModal {...h} blockedReason={el.message} />));
      case "kyc_required": return !!(await modals.open<boolean>((h) => <KycModal {...h} tier={(el.details?.tier as 1 | 2) ?? 1} />));
      case "underage": toast.error(el.message ?? "You're not old enough to play for cash in your region.", "Age requirement"); return false;
      case "self_excluded": toast.error(`${el.message ?? "Your account is self-excluded."}${el.details?.until ? ` Until ${dateTime(el.details.until)}.` : ""}`, "Self-exclusion active"); return false;
      case "cooldown": toast({ kind: "warn", title: "Cooling-off break", message: `${el.message ?? "You're on a break."}${el.details?.until ? ` Ends ${dateTime(el.details.until)}.` : ""}` }); return false;
      case "account_frozen": toast.error(el.message ?? "Your account is under review. Contact support.", "Account on hold"); return false;
      default: toast.error(el.message ?? "You can't do that right now."); return false;
    }
  }, [modals, toast]);

  const ensureEligible = useCallback(async (reason?: string): Promise<boolean> => {
    const first = await requireAuth(reason);
    if (!first) return false;
    let me: Me = first;
    for (let i = 0; i < 6; i++) {
      const fresh: Me | null = i === 0 && me.eligibility ? me : await auth.refresh();
      if (!fresh) return false;
      me = fresh;
      if (me.eligibility?.ok) return true;
      const progressed = await resolveCode(me.eligibility);
      if (!progressed) return false;
    }
    return false;
  }, [requireAuth, auth, resolveCode]);

  /** For a 403 thrown by an action: opens the right modal; resolves true if the caller should retry. */
  const handleGateError = useCallback(async (err: unknown): Promise<boolean> => {
    if (!isApiError(err)) return false;
    if (err.status === 401) return !!(await requireAuth());
    if (err.status !== 403 || !err.code) return false;
    const progressed = await resolveCode({ ok: false, code: err.code, message: err.message, details: err.details });
    if (!progressed) return false;
    return ensureEligible();
  }, [requireAuth, resolveCode, ensureEligible]);

  return { requireAuth, ensureEligible, handleGateError };
}
