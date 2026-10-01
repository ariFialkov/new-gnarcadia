export { TERMS, TERMS_VERSION_LABEL } from "./terms.ts";
export { PRIVACY } from "./privacy.ts";
export { RESPONSIBLE_PLAY } from "./responsible-play.ts";

export const TERMS_SUMMARY = [
  "Gnarcadia hosts skill contests — results come from how well you play, never from chance.",
  "Every contest shows its entry fee and the platform fee (rake) before you join.",
  "You must be 18+ (19+ in ON, BC, NS), located in a supported region and identity-verified to play for cash.",
  "No bots, scripts, multi-accounting or collusion. Rounds are logged and may be replayed to verify results.",
  "Disputes: raise within 72 hours; we review the match log and respond within 10 business days.",
  "Deposit limits, cooling-off and self-exclusion are always available in your profile.",
];

export const LEGAL_LINKS = [
  { to: "/legal/terms", label: "Terms of Service" },
  { to: "/legal/privacy", label: "Privacy Policy" },
  { to: "/legal/responsible-play", label: "Responsible Play" },
  { href: "mailto:support@gnarcadia.example", label: "Contact support" },
] as const;
