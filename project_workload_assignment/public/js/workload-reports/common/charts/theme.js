/** Chart theme constants for workload-reports v3. */

export const FORECAST_COLORS = {
	Employee: "#d8b4fe",
	Supplier: "#a8d8ff",
};

export const FACT_COLORS = {
	Employee: "#531dab",
	Supplier: "#003eb3",
};

export const FORECAST_BAR_WIDTH = "36%";
export const ACTUAL_BAR_WIDTH = "18%";

export const LINE_COLORS = {
	capacity: "#243660",
	capacityArea: "#243660",
	teamCapacity: "#243660",
	teamCapacityArea: "#243660",
	projectPlan: "#91cc75",
	utilizationPlan: "#5d4037",
};

export const CAPACITY_LINE_OPACITY = 0.18;
export const CAPACITY_AREA_OPACITY = 0.28;

export const UTILIZATION_FORECAST_COLOR = "#c9a66b";
export const UTILIZATION_FORECAST_BORDER = "#a67c52";

export const Z_CAPACITY = 1;
export const Z_PROJECT_PLAN = 2;
export const Z_FORECAST_BAR = 3;
export const Z_ACTUAL_BAR = 6;
export const Z_UTILIZATION_PLAN = 7;
export const Z_UTILIZATION_FORECAST = 8;

export const Y_AXIS_GUTTER_PX = 50;
export const DEFAULT_LABEL_GUTTER_PX = 220;
export const LEGEND_BAND_PX = 36;
export const CHART_DATA_HEIGHT_PX = 200;
export const CHART_PLOT_HEIGHT_PX = CHART_DATA_HEIGHT_PX;
export const CHART_TOTAL_HEIGHT_PX = CHART_DATA_HEIGHT_PX + LEGEND_BAND_PX;
export const CHART_HEIGHT = `${CHART_TOTAL_HEIGHT_PX}px`;
export const CHART_PLOT_HEIGHT = `${CHART_PLOT_HEIGHT_PX}px`;

const _isDarkTheme = () => {
	const theme = document.documentElement.getAttribute("data-theme");
	if (theme === "dark" || theme === "light") {
		return theme === "dark";
	}
	const mode = document.documentElement.getAttribute("data-theme-mode");
	if (mode === "dark") return true;
	if (mode === "light") return false;
	return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
};

/** Resolve chart UI colors from Frappe CSS vars / theme. */
export const getChartThemeColors = () => {
	const root = getComputedStyle(document.documentElement);
	const dark = _isDarkTheme();
	return {
		text: root.getPropertyValue("--text-color").trim() || (dark ? "#e2e2e2" : "#333333"),
		muted: root.getPropertyValue("--text-muted").trim() || (dark ? "#a0a0a0" : "#748094"),
		border: root.getPropertyValue("--border-color").trim() || (dark ? "#3a3a3a" : "#d1d8dd"),
		bg: root.getPropertyValue("--card-bg").trim() || (dark ? "#1e1e1e" : "#ffffff"),
	};
};
