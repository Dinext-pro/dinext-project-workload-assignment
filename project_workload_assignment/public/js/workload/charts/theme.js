// ported from workload-charts.js

export const PWR_FORECAST_COLORS = {
	Employee: "#d8b4fe",
	Supplier: "#a8d8ff",
};

export const PWR_FACT_COLORS = {
	Employee: "#531dab",
	Supplier: "#003eb3",
};

export const PWR_FORECAST_BAR_WIDTH = "36%";
export const PWR_ACTUAL_BAR_WIDTH = "18%";

export const PWR_LINE_COLORS = {
	capacityLine: "#243660",
	capacityArea: "#243660",
	teamCapacityLine: "#243660",
	teamCapacityArea: "#243660",
	projectPlan: "#91cc75",
	utilizationPlan: "#5d4037",
};

export const PWR_CAPACITY_LINE_OPACITY = 0.18;
export const PWR_CAPACITY_AREA_OPACITY = 0.28;

export const PWR_UTILIZATION_FORECAST_COLOR = "#c9a66b";
export const PWR_UTILIZATION_FORECAST_BORDER = "#a67c52";
export const PWR_Z_UTILIZATION_PLAN = 7;
export const PWR_Z_UTILIZATION_FORECAST = 8;

export const Y_AXIS_GUTTER_PX = 50;
export const DEFAULT_LABEL_GUTTER_PX = 220;
export const LEGEND_BAND_PX = 36;
export const CHART_DATA_HEIGHT_PX = 200;
export const CHART_PLOT_HEIGHT_PX = CHART_DATA_HEIGHT_PX;
export const CHART_TOTAL_HEIGHT_PX = CHART_DATA_HEIGHT_PX + LEGEND_BAND_PX;
export const CHART_HEIGHT = `${CHART_TOTAL_HEIGHT_PX}px`;
export const CHART_PLOT_HEIGHT = `${CHART_PLOT_HEIGHT_PX}px`;

function isPwrChartDarkTheme() {
	const theme = document.documentElement.getAttribute("data-theme");
	if (theme === "dark" || theme === "light") {
		return theme === "dark";
	}
	const mode = document.documentElement.getAttribute("data-theme-mode");
	if (mode === "dark") return true;
	if (mode === "light") return false;
	return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function getPwrChartThemeColors() {
	const rootStyle = getComputedStyle(document.documentElement);
	const fallbackText = isPwrChartDarkTheme() ? "#e2e2e2" : "#333333";
	const fallbackMuted = isPwrChartDarkTheme() ? "#a0a0a0" : "#748094";
	const fallbackBorder = isPwrChartDarkTheme() ? "#3a3a3a" : "#d1d8dd";
	const fallbackBg = isPwrChartDarkTheme() ? "#1e1e1e" : "#ffffff";

	return {
		text: rootStyle.getPropertyValue("--text-color").trim() || fallbackText,
		muted: rootStyle.getPropertyValue("--text-muted").trim() || fallbackMuted,
		border: rootStyle.getPropertyValue("--border-color").trim() || fallbackBorder,
		bg: rootStyle.getPropertyValue("--card-bg").trim() || fallbackBg,
	};
}
