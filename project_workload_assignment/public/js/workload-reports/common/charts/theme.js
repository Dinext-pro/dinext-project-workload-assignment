/** Chart theme constants for workload-reports v3. */

export const FORECAST_COLORS = {
	Employee: "#d8b4fe",
	Supplier: "#a8d8ff",
};

export const FACT_COLORS = {
	Employee: "#7a6894",
	Supplier: "#2f7d91",
};

/** [forecast, fact] pairs for stacked bars by project role. Cycles if more roles. */
export const ROLE_PALETTE = [
	["#d8b4fe", "#7a6894"],
	["#a8d8ff", "#2f7d91"],
	["#b8d4b8", "#4a7c59"],
	["#f5d0a8", "#b07a3a"],
	["#f2b8b8", "#9a5555"],
	["#c5c8e8", "#5a5f8a"],
	["#b8dce8", "#3d7a88"],
	["#e8d5b8", "#8a7040"],
	["#d4c4b0", "#6e5a48"],
	["#c8d4c0", "#5a6e58"],
];

export const FORECAST_BAR_WIDTH = "36%";
export const ACTUAL_BAR_WIDTH = "18%";
/** Overlay fact on forecast: -75% centers 18% bar inside 36% (barGap vs previous width). */
export const ACTUAL_OVER_FORECAST_BAR_GAP = "-75%";
export const ACTUAL_BAR_TOP_RADIUS = 5;
/** Vertical «today» marker through current period bar (ECharts markLine). */
export const CURRENT_DATE_LINE_WIDTH = 1;

export const LINE_COLORS = {
	capacity: "#243660",
	capacityArea: "#243660",
	teamCapacity: "#243660",
	teamCapacityArea: "#243660",
	teamCapacityNet: "#5b7c99",
	teamCapacityNetArea: "#5b7c99",
	projectPlan: "#91cc75",
	utilizationPlan: "#5d4037",
};

export const CAPACITY_LINE_OPACITY = 0.18;
export const CAPACITY_AREA_OPACITY = 0.28;

export const UTILIZATION_FORECAST_COLOR = "#c9a66b";
export const UTILIZATION_FORECAST_BORDER = "#a67c52";
export const UTILIZATION_ACTUAL_COLOR = "#8d6e63";
export const UTILIZATION_ACTUAL_BORDER = "#6d4c41";

export const Z_CAPACITY = 1;
export const Z_FORECAST_BAR = 3;
export const Z_ACTUAL_BAR = 6;
export const Z_UTILIZATION_PLAN = 7;
export const Z_UTILIZATION_FORECAST = 8;
export const Z_UTILIZATION_ACTUAL = 9;
export const Z_PROJECT_PLAN = 10;

export const Y_AXIS_GUTTER_PX = 50;
export const DEFAULT_LABEL_GUTTER_PX = 220;
export const LEGEND_BAND_PX = 0;
export const CHART_DATA_HEIGHT_PX = 180;
export const CHART_PLOT_HEIGHT_PX = CHART_DATA_HEIGHT_PX;
export const CHART_TOTAL_HEIGHT_PX = CHART_DATA_HEIGHT_PX + LEGEND_BAND_PX;
export const CHART_HEIGHT = `${CHART_TOTAL_HEIGHT_PX}px`;
export const CHART_PLOT_HEIGHT = `${CHART_PLOT_HEIGHT_PX}px`;

const _isDarkTheme = () => {
	// Desk toggle writes `data-theme-mode` first; `data-theme` follows via frappe.ui.set_theme.
	const mode = document.documentElement.getAttribute("data-theme-mode");
	if (mode === "dark") return true;
	if (mode === "light") return false;
	const theme = document.documentElement.getAttribute("data-theme");
	if (theme === "dark" || theme === "light") {
		return theme === "dark";
	}
	return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
};

/** ECharts does not resolve CSS vars — compute a real color at call time. */
const _resolveCssColor = (value, fallback) => {
	const raw = (value || "").trim();
	if (!raw) return fallback;
	if (!raw.includes("var(")) return raw;
	const probe = document.createElement("span");
	probe.style.color = raw;
	document.documentElement.appendChild(probe);
	const resolved = getComputedStyle(probe).color;
	probe.remove();
	if (!resolved || resolved === "rgba(0, 0, 0, 0)" || resolved === "transparent") {
		return fallback;
	}
	return resolved;
};

const _cssVarColor = (rootStyle, name, fallback) =>
	_resolveCssColor(rootStyle.getPropertyValue(name), fallback);

/** Resolve chart UI colors from Frappe CSS vars / theme. gridLine matches P&L. */
export const getChartThemeColors = () => {
	const root = getComputedStyle(document.documentElement);
	const dark = _isDarkTheme();
	const fallbackBorder = dark ? "#3a3a3a" : "#d1d8dd";
	const fallbackGridLine = dark ? "rgba(255, 255, 255, 0.08)" : "#e8e8e8";
	const fallbackText = dark ? "#e2e2e2" : "#333333";
	const fallbackMuted = dark ? "#a0a0a0" : "#748094";
	const fallbackBg = dark ? "#1e1e1e" : "#ffffff";
	const border = _cssVarColor(root, "--border-color", fallbackBorder);
	return {
		text: _cssVarColor(root, "--text-color", fallbackText),
		muted: _cssVarColor(root, "--text-muted", fallbackMuted),
		border,
		gridLine: dark ? fallbackGridLine : border || fallbackGridLine,
		bg: _cssVarColor(root, "--card-bg", fallbackBg),
	};
};
