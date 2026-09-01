/**
 * Chart gutter controls for workload-reports v3.
 * "Add utilization" + stacked-histogram grouping (worker type / project roles).
 */

import { addCheckbox } from "../filters/controls.js";

function addStackModeSelect(parent, { value, onChange }) {
	const wrap = document.createElement("div");
	wrap.className = "wr-filter-field wr-chart-stack-mode";

	const select = document.createElement("select");
	select.className = "form-control input-xs";
	select.title = __("Stacked histogram");

	[
		{ value: "wtype", label: __("Worker type") },
		{ value: "role", label: __("Project Roles") },
	].forEach((opt) => {
		const option = document.createElement("option");
		option.value = opt.value;
		option.textContent = opt.label;
		select.appendChild(option);
	});

	select.value = value === "role" ? "role" : "wtype";
	select.addEventListener("change", () => onChange(select.value));

	wrap.appendChild(select);
	parent.appendChild(wrap);
	return select;
}

/**
 * Mount gutter controls once into panel.$gutterFilters.
 * @param {HTMLElement} hostEl
 * @param {{ onUtilizationChange?: () => void, onStackByChange?: () => void }} hooks
 */
export function ensureChartControls(hostEl, hooks = {}) {
	const state = hostEl?._wrCharts;
	const panel = state?.panel;
	if (!panel?.$gutterFilters?.length) return;
	if (state._controlsReady) return;

	const onUtilizationChange =
		typeof hooks === "function" ? hooks : hooks.onUtilizationChange;
	const onStackByChange = typeof hooks === "function" ? null : hooks.onStackByChange;

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

	addStackModeSelect(wrap, {
		value: state.stackBy || "wtype",
		onChange: (mode) => {
			state.stackBy = mode === "role" ? "role" : "wtype";
			if (typeof onStackByChange === "function") {
				onStackByChange();
			}
		},
	});

	state._controlsReady = true;
}
