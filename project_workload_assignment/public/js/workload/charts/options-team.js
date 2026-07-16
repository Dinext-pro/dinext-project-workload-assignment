// ported from workload-charts.js
import {
	PWR_ACTUAL_BAR_WIDTH,
	PWR_CAPACITY_AREA_OPACITY,
	PWR_CAPACITY_LINE_OPACITY,
	PWR_FACT_COLORS,
	PWR_FORECAST_BAR_WIDTH,
	PWR_FORECAST_COLORS,
	PWR_LINE_COLORS,
	PWR_UTILIZATION_FORECAST_BORDER,
	PWR_UTILIZATION_FORECAST_COLOR,
	PWR_Z_UTILIZATION_FORECAST,
	PWR_Z_UTILIZATION_PLAN,
	getPwrChartThemeColors,
} from "./theme.js";

export function periodLabels(periods, viewType) {
	return (periods || []).map((p) => {
		if (viewType === "daily") {
			return frappe.datetime.str_to_user(p.date);
		}
		if (viewType === "weekly") {
			return `${p.start_date} — ${p.end_date}`;
		}
		return `${p.year}-${String(p.month).padStart(2, "0")}`;
	});
}

function hideZeroChartValues(data) {
	return (data || []).map((value) => {
		const hours = Number(value);
		return Number.isFinite(hours) && hours > 0 ? hours : null;
	});
}

function normalizeWorkerWtypeFilter(workerWtypeFilter) {
	if (!workerWtypeFilter || workerWtypeFilter === "all") {
		return "all";
	}
	return workerWtypeFilter;
}

function isWtypeSeriesIncluded(wtype, workerWtypeFilter) {
	const filter = normalizeWorkerWtypeFilter(workerWtypeFilter);
	return filter === "all" || filter === wtype;
}

export function filterWtypeSeriesData(data, wtype, workerWtypeFilter) {
	const rows = data || [];
	if (!isWtypeSeriesIncluded(wtype, workerWtypeFilter)) {
		return rows.map(() => null);
	}
	return hideZeroChartValues(rows);
}

export function buildPwrLineSeries(config) {
	const lineColor = config.lineColor || config.color || PWR_LINE_COLORS.capacityLine;
	const areaColor = config.areaColor || config.color || lineColor;
	const lineOpacity = config.lineOpacity != null ? config.lineOpacity : 0.85;
	const areaOpacity = config.areaOpacity != null ? config.areaOpacity : 0.12;
	return {
		name: config.name,
		type: "line",
		smooth: true,
		showSymbol: false,
		z: config.z != null ? config.z : 1,
		itemStyle: { color: lineColor },
		lineStyle: {
			color: lineColor,
			opacity: lineOpacity,
			width: config.lineWidth != null ? config.lineWidth : 2,
		},
		areaStyle: { color: areaColor, opacity: areaOpacity },
		data: config.data || [],
	};
}

function buildWtypeForecastBarSeries(name, stackId, data, wtype) {
	const color = PWR_FORECAST_COLORS[wtype] || PWR_FORECAST_COLORS.Employee;
	return {
		name,
		type: "bar",
		stack: stackId,
		z: 3,
		barWidth: PWR_FORECAST_BAR_WIDTH,
		itemStyle: { color, opacity: 0.9 },
		emphasis: { focus: "series" },
		data: data || [],
	};
}

function buildWtypeActualBarSeries(name, stackId, data, wtype) {
	const color = PWR_FACT_COLORS[wtype] || PWR_FACT_COLORS.Employee;
	return {
		name,
		type: "bar",
		stack: stackId,
		z: 6,
		barWidth: PWR_ACTUAL_BAR_WIDTH,
		barGap: "-100%",
		itemStyle: { color, opacity: 1 },
		emphasis: { focus: "series" },
		data: data || [],
	};
}

export function appendWtypeWorkloadBars(chartSeries, options) {
	const employee = options.employee;
	const supplier = options.supplier;
	const actualEmp = options.actualEmp;
	const actualSup = options.actualSup;
	const forecastStackId = options.forecastStackId;
	const workerWtypeFilter = options.workerWtypeFilter;
	const showFact = !!options.showFact;

	if (isWtypeSeriesIncluded("Employee", workerWtypeFilter)) {
		chartSeries.push(
			buildWtypeForecastBarSeries(
				__("Employee forecast"),
				forecastStackId,
				employee,
				"Employee"
			)
		);
		if (showFact) {
			chartSeries.push(
				buildWtypeActualBarSeries(
					__("Employee fact"),
					"actual",
					actualEmp,
					"Employee"
				)
			);
		}
	}
	if (isWtypeSeriesIncluded("Supplier", workerWtypeFilter)) {
		chartSeries.push(
			buildWtypeForecastBarSeries(
				__("Supplier forecast"),
				forecastStackId,
				supplier,
				"Supplier"
			)
		);
		if (showFact) {
			chartSeries.push(
				buildWtypeActualBarSeries(
					__("Supplier fact"),
					"actual",
					actualSup,
					"Supplier"
				)
			);
		}
	}
}

