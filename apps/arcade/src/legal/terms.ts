import { eligibilityList } from "./eligibility.ts";

export const TERMS_VERSION_LABEL = "Draft — October 2026";

export const TERMS = `# Terms of Service

> **DRAFT — NOT YET IN EFFECT.** This is placeholder text for product development. Counsel must review and finalise every section before launch.

## 1. What Gnarcadia is

Gnarcadia is an online arcade where players compete against each other in **games of skill** for prizes. Outcomes are determined by player ability — reaction time, strategy, accuracy and practice — not by chance. Where a game uses any randomness (for example a puzzle layout), every entrant in a contest receives the **identical seeded round**, so the random element is the same for everyone and cannot favour one player over another.

Gnarcadia is **not** a casino, lottery or sportsbook. We do not offer games of chance and we never take a position against players: entry fees fund the prize pool and Gnarcadia earns a disclosed platform fee.

## 2. Eligibility

To create an account you must be at least **18 years old**. To enter **cash contests** you must additionally:

- be physically located in a region where we offer cash play (see below) at the time you enter;
- meet that region's minimum age (19+ in Ontario, British Columbia and Nova Scotia);
- have completed identity verification;
- not be self-excluded, on a cooling-off break, or otherwise restricted by us;
- not be a Gnarcadia employee, contractor, or game developer competing in their own game.

Regions currently supported for cash play:

${eligibilityList()}

Practice (free) play is available everywhere we operate.

## 3. Fees and prize pools — plain-language disclosure

- Each cash contest shows its **entry fee** before you join.
- Entry fees from all entrants form the **gross prize pool**.
- Gnarcadia deducts a **platform fee ("rake")**, shown as a percentage on every lobby **before you pay** (typically 10%, never more than 25%).
- The remaining **net prize pool** is paid to winners according to the payout table shown in the lobby.
- If a contest is cancelled (for example, not enough players), entry fees are **refunded in full**.
- Deposits and withdrawals may carry processor fees, shown in the cashier before you confirm.

## 4. Your wallet

Your wallet balance is held in trust for you in a segregated account and is not Gnarcadia's operating money. Deposits are subject to a daily limit you can lower at any time. Withdrawals go back to a payment method in your own name; we may ask for additional verification for larger amounts or where required by tax law.

## 5. Fair play

You agree not to use bots, scripts, macros, emulators, multiple accounts, collusion, exploitation of bugs, or any tool that provides an unfair advantage. Every cash round records an input log that we may replay to verify results. Breaches may result in forfeiture of prizes, account closure and reporting to authorities where required.

## 6. Disputes and results

Results are computed by our authoritative servers. If you believe a result is wrong, open a dispute from the match screen or email **support@gnarcadia.example** within **72 hours**. We will review the match log and respond within 10 business days. Prizes for disputed matches are held until the review completes. If you disagree with our decision you may escalate to the independent arbitration process described in Section 11.

## 7. Responsible play

We offer deposit limits, cooling-off breaks (24h–30 days) and self-exclusion (6 months or more). See our [Responsible Play policy](/legal/responsible-play). If play stops being fun, stop playing — and reach out; we're here to help.

## 8. Marketplace

Cosmetic items are licensed, not sold, and have no cash value. **Cosmetics never affect gameplay.** Purchases are final except where required by law.

## 9. Account suspension

We may suspend or close accounts that breach these terms, present a fraud or chargeback risk, or where required by law. Legitimate balances remain withdrawable unless subject to a lawful hold.

## 10. Limitation of liability

To the fullest extent permitted by law, Gnarcadia's total liability to you is limited to the greater of your wallet balance and the fees you paid us in the preceding 12 months. Nothing limits liability that cannot be limited by law.

## 11. Governing law and arbitration

*Placeholder: counsel to specify governing law per jurisdiction (e.g. Ontario for Canadian players, Delaware for US players), small-claims carve-out and class-waiver language where enforceable.*

## 12. Changes

We may update these terms. Material changes require your renewed acceptance before your next cash contest.

---

Contact: **support@gnarcadia.example** · Gnarcadia Inc. (placeholder entity name)
`;
