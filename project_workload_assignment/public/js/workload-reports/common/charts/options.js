/**
 * ECharts option builders for workload-reports v3.
 * Payload contract: { periods, series, meta }.
 */

import {
	ACTUAL_BAR_TOP_RADIUS,
	ACTUAL_BAR_WIDTH,
	ACTUAL_OVER_FORECAST_BAR_GAP,
	CAPACITY_AREA_OPACITY,
	CAPACITY_LINE_OPACITY,
	CURRENT_DATE_LINE_WIDTH,
	FACT_COLORS,
	FORECAST_BAR_WIDTH,
	FORECAST_COLORS,
	ROLE_PALETTE,
	LINE_COLORS,
	UTILIZATION_FORECAST_BORDER,
	UTILIZATION_FORECAST_COLOR,
	UTILIZATION_ACTUAL_BORDER,
	UTILIZATION_ACTUAL_COLOR,
	Z_ACTUAL_BAR,
	Z_CAPACITY,
	Z_FORECAST_BAR,
	Z_PROJECT_PLAN,
	Z_UTILIZATION_ACTUAL,
	Z_UTILIZATION_FORECAST,
	Z_UTILIZATION_PLAN,
	getChartThemeColors,
} from "./theme.js";

const WTYPES = ["Employee", "Supplier"];
/** ~85% of category band (not 80% of 36% bar slot) so ~3 dashes fit. */
const PROJECT_PLAN_DASH_CATEGORY_FILL = 0.85;
const PROJECT_PLAN_DASH_LINE_WIDTH = 2;
/** 3 dashes + 2 gaps: dash = gap = width / 5. */
const PROJECT_PLAN_DASH_PATTERN_UNITS = 5;

/** Map period → X-axis label by view_type. */
export const periodLabels = (periods, viewType) =>
	(periods || []).map((p) => {
		if (viewType === "daily") {
			const date = p.date || "";
			return frappe?.datetime?.str_to_user ? frappe.datetime.str_to_user(date) : date;
		}
		if (viewType === "weekly") {
			return `${p.start_date} — ${p.end_date}`;
		}
		return `${p.year}-${String(p.month).padStart(2, "0")}`;
	});

/** 0 / non-finite → null (hide zero points). */
export const hideZeros = (data) =>
	(data || []).map((value) => {
		const hours = Number(value);
		return Number.isFinite(hours) && hours > 0 ? hours : null;
	});

const _wtypeIncluded = (wtype, filter) => {
	const f = filter || "all";
	return f === "all" || f === wtype;
};

/** Filter by worker_wtype + hide zeros; keep period alignment. */
export const filterWtypeSeries = (data, wtype, workerWtypeFilter) => {
	const rows = data || [];
	if (!_wtypeIncluded(wtype, workerWtypeFilter)) {
		return rows.map(() => null);
	}
	return hideZeros(rows);
};

const _lineSeries = ({ name, lineColor, areaColor, lineOpacity, areaOpacity, z, data, lineWidth, dashed }) => ({
	name,
	type: "line",
	smooth: true,
	showSymbol: false,
	z: z ?? Z_CAPACITY,
	itemStyle: { color: lineColor },
	lineStyle: {
		color: lineColor,
		opacity: lineOpacity ?? 0.85,
		width: lineWidth ?? 2,
		...(dashed ? { type: "dashed" } : {}),
	},
	areaStyle: {
		color: areaColor || lineColor,
		opacity: areaOpacity ?? 0.12,
	},
	emphasis: { focus: "series" },
	data: hideZeros(data),
});

/** Centered dash over the category band; gap left so adjacent periods do not glue. */
export const getProjectPlanDashGeometry = (categoryBandWidth) => {
	const dashWidth = categoryBandWidth * PROJECT_PLAN_DASH_CATEGORY_FILL;
	return {
		offsetX: 0,
		dashWidth,
		slotWidth: categoryBandWidth,
	};
};

/** Pixel lineDash for ≈3 dashes on the segment (3 dash + 2 gap). */
export const getProjectPlanLineDash = (dashWidth) => {
	if (!Number.isFinite(dashWidth) || dashWidth <= 0) {
		return [4, 4];
	}
	const unit = dashWidth / PROJECT_PLAN_DASH_PATTERN_UNITS;
	return [unit, unit];
};

