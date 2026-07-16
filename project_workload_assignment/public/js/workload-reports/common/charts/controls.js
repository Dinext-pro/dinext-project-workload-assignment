/**
 * Chart gutter controls for workload-reports v3.
 * Only "Add utilization" — same checkbox markup as filter "Show fact".
 */

import { addCheckbox } from "../filters/controls.js";

/**
 * Mount utilization checkbox once into panel.$gutterFilters.
 * @param {HTMLElement} hostEl
 * @param {() => void} onUtilizationChange — chartOnly reload callback
 */
export function ensureChartControls(hostEl, onUtilizationChange) {
	const state = hostEl?._wrCharts;
	const panel = state?.panel;
	if (!panel?.$gutterFilters?.length) return;
	if (state._controlsReady) return;

	panel.$gutterFilters.empty();

	const wrap = document.createElement("div");
	wrap.className = "wr-chart-filters";
	panel.$gutterFilters.get(0).appendChild(wrap);

	addCheckbox(wrap, {
		label: __("Add utilization"),
		checked: !!Number(state.utilization),
		onChange: (on) => {
			state.utilization = on ? 1 : 0;
			if (typeof onUtilizationChange === "function") {
				onUtilizationChange();
			}
		},
	});

	state._controlsReady = true;
}
