/**
 * Chart colour roles (validated with the dataviz palette validator against the dark navy surface #0f172a
 * and the light surface #fcfcfb). Marks use these; text always wears text tokens.
 */
export type Theme = "dark" | "light";

export interface ChartPalette {
  surface: string;
  text: string;
  textSecondary: string;
  muted: string;
  grid: string;
  axis: string;
  /** categorical slots 1..8, fixed order (never cycled) */
  series: string[];
  /** sequential ramp, low -> high, single hue (blue) */
  sequential: string[];
  /** ordinal ramp for funnels (light end still >= 2:1 on surface) */
  ordinal: string[];
  /** region status colours: live / target / paused / blocked */
  status: { live: string; target: string; paused: string; blocked: string };
  /** reserved status scale */
  good: string;
  warning: string;
  serious: string;
  critical: string;
  /** fill for regions with no data in a choropleth */
  noData: string;
  deemphasis: string;
}

const SEQ_LIGHT = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];

export const DARK: ChartPalette = {
  surface: "#0f172a",
  text: "#f1f5f9",
  textSecondary: "#b6c0d1",
  muted: "#7f8aa3",
  grid: "#1f2a44",
  axis: "#2c3a5c",
  series: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
  // dark anchors flip: low = deep step near the surface, high = light step that glows
  sequential: [...SEQ_LIGHT].reverse(),
  ordinal: ["#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95"].reverse(),
  status: { live: "#19b25b", target: "#36a6ff", paused: "#ffb020", blocked: "#3b4a66" },
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#e05252",
  noData: "#243150",
  deemphasis: "#3b4a66",
};

export const LIGHT: ChartPalette = {
  surface: "#fcfcfb",
  text: "#0b0b0b",
  textSecondary: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
  sequential: SEQ_LIGHT,
  ordinal: ["#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95"],
  status: { live: "#15934a", target: "#1d84e0", paused: "#d9910a", blocked: "#c7ccd6" },
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
  noData: "#e8e9ee",
  deemphasis: "#c3c2b7",
};

export function paletteFor(theme: Theme): ChartPalette {
  return theme === "light" ? LIGHT : DARK;
}
