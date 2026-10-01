import { JURISDICTIONS } from "@gnarcadia/protocol";

/** Markdown bullet list of regions + minimum age, generated from the protocol's jurisdiction table so legal copy never drifts. */
export function eligibilityList(): string {
  const rows = Object.values(JURISDICTIONS).sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));
  return rows.map((j) => `- **${j.name}** (${j.country === "CA" ? "Canada" : "United States"}): ${j.minAge}+ · ${j.status === "paused" ? "temporarily paused" : j.status === "blocked" ? "not available" : "available"}${j.note ? ` — *${j.note}*` : ""}`).join("\n");
}