export const buildProjectPlanDashSeries = (hours, color = LINE_COLORS.projectPlan) => {
	const values = hideZeros(hours);
	const data = values.map((value, index) => [index, value]);
	return {
		name: __("Project plan"),
		type: "custom",
		z: Z_PROJECT_PLAN,
		color,
		itemStyle: { color },
		renderItem(params, api) {
			const planValue = api.value(1);
			if (planValue == null || Number.isNaN(planValue) || planValue <= 0) {
				return;
			}
			const categoryIndex = api.value(0);
			const point = api.coord([categoryIndex, planValue]);
			const bandWidth = api.size([1, 0])[0];
			if (!Number.isFinite(bandWidth) || bandWidth <= 0) {
				return;
			}
			const geo = getProjectPlanDashGeometry(bandWidth);
			const xCenter = point[0] + geo.offsetX;
			const halfWidth = geo.dashWidth / 2;
			const y = point[1];
			return {
				type: "line",
				shape: {
					x1: xCenter - halfWidth,
					y1: y,
					x2: xCenter + halfWidth,
					y2: y,
				},
				style: {
					stroke: color,
					lineWidth: PROJECT_PLAN_DASH_LINE_WIDTH,
					lineDash: getProjectPlanLineDash(geo.dashWidth),
				},
			};
		},
		encode: { x: 0, y: 1 },
		data,
		tooltip: { show: true },
	};
};

const _forecastBar = (name, stackId, data, color) => ({
	name,
	type: "bar",
	stack: stackId,
	z: Z_FORECAST_BAR,
	barWidth: FORECAST_BAR_WIDTH,
	itemStyle: { color, opacity: 0.9 },
	emphasis: { focus: "series" },
	data: data || [],
});

const ACTUAL_TOP_RADIUS = [ACTUAL_BAR_TOP_RADIUS, ACTUAL_BAR_TOP_RADIUS, 0, 0];

const _asBarValue = (value) => {
	if (value == null || typeof value !== "object") return value;
	if (Array.isArray(value)) return value[value.length - 1];
	if ("value" in value) return value.value;
	return value;
};

/** Round only the topmost non-null stack segment in each period. */
export const withTopStackRadius = (stackSeries, radius = ACTUAL_TOP_RADIUS) => {
	const series = (stackSeries || []).map((data) => data || []);
	return series.map((data, seriesIdx) =>
		data.map((value, periodIdx) => {
			if (value == null) return null;
			const hasUpper = series
				.slice(seriesIdx + 1)
				.some((upper) => upper[periodIdx] != null);
			if (hasUpper) return value;
			if (value && typeof value === "object" && !Array.isArray(value)) {
				return {
					...value,
					itemStyle: { ...(value.itemStyle || {}), borderRadius: radius },
				};
			}
			return { value, itemStyle: { borderRadius: radius } };
		})
	);
};

const _actualBar = (name, stackId, data, color, { barGap } = {}) => ({
	name,
	type: "bar",
	stack: stackId,
	z: Z_ACTUAL_BAR,
	barWidth: ACTUAL_BAR_WIDTH,
	...(barGap != null ? { barGap } : {}),
	itemStyle: {
		color,
		opacity: 1,
	},
	emphasis: { focus: "series" },
	data: data || [],
});

const _utilizationForecast = (hours) => ({
	name: __("Utilization forecast"),
	type: "line",
	z: Z_UTILIZATION_FORECAST,
	showSymbol: true,
	showAllSymbol: true,
	symbol: "circle",
	symbolSize: 8,
	lineStyle: { width: 0, opacity: 0 },
	itemStyle: {
		color: UTILIZATION_FORECAST_COLOR,
		opacity: 0.95,
		borderColor: UTILIZATION_FORECAST_BORDER,
		borderWidth: 1,
	},
	data: hideZeros(hours),
	utilizationForecast: true,
	emphasis: { focus: "series", scale: true },
});

const _utilizationActual = (hours) => ({
	name: __("Utilization fact"),
	type: "line",
	z: Z_UTILIZATION_ACTUAL,
	showSymbol: true,
	showAllSymbol: true,
	symbol: "diamond",
	symbolSize: 8,
	lineStyle: { width: 0, opacity: 0 },
	itemStyle: {
		color: UTILIZATION_ACTUAL_COLOR,
		opacity: 0.95,
		borderColor: UTILIZATION_ACTUAL_BORDER,
		borderWidth: 1,
	},
	data: hideZeros(hours),
	utilizationActual: true,
	emphasis: { focus: "series", scale: true },
});

