import { reload as reloadCharts, destroy as destroyCharts } from "../charts/index.js";

export async function initReportCharts(ctx) {
	const { state, onTableReload } = ctx || {};
	if (!state) {
		throw new Error("workload.initReportCharts: state required");
	}
	return reloadCharts(state, {
		onReload: (meta) => {
			if (meta?.chartOnly) {
				return reloadCharts(state);
			}
			if (typeof onTableReload === "function") {
				return onTableReload();
			}
			return reloadCharts(state);
		},
	});
}

export function reloadReportCharts(state) {
	if (!state) return;
	void reloadCharts(state);
}

export function destroyReportCharts(state) {
	destroyCharts(state);
}
