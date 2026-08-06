import type { Theme } from "./theme";

export type ChartPalette = {
  lineColor: string;
  topColor: string;
  bottomColor: string;
  textColor: string;
  gridColor: string;
  crosshairColor: string;
  labelBackground: string;
  labelText: string;
};

const PALETTES: Record<Theme, ChartPalette> = {
  cobalt: {
    lineColor: "#4d6bff",
    topColor: "rgba(77, 107, 255, 0.42)",
    bottomColor: "rgba(31, 68, 255, 0)",
    textColor: "#939aad",
    gridColor: "rgba(31, 68, 255, 0.12)",
    crosshairColor: "rgba(127, 150, 255, 0.7)",
    labelBackground: "#1f44ff",
    labelText: "#f3f4f7",
  },
  light: {
    lineColor: "#1f44ff",
    topColor: "rgba(31, 68, 255, 0.24)",
    bottomColor: "rgba(31, 68, 255, 0)",
    textColor: "#666e8b",
    gridColor: "rgba(31, 68, 255, 0.1)",
    crosshairColor: "rgba(31, 68, 255, 0.55)",
    labelBackground: "#1f44ff",
    labelText: "#ffffff",
  },
};

export function chartPalette(theme: Theme): ChartPalette {
  return PALETTES[theme];
}