const _appendUtilizationSeries = (chartSeries, series, showFact) => {
	chartSeries.push(
		_lineSeries({
			name: __("Utilization plan"),
			lineColor: LINE_COLORS.utilizationPlan,
			areaColor: LINE_COLORS.utilizationPlan,
			lineOpacity: 0.85,
			areaOpacity: 0.12,
			z: Z_UTILIZATION_PLAN,
			data: series.utilization_plan_hours,
		}),
		_utilizationForecast(series.utilization_forecast_hours)
	);
	if (showFact) {
		chartSeries.push(_utilizationActual(series.utilization_actual_hours));
	}
};

/** Append Employee/Supplier forecast (+ optional fact) bars by filter. */
export const appendWtypeBars = (chartSeries, opts) => {
	const {
		forecastByWtype,
		actualByWtype,
		forecastStackId,
		workerWtypeFilter,
		showFact,
	} = opts;

	const included = WTYPES.filter((wtype) => _wtypeIncluded(wtype, workerWtypeFilter));

	for (const wtype of included) {
		chartSeries.push(
			_forecastBar(
				wtype === "Employee" ? __("Employee forecast") : __("Supplier forecast"),
				forecastStackId,
				filterWtypeSeries(forecastByWtype?.[wtype], wtype, workerWtypeFilter),
				FORECAST_COLORS[wtype]
			)
		);
	}

	if (!showFact) return;

	const actualRows = included.map((wtype) =>
		filterWtypeSeries(actualByWtype?.[wtype], wtype, workerWtypeFilter)
	);
	const actualWithRadius = withTopStackRadius(actualRows);

	included.forEach((wtype, index) => {
		chartSeries.push(
			_actualBar(
				wtype === "Employee" ? __("Employee fact") : __("Supplier fact"),
				"actual",
				actualWithRadius[index],
				FACT_COLORS[wtype],
				{
					barGap: index === 0 ? ACTUAL_OVER_FORECAST_BAR_GAP : undefined,
				}
			)
		);
	});
};

const _sortRoleKeys = (keys) =>
	[...keys].sort((a, b) => {
		if (a === "" && b !== "") return 1;
		if (b === "" && a !== "") return -1;
		return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
	});

const _roleHasHours = (forecastByRole, actualByRole, key) => {
	const forecast = forecastByRole?.[key] || [];
	const actual = actualByRole?.[key] || [];
	return (
		forecast.some((value) => Number(value) > 0) ||
		actual.some((value) => Number(value) > 0)
	);
};

const _roleLabel = (key) => key || __("No role");

/** Append forecast (+ optional fact) bars stacked by project role. */
export const appendRoleBars = (chartSeries, opts) => {
	const { forecastByRole, actualByRole, forecastStackId, showFact } = opts;
	const keySet = new Set([
		...Object.keys(forecastByRole || {}),
		...Object.keys(actualByRole || {}),
	]);
	const keys = _sortRoleKeys([...keySet]).filter((key) =>
		_roleHasHours(forecastByRole, actualByRole, key)
	);
	if (!keys.length) return;

	keys.forEach((key, index) => {
		const pair = ROLE_PALETTE[index % ROLE_PALETTE.length];
		chartSeries.push(
			_forecastBar(
				`${_roleLabel(key)} ${__("Forecast")}`,
				forecastStackId,
				hideZeros(forecastByRole?.[key]),
				pair[0]
			)
		);
	});

	if (!showFact) return;

	const factKeys = keys.filter((key) =>
		(actualByRole?.[key] || []).some((value) => Number(value) > 0)
	);
	if (!factKeys.length) return;

	const actualRows = factKeys.map((key) => hideZeros(actualByRole?.[key]));
	const actualWithRadius = withTopStackRadius(actualRows);
	const colorIndex = (key) => keys.indexOf(key);

	factKeys.forEach((key, index) => {
		const pair = ROLE_PALETTE[colorIndex(key) % ROLE_PALETTE.length];
		chartSeries.push(
			_actualBar(
				`${_roleLabel(key)} ${__("Fact")}`,
				"actual",
				actualWithRadius[index],
				pair[1],
				{
					barGap: index === 0 ? ACTUAL_OVER_FORECAST_BAR_GAP : undefined,
				}
			)
		);
	});
};

const _appendWorkloadBars = (chartSeries, series, opts) => {
	const { forecastStackId, workerWtypeFilter, showFact, stackBy } = opts;
	if (stackBy === "role") {
		appendRoleBars(chartSeries, {
			forecastByRole: series.workload_forecast_hours_by_role,
			actualByRole: series.actual_hours_by_role,
			forecastStackId,
			showFact,
		});
		return;
	}
	appendWtypeBars(chartSeries, {
		forecastByWtype: series.workload_forecast_hours_by_wtype,
		actualByWtype: series.actual_hours_by_wtype,
		forecastStackId,
		workerWtypeFilter,
		showFact,
	});
};

