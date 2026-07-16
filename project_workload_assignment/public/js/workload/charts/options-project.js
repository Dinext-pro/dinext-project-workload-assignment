// ported from workload-charts.js
import {
	PWR_CAPACITY_AREA_OPACITY,
	PWR_CAPACITY_LINE_OPACITY,
	PWR_LINE_COLORS,
	PWR_UTILIZATION_FORECAST_BORDER,
	PWR_UTILIZATION_FORECAST_COLOR,
	PWR_Z_UTILIZATION_FORECAST,
	PWR_Z_UTILIZATION_PLAN,
	getPwrChartThemeColors,
} from "./theme.js";
import {
	appendWtypeWorkloadBars,
	buildAxisTooltip,
	buildChartAriaOptions,
	buildChartLegend,
	buildPwrLineSeries,
	buildSyncedGrid,
	buildSyncedXAxis,
	buildSyncedYAxis,
	filterWtypeSeriesData,
	periodLabels,
} from "./options-team.js";

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

export function buildProjectChartOption(data, viewType) {
	const periods = data.periods || [];
	const series = data.series || {};
	const meta = data.meta || {};
	const workerWtypeFilter = meta.worker_wtype_filter || "all";
	const labels = periodLabels(periods, viewType);
	const themeColors = getPwrChartThemeColors();
	const forecastEmp = filterWtypeSeriesData(
		(series.workload_forecast_hours_by_wtype || {}).Employee,
		"Employee",
		workerWtypeFilter
	);
	const forecastSup = filterWtypeSeriesData(
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
			name: __("Team capacity"),
			lineColor: PWR_LINE_COLORS.teamCapacityLine,
			areaColor: PWR_LINE_COLORS.teamCapacityArea,
			lineOpacity: PWR_CAPACITY_LINE_OPACITY,
			areaOpacity: PWR_CAPACITY_AREA_OPACITY,
			z: 1,
			data: series.team_capacity_hours || [],
		}),
		buildPwrLineSeries({
			name: __("Project plan"),
			color: PWR_LINE_COLORS.projectPlan,
			lineOpacity: 0.85,
			areaOpacity: 0.15,
			z: 2,
			data: series.project_plan_hours || [],
		}),
	];
	appendWtypeWorkloadBars(chartSeries, {
		employee: forecastEmp,
		supplier: forecastSup,
		actualEmp,
		actualSup,
		forecastStackId: "forecast",
		workerWtypeFilter,
		showFact,
	});

	if (showUtilization) {
		chartSeries.splice(
			2,
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
