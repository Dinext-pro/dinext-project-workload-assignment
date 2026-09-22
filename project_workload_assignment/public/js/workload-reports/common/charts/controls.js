/**
 * Chart display controls for workload-reports (toolbar).
 * Utilization toggle + stacked-histogram grouping (worker type / project roles).
 */

import { addCheckbox, addSelect } from "../filters/controls.js";

export function mountStackModeSelect(host, opts = {}) {
	if (!host) return;
	const live = () =>
		typeof opts.getChartsState === "function" ? opts.getChartsState() : null;
	const state = live();
	addSelect(host, {
		fieldname: "stack_by",
		options: [
			{ value: "wtype", label: __("Worker type") },
			{ value: "role", label: __("Project Roles") },
		],
		value: state?.stackBy === "role" ? "role" : "wtype",
		onChange: (mode) => {
			const next = live() || state;
			if (next) next.stackBy = mode === "role" ? "role" : "wtype";
			opts.onStackByChange?.();
		},
	});
}

/**
 * Mount chart toggles into the table toolbar host (once).
 * Stack select is mounted separately — next to period selects.
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
}