export const buildAxisTooltip = (themeColors) => {
	const colors = themeColors || getChartThemeColors();
	return {
		trigger: "axis",
		appendToBody: true,
		confine: false,
		backgroundColor: colors.bg,
		borderColor: colors.border,
		textStyle: { color: colors.text },
		formatter(params) {
			const items = Array.isArray(params) ? params : [params];
			if (!items.length) return "";
			const header = items[0].axisValueLabel || items[0].name || "";
			const lines = [header];
			for (const item of items) {
				const raw = _asBarValue(item.value);
				if (raw == null || raw === "") continue;
				const num = Number(raw);
				if (!Number.isFinite(num)) continue;
				lines.push(`${item.marker || ""}${item.seriesName}: ${num.toFixed(1)}`);
			}
			return lines.length > 1 ? lines.join("<br/>") : header;
		},
	};
};

export const buildChartLegend = () => ({ show: false });

export const buildSyncedGrid = () => ({
	left: 0,
	right: 0,
	top: 8,
	bottom: 8,
	containLabel: false,
});

export const buildSyncedYAxis = (themeColors) => {
	const colors = themeColors || getChartThemeColors();
	return {
		type: "value",
		axisLabel: { show: false },
		axisTick: { show: false },
		axisLine: { show: false },
		name: "",
		splitLine: {
			show: true,
			lineStyle: {
				color: colors.gridLine,
				width: 1,
			},
		},
	};
};

export const buildSyncedXAxis = (labels, themeColors) => {
	const colors = themeColors || getChartThemeColors();
	return {
		type: "category",
		data: labels,
		boundaryGap: true,
		axisLabel: { show: false },
		axisTick: { show: false },
		splitLine: {
			show: true,
			lineStyle: {
				color: colors.gridLine,
				width: 1,
			},
		},
	};
};

/**
 * Index of period bucket that contains today (−1 if outside chart range).
 * Mirrors budget_report / project_pl_echarts get_pl_chart_current_period_index,
 * extended for daily + start/end weekly periods.
 */
