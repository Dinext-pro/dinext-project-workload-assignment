/**
 * Chart display controls for workload-reports (toolbar).
 * Utilization toggle + stacked-histogram grouping (worker type / project roles).
 */

import { addCheckbox } from "../filters/controls.js";

export function addStackModeSelect(parent, { value, onChange }) {
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
 * Mount chart toggles into the table toolbar host (once).
 * @param {HTMLElement} host
 * @param {{ getChartsState?: () => object, onUtilizationChange?: () => void, onStackByChange?: () => void, projectArgs?: object, onProjectArgsChange?: () => void }} opts
 */
export function mountChartToolbarControls(host, opts = {}) {
	if (!host || host.dataset.wrChartCtl === "1") return;
	host.dataset.wrChartCtl = "1";

	const live = () =>
		typeof opts.getChartsState === "function" ? opts.getChartsState() : null;
	const state = live();

	addCheckbox(host, {
		label: __("Utilization"),
		checked: !!Number(state?.utilization),
		onChange: (on) => {
			const next = live() || state;
			if (next) next.utilization = on ? 1 : 0;
			opts.onUtilizationChange?.();
		},
	});

	const projectArgs = opts.projectArgs;
	if (projectArgs && typeof opts.onProjectArgsChange === "function") {
		addCheckbox(host, {
			label: __("Consider limit"),
			checked: !!projectArgs.consider_limit,
			onChange: (on) => {
				projectArgs.consider_limit = on ? 1 : 0;
				opts.onProjectArgsChange();
			},
		});
		addCheckbox(host, {
			label: __("Consider virtuals"),
			checked: !!projectArgs.consider_virtuals,
			onChange: (on) => {
				projectArgs.consider_virtuals = on ? 1 : 0;
				opts.onProjectArgsChange();
			},
		});
	}

	addStackModeSelect(host, {
		value: state?.stackBy || "wtype",
		onChange: (mode) => {
			const next = live() || state;
			if (next) next.stackBy = mode === "role" ? "role" : "wtype";
			opts.onStackByChange?.();
		},
	});
}
