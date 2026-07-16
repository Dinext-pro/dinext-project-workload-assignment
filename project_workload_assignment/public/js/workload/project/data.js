import { fetchProjectTree } from "../api/index.js";
import { SURFACE_PROJECT } from "../constants.js";
import { getFilterArgs } from "./filters.js";

function syncLegacyMetadata(state, grid) {
	const meta = (grid && grid.meta) || {};
	const metadata = meta.metadata || {};
	window.projectWorkloadMetadata = metadata;

	const NS = frappe.provide("project_workload_assignment.pwrProject");
	if (typeof NS.indexMetadata === "function") {
		NS.indexMetadata(metadata);
	} else {
		window.projectWorkloadIndexed = null;
	}

	if (metadata.project_dates && NS.state) {
		NS.state.projectDates = metadata.project_dates;
	}

	if (NS.syncGlobals) {
		NS.syncGlobals();
	}

	state.meta = meta;
	if (state.frm) {
		state.frm.project_workload_periods = grid.periods || [];
	}
}

export function resolveProjectFilterArgs(state, overrides) {
	const fromFilters = getFilterArgs(state);
	const project =
		(state && state.frm && state.frm.doc && state.frm.doc.name) ||
		fromFilters.project ||
		"";
	return {
		project,
		view_type: fromFilters.view_type || "daily",
		date_from: fromFilters.date_from,
		date_to: fromFilters.date_to,
		load_actual: fromFilters.load_actual,
		worker_wtype: fromFilters.worker_wtype || "",
		period_range: fromFilters.period_range || "quarter",
		...(overrides || {}),
	};
}

export async function loadProjectData(state, filterArgs) {
	if (!state) {
		throw new Error("workload.loadProjectData: state required");
	}

	state.surface = SURFACE_PROJECT;
	const prev = state.filters || {};
	const args = resolveProjectFilterArgs(state, filterArgs);
	// Keep UI-only keys (period_range, load_utilization) across reload.
	state.filters = {
		...prev,
		...args,
		period_range: args.period_range || prev.period_range || "quarter",
		load_utilization:
			args.load_utilization != null
				? args.load_utilization
				: prev.load_utilization != null
					? prev.load_utilization
					: 0,
	};

	const grid = await fetchProjectTree(args);

	state.rows = grid.rows || [];
	state.periods = grid.periods || [];
	syncLegacyMetadata(state, grid);

	return grid;
}