export const getCurrentPeriodIndex = (periods) => {
	if (!periods?.length) {
		return -1;
	}
	const todayStr =
		frappe?.datetime?.get_today?.() ||
		(() => {
			const d = new Date();
			return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
				d.getDate()
			).padStart(2, "0")}`;
		})();

	const today = frappe?.datetime?.str_to_obj
		? frappe.datetime.str_to_obj(todayStr)
		: new Date(`${todayStr}T00:00:00`);
	if (!today || typeof today.getFullYear !== "function") {
		return -1;
	}
	const year = today.getFullYear();
	const month = today.getMonth() + 1;

	return periods.findIndex((period) => {
		if (!period) {
			return false;
		}
		if (period.date) {
			return String(period.date) === todayStr;
		}
		if (period.start_date && period.end_date) {
			return todayStr >= String(period.start_date) && todayStr <= String(period.end_date);
		}
		if (period.year != null && period.month != null) {
			return Number(period.year) === year && Number(period.month) === month;
		}
		if (period.year != null) {
			return Number(period.year) === year;
		}
		return false;
	});
};

/** Same shape as build_pl_chart_current_date_mark_line_entry (budget report). */
const _buildCurrentDateMarkLineEntry = (
	categoryIndex,
	themeColors,
	categoryLabel,
	{ showLabel = false } = {}
) => ({
	xAxis: categoryIndex,
	lineStyle: {
		color: themeColors.text,
		width: CURRENT_DATE_LINE_WIDTH,
		type: "solid",
	},
	label: {
		show: showLabel,
		formatter: categoryLabel,
		color: themeColors.text,
		fontSize: 11,
		position: "end",
	},
});

/**
 * Attach vertical «today» markLine to capacity (area) series — budget_report pattern
 * (hide_current_date_mark_line_label: true).
 */
const _applyCurrentDateMarkLine = (chartSeries, periods, labels, themeColors) => {
	const idx = getCurrentPeriodIndex(periods);
	if (idx < 0 || !chartSeries?.length) {
		return;
	}

	const target =
		chartSeries.find((s) => s?.areaStyle) ||
		chartSeries.find((s) => s?.type === "bar") ||
		chartSeries[chartSeries.length - 1];
	if (!target) {
		return;
	}

	target.markLine = {
		silent: true,
		symbol: ["none", "none"],
		precision: 2,
		lineStyle: {
			color: themeColors.muted,
			type: "dashed",
			width: 1,
		},
		label: { show: false },
		data: [
			_buildCurrentDateMarkLineEntry(idx, themeColors, labels?.[idx], {
				showLabel: false,
			}),
		],
	};
};

const _baseOption = (labels, chartSeries, themeColors) => ({
	backgroundColor: "transparent",
	aria: { enabled: true },
	tooltip: buildAxisTooltip(themeColors),
	legend: buildChartLegend(),
	grid: buildSyncedGrid(),
	xAxis: buildSyncedXAxis(labels, themeColors),
	yAxis: buildSyncedYAxis(themeColors),
	series: chartSeries,
});

/**
 * Team / report chart option.
 * series: capacity_hours, workload_forecast_hours_by_wtype.{Employee,Supplier}
 * optional: actual_hours_by_wtype, utilization_plan_hours, utilization_forecast_hours, utilization_actual_hours
 */
export const buildReportChartOption = (payload, viewType, opts = {}) => {
	const periods = payload?.periods || [];
	const series = payload?.series || {};
	const meta = payload?.meta || {};
	const workerWtypeFilter = meta.worker_wtype_filter || "all";
	const stackBy = opts.stackBy === "role" ? "role" : "wtype";
	const labels = periodLabels(periods, viewType);
	const themeColors = getChartThemeColors();
	const showFact = !!meta.actual_loaded;
	const showUtilization = !!meta.utilization_loaded;

	const chartSeries = [
		_lineSeries({
			name: __("Capacity"),
			lineColor: LINE_COLORS.capacity,
			areaColor: LINE_COLORS.capacityArea,
			lineOpacity: CAPACITY_LINE_OPACITY,
			areaOpacity: CAPACITY_AREA_OPACITY,
			z: Z_CAPACITY,
			data: series.capacity_hours,
		}),
	];

	if (showUtilization) {
		_appendUtilizationSeries(chartSeries, series, showFact);
	}

	_appendWorkloadBars(chartSeries, series, {
		forecastStackId: "workload",
		workerWtypeFilter,
		showFact,
		stackBy,
	});

	_applyCurrentDateMarkLine(chartSeries, periods, labels, themeColors);
	return _baseOption(labels, chartSeries, themeColors);
};

/**
 * Project tab chart option.
 * series: team_capacity_hours, team_capacity_net_hours, project_plan_hours, workload_forecast_hours_by_wtype
 * opts.considerLimit: ON plots net hours, OFF plots gross; one Team capacity line.
 * optional: actual_hours_by_wtype, utilization_plan_hours, utilization_forecast_hours, utilization_actual_hours
 */
export const buildProjectChartOption = (payload, viewType, opts = {}) => {
	const periods = payload?.periods || [];
	const series = payload?.series || {};
	const meta = payload?.meta || {};
	const workerWtypeFilter = meta.worker_wtype_filter || "all";
	const stackBy = opts.stackBy === "role" ? "role" : "wtype";
	const labels = periodLabels(periods, viewType);
	const themeColors = getChartThemeColors();
	const showFact = !!meta.actual_loaded;
	const showUtilization = !!meta.utilization_loaded;

	const considerLimit = opts.considerLimit == null ? true : !!opts.considerLimit;
	const capacityHours = considerLimit
		? series.team_capacity_net_hours
		: series.team_capacity_hours;

	const chartSeries = [
		_lineSeries({
			name: __("Team capacity"),
			lineColor: LINE_COLORS.teamCapacity,
			areaColor: LINE_COLORS.teamCapacityArea,
			lineOpacity: CAPACITY_LINE_OPACITY,
			areaOpacity: CAPACITY_AREA_OPACITY,
			z: Z_CAPACITY,
			data: capacityHours,
		}),
		buildProjectPlanDashSeries(series.project_plan_hours),
	];

	if (showUtilization) {
		_appendUtilizationSeries(chartSeries, series, showFact);
	}

	_appendWorkloadBars(chartSeries, series, {
		forecastStackId: "forecast",
		workerWtypeFilter,
		showFact,
		stackBy,
	});

	_applyCurrentDateMarkLine(chartSeries, periods, labels, themeColors);
	return _baseOption(labels, chartSeries, themeColors);
};
