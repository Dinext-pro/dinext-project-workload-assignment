/**
 * ECharts option builders for workload-reports v3.
 * Payload contract: { periods, series, meta }.
 */

import {
	ACTUAL_BAR_WIDTH,
	CAPACITY_AREA_OPACITY,
	CAPACITY_LINE_OPACITY,
	FACT_COLORS,
	FORECAST_BAR_WIDTH,
	FORECAST_COLORS,
	LINE_COLORS,
	UTILIZATION_FORECAST_BORDER,
	UTILIZATION_FORECAST_COLOR,
	Z_ACTUAL_BAR,
	Z_CAPACITY,
	Z_FORECAST_BAR,
	Z_PROJECT_PLAN,
	Z_UTILIZATION_FORECAST,
	Z_UTILIZATION_PLAN,
	getChartThemeColors,
} from "./theme.js";

const WTYPES = ["Employee", "Supplier"];

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

const _lineSeries = ({ name, lineColor, areaColor, lineOpacity, areaOpacity, z, data, lineWidth }) => ({
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
	},
	areaStyle: {
		color: areaColor || lineColor,
		opacity: areaOpacity ?? 0.12,
	},
	data: hideZeros(data),
});

const _forecastBar = (name, stackId, data, wtype) => ({
	name,
	type: "bar",
	stack: stackId,
	z: Z_FORECAST_BAR,
	barWidth: FORECAST_BAR_WIDTH,
	itemStyle: { color: FORECAST_COLORS[wtype], opacity: 0.9 },
	emphasis: { focus: "series" },
	data: data || [],
});

const _actualBar = (name, stackId, data, wtype) => ({
	name,
	type: "bar",
	stack: stackId,
	z: Z_ACTUAL_BAR,
	barWidth: ACTUAL_BAR_WIDTH,
	barGap: "-100%",
	itemStyle: { color: FACT_COLORS[wtype], opacity: 1 },
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
});

/** Append Employee/Supplier forecast (+ optional fact) bars by filter. */
export const appendWtypeBars = (chartSeries, opts) => {
	const {
		forecastByWtype,
		actualByWtype,
		forecastStackId,
		workerWtypeFilter,
		showFact,
	} = opts;

	for (const wtype of WTYPES) {
		if (!_wtypeIncluded(wtype, workerWtypeFilter)) continue;

		chartSeries.push(
			_forecastBar(
				wtype === "Employee" ? __("Employee forecast") : __("Supplier forecast"),
				forecastStackId,
				filterWtypeSeries(forecastByWtype?.[wtype], wtype, workerWtypeFilter),
				wtype
			)
		);

		if (showFact) {
			chartSeries.push(
				_actualBar(
					wtype === "Employee" ? __("Employee fact") : __("Supplier fact"),
					"actual",
					filterWtypeSeries(actualByWtype?.[wtype], wtype, workerWtypeFilter),
					wtype
				)
			);
		}
	}
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
				const raw = Array.isArray(item.value)
					? item.value[item.value.length - 1]
					: item.value;
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
				color: colors.border,
				opacity: 0.4,
				width: 0.5,
			},
		},
	};
};

export const buildSyncedXAxis = (labels) => ({
	type: "category",
	data: labels,
	boundaryGap: true,
	axisLabel: { show: false },
	axisTick: { show: false },
});

const _baseOption = (labels, chartSeries, themeColors) => ({
	backgroundColor: "transparent",
	aria: { enabled: true },
	tooltip: buildAxisTooltip(themeColors),
	legend: buildChartLegend(),
	grid: buildSyncedGrid(),
	xAxis: buildSyncedXAxis(labels),
	yAxis: buildSyncedYAxis(themeColors),
	series: chartSeries,
});

/**
 * Team / report chart option.
 * series: capacity_hours, workload_forecast_hours_by_wtype.{Employee,Supplier}
 * optional: actual_hours_by_wtype, utilization_plan_hours, utilization_forecast_hours
 */
export const buildReportChartOption = (payload, viewType) => {
	const periods = payload?.periods || [];
	const series = payload?.series || {};
	const meta = payload?.meta || {};
	const workerWtypeFilter = meta.worker_wtype_filter || "all";
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
	}

	appendWtypeBars(chartSeries, {
		forecastByWtype: series.workload_forecast_hours_by_wtype,
		actualByWtype: series.actual_hours_by_wtype,
		forecastStackId: "workload",
		workerWtypeFilter,
		showFact,
	});

	return _baseOption(labels, chartSeries, themeColors);
};

/**
 * Project tab chart option.
 * series: team_capacity_hours, project_plan_hours, workload_forecast_hours_by_wtype
 * optional: actual_hours_by_wtype, utilization_plan_hours, utilization_forecast_hours
 */
export const buildProjectChartOption = (payload, viewType) => {
	const periods = payload?.periods || [];
	const series = payload?.series || {};
	const meta = payload?.meta || {};
	const workerWtypeFilter = meta.worker_wtype_filter || "all";
	const labels = periodLabels(periods, viewType);
	const themeColors = getChartThemeColors();
	const showFact = !!meta.actual_loaded;
	const showUtilization = !!meta.utilization_loaded;

	const chartSeries = [
		_lineSeries({
			name: __("Team capacity"),
			lineColor: LINE_COLORS.teamCapacity,
			areaColor: LINE_COLORS.teamCapacityArea,
			lineOpacity: CAPACITY_LINE_OPACITY,
			areaOpacity: CAPACITY_AREA_OPACITY,
			z: Z_CAPACITY,
			data: series.team_capacity_hours,
		}),
		_lineSeries({
			name: __("Project plan"),
			lineColor: LINE_COLORS.projectPlan,
			areaColor: LINE_COLORS.projectPlan,
			lineOpacity: 0.85,
			areaOpacity: 0.15,
			z: Z_PROJECT_PLAN,
			data: series.project_plan_hours,
		}),
	];

	if (showUtilization) {
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
	}

	appendWtypeBars(chartSeries, {
		forecastByWtype: series.workload_forecast_hours_by_wtype,
		actualByWtype: series.actual_hours_by_wtype,
		forecastStackId: "forecast",
		workerWtypeFilter,
		showFact,
	});

	return _baseOption(labels, chartSeries, themeColors);
};
