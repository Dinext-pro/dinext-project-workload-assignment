import { fetchTeamGrid } from "../api/index.js";

export function getDefaultFilterArgs(overrides) {
	return {
		user: "",
		project: "",
		project_portfolio: "",
		user_group: "",
		view_type: "weekly",
		period_range: "quarter",
		period_anchor_date: frappe.datetime.get_today(),
		load_actual: 0,
		worker_wtype: "",
		mode: "user_totals",
		limit: 20,
		offset: 0,
		...(overrides || {}),
	};
}

export function resolveFilterArgs(state, filterArgs) {
	const fromState = (state && state.filters) || {};
	return getDefaultFilterArgs({ ...fromState, ...(filterArgs || {}) });
}

function resetLazyExpandState(state) {
	state.loadedProjectDetailsByUser = Object.create(null);
	state.isLoadingMore = false;
}

export async function loadReportGrid(state, filterArgs) {
	if (!state) {
		throw new Error("workload.loadReportGrid: state required");
	}

	const args = resolveFilterArgs(state, {
		...(filterArgs || {}),
		offset: filterArgs?.offset != null ? filterArgs.offset : 0,
		mode: "user_totals",
	});
	state.filters = { ...args };
	resetLazyExpandState(state);

	const grid = await fetchTeamGrid(args);

	state.rows = grid.rows || [];
	state.periods = grid.periods || [];
	state.meta = grid.meta || {};

	return grid;
}

export async function loadMoreUsers(state) {
	if (!state) {
		throw new Error("workload.loadMoreUsers: state required");
	}

	const nextOffset =
		state.meta?.next_offset != null ? state.meta.next_offset : 0;
	const limit = state.meta?.limit || state.filters?.limit || 20;

	const args = resolveFilterArgs(state, {
		mode: "user_totals",
		offset: nextOffset,
		limit,
	});

	const grid = await fetchTeamGrid(args);

	return {
		rows: grid.rows || [],
		meta: grid.meta || {},
		periods: grid.periods || [],
	};
}
