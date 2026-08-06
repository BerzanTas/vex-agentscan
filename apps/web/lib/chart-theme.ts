import type { Theme } from "./theme";

export type ChartPalette = {
  lineColor: string;
  topColor: string;
  bottomColor: string;
  textColor: string;
  gridColor: string;
};

const PALETTES: Record<Theme, ChartPalette> = {
  cobalt: {
    lineColor: "#1f44ff",
    topColor: "rgba(31, 68, 255, 0.35)",
    bottomColor: "rgba(31, 68, 255, 0.02)",
    textColor: "#939aad",
    gridColor: "#171e38",
  },
  light: {
    lineColor: "#1f44ff",
    topColor: "rgba(31, 68, 255, 0.22)",
    bottomColor: "rgba(31, 68, 255, 0.02)",
    textColor: "#666e8b",
    gridColor: "#dfe4f2",
  },
};

export function chartPalette(theme: Theme): ChartPalette {
  return PALETTES[theme];
}
