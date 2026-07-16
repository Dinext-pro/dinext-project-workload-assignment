import { CHART_HEIGHT, CHART_PLOT_HEIGHT } from "./theme.js";

/**
 * Ensure `.workload-charts` host above the table container.
 */
export function ensureChartsHost(state) {
	if (!state) {
		throw new Error("workload.charts.mount: state required");
	}

	const tableEl = state.table?.container || state.container;
	if (!tableEl || !tableEl.parentElement) {
		return null;
	}

	const charts = state.charts || (state.charts = {});
	if (charts.hostEl && charts.hostEl.isConnected) {
		const next = charts.hostEl.nextElementSibling;
		if (next === tableEl) {
			return charts.hostEl;
		}
		charts.hostEl.remove();
		charts.hostEl = null;
		charts.panel = null;
	}

	const host = document.createElement("div");
	host.className = "workload-charts";
	tableEl.parentElement.insertBefore(host, tableEl);
	charts.hostEl = host;
	return host;
}

export function applyChartHeights(panel) {
	if (!panel) return;
	const totalHeightVar = CHART_HEIGHT;
	const plotHeightVar = CHART_PLOT_HEIGHT;

	if (panel.$root?.length) {
		panel.$root.css("--pwr-chart-plot-height", plotHeightVar);
		panel.$root.css("--pwr-chart-total-height", totalHeightVar);
	}
	if (panel.$syncGrid?.length) {
		panel.$syncGrid.css("--pwr-chart-plot-height", plotHeightVar);
		panel.$syncGrid.css("--pwr-chart-total-height", totalHeightVar);
	}
	if (panel.$viewport?.length) {
		panel.$viewport.css({ height: totalHeightVar, maxHeight: totalHeightVar });
	}
	if (panel.$gutterYaxis?.length) {
		panel.$gutterYaxis.css({
			height: plotHeightVar,
			minHeight: plotHeightVar,
			maxHeight: plotHeightVar,
			alignSelf: "end",
		});
	}
	if (panel.$chartTrack?.length) {
		panel.$chartTrack.css({
			height: plotHeightVar,
			minHeight: plotHeightVar,
			maxHeight: plotHeightVar,
			flex: "1 1 auto",
		});
	}
	if (panel.$chartEl?.length) {
		panel.$chartEl.css({ height: plotHeightVar, minHeight: plotHeightVar });
	}
	if (panel.$body?.length) {
		panel.$body.css({ minHeight: totalHeightVar });
	}
}