function buildUtilizationForecastSeries(hours) {
	return {
		name: __("Utilization forecast"),
		type: "line",
		z: PWR_Z_UTILIZATION_FORECAST,
		showSymbol: true,
		showAllSymbol: true,
		symbol: "circle",
		symbolSize: 8,
		lineStyle: { width: 0, opacity: 0 },
		itemStyle: {
			color: PWR_UTILIZATION_FORECAST_COLOR,
			opacity: 0.95,
			borderColor: PWR_UTILIZATION_FORECAST_BORDER,
			borderWidth: 1,
		},
		data: (hours || []).map((value) => {
			const hoursValue = Number(value);
			return Number.isFinite(hoursValue) && hoursValue > 0 ? hoursValue : null;
		}),
		pwrUtilizationForecast: true,
	};
}

export function buildAxisTooltip(themeColors) {
	const colors = themeColors || getPwrChartThemeColors();
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
			items.forEach((item) => {
				const raw = Array.isArray(item.value)
					? item.value[item.value.length - 1]
					: item.value;
				if (raw == null || raw === "") return;
				const num = Number(raw);
				if (!Number.isFinite(num)) return;
				const marker = item.marker || "";
				lines.push(`${marker}${item.seriesName}: ${num.toFixed(1)}`);
			});
			return lines.length > 1 ? lines.join("<br/>") : header;
		},
	};
}

export function buildChartLegend() {
	return { show: false };
}

export function buildSyncedGrid() {
	return {
		left: 0,
		right: 0,
		top: 8,
		bottom: 8,
		containLabel: false,
	};
}

export function buildSyncedYAxis(themeColors) {
	const colors = themeColors || getPwrChartThemeColors();
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
}

export function buildSyncedXAxis(labels) {
	return {
		type: "category",
		data: labels,
		boundaryGap: true,
		axisLabel: { show: false },
		axisTick: { show: false },
	};
}

export function buildChartAriaOptions() {
	return { enabled: true };
}

export function buildTeamChartOption(data, viewType) {
	const periods = data.periods || [];
	const series = data.series || {};
	const meta = data.meta || {};
	const workerWtypeFilter = meta.worker_wtype_filter || "all";
	const labels = periodLabels(periods, viewType);
	const themeColors = getPwrChartThemeColors();
	const employee = filterWtypeSeriesData(
		(series.workload_forecast_hours_by_wtype || {}).Employee,
		"Employee",
		workerWtypeFilter
	);
	const supplier = filterWtypeSeriesData(
		(series.workload_forecast_hours_by_wtype || {}).Supplier,
		"Supplier",
		workerWtypeFilter
	);
	const actualEmp = filterWtypeSeriesData(
		(series.actual_hours_by_wtype || {}).Employee,
		"Employee",
		workerWtypeFilter
	);
	const actualSup = filterWtypeSeriesData(
		(series.actual_hours_by_wtype || {}).Supplier,
		"Supplier",
		workerWtypeFilter
	);
	const showFact = !!meta.actual_loaded;
	const showUtilization = !!meta.utilization_loaded;

	const chartSeries = [
		buildPwrLineSeries({
			name: __("Capacity"),
			lineColor: PWR_LINE_COLORS.capacityLine,
			areaColor: PWR_LINE_COLORS.capacityArea,
			lineOpacity: PWR_CAPACITY_LINE_OPACITY,
			areaOpacity: PWR_CAPACITY_AREA_OPACITY,
			z: 1,
			data: series.capacity_hours || [],
		}),
	];
	appendWtypeWorkloadBars(chartSeries, {
		employee,
		supplier,
		actualEmp,
		actualSup,
		forecastStackId: "workload",
		workerWtypeFilter,
		showFact,
	});

	if (showUtilization) {
		chartSeries.splice(
			1,
			0,
			buildPwrLineSeries({
				name: __("Utilization plan"),
				color: PWR_LINE_COLORS.utilizationPlan,
				lineOpacity: 0.85,
				areaOpacity: 0.12,
				z: PWR_Z_UTILIZATION_PLAN,
				data: series.utilization_plan_hours || [],
			}),
			buildUtilizationForecastSeries(series.utilization_forecast_hours)
		);
	}

	return {
		backgroundColor: "transparent",
		aria: buildChartAriaOptions(),
		tooltip: buildAxisTooltip(themeColors),
		legend: buildChartLegend(themeColors),
		grid: buildSyncedGrid(),
		xAxis: buildSyncedXAxis(labels),
		yAxis: buildSyncedYAxis(themeColors),
		series: chartSeries,
	};
}
