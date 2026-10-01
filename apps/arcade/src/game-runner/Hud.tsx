import { clock, money, formatLabel } from "../lib/format.ts";
import type { Currency } from "@gnarcadia/protocol";

interface Props {
  gameName: string;
  format: string;
  remainingSec: number | null;
  entryCents: number;
  prizeCents: number | null;
  currency: Currency;
  practice: boolean;
  rosterCount?: { n: number; max: number } | null;
  paused?: boolean;
  onLeave: () => void;
}

export function Hud({ gameName, format, remainingSec, entryCents, prizeCents, currency, practice, rosterCount, paused, onLeave }: Props) {
  const low = remainingSec != null && remainingSec <= 10;
  return (
    <div className="hud" role="toolbar" aria-label="Match controls">
      <div className="hud__left">
        <span className="hud__game">{gameName}</span>
        <span className="hud__fmt">{formatLabel(format)}{practice ? " · Practice" : ""}</span>
      </div>
      <div className="hud__center">
        {remainingSec != null && <span className={`hud__timer ${low ? "is-low" : ""}`} aria-live={low ? "assertive" : "off"} aria-label={`Time remaining ${clock(remainingSec)}`}>⏱ {clock(remainingSec)}</span>}
        {paused && <span className="hud__paused">Paused</span>}
      </div>
      <div className="hud__right">
        {rosterCount && <span className="hud__roster" aria-label={`${rosterCount.n} of ${rosterCount.max} players`}>👥 {rosterCount.n}/{rosterCount.max}</span>}
        {!practice && <span className="hud__money" aria-label={`Entry ${money(entryCents, currency)}${prizeCents != null ? `, prize pool ${money(prizeCents, currency)}` : ""}`}>{money(entryCents, currency, { compact: true })} <span aria-hidden="true">→</span> {prizeCents != null ? money(prizeCents, currency, { compact: true }) : "…"}</span>}
        <button type="button" className="btn btn--sm btn--glass hud__leave" onClick={onLeave}>Leave</button>
      </div>
    </div>
  );
}
