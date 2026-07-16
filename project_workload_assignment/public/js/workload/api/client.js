const TEAM_GRID =
	"project_workload_assignment.project_workload_api.pwr_run_team_workload_grid_canonical";
const PROJECT_TREE =
	"project_workload_assignment.project_workload_api.pwr_run_project_workload_tree_canonical";
const TEAM_CHARTS =
	"project_workload_assignment.project_workload_api.pwr_run_team_workload_charts";
const PROJECT_CHARTS =
	"project_workload_assignment.project_workload_api.pwr_run_project_workload_charts";

/** Legacy wire endpoints (AG Grid / kill-switch). Prefer TEAM_GRID / PROJECT_TREE. */
const TEAM_GRID_LEGACY =
	"project_workload_assignment.project_workload_api.pwr_run_team_workload_grid";
const PROJECT_TREE_LEGACY =
	"project_workload_assignment.project_workload_api.pwr_run_project_workload_tree";

function normalizeTeamArgs(args) {
	const a = args || {};
	return {
		user: a.user || "",
		project: a.project || "",
		project_portfolio: a.project_portfolio || "",
		user_group: a.user_group || "",
		view_type: a.view_type,
		period_range: a.period_range,
		period_anchor_date: a.period_anchor_date || (frappe.datetime && frappe.datetime.get_today()) || undefined,
		load_actual: a.load_actual,
		worker_wtype: a.worker_wtype || "",
		mode: a.mode || "user_totals",
		limit: a.limit,
		offset: a.offset != null ? a.offset : 0,
		detail_user: a.detail_user || "",
	};
}

function normalizeTeamChartArgs(args) {
	const a = args || {};
	return {
		user: a.user || "",
		project: a.project || "",
		project_portfolio: a.project_portfolio || "",
		user_group: a.user_group || "",
		view_type: a.view_type,
		period_range: a.period_range,
		period_anchor_date:
			a.period_anchor_date ||
			(frappe.datetime && frappe.datetime.get_today()) ||
			undefined,
		worker_wtype: a.worker_wtype || "",
		load_utilization: a.load_utilization != null ? a.load_utilization : 0,
		load_actual: a.load_actual != null ? a.load_actual : 0,
	};
}

function asGrid(message) {
	if (!message || typeof message !== "object") {
		return { periods: [], rows: [], meta: {} };
	}
	return {
		periods: Array.isArray(message.periods) ? message.periods : [],
		rows: Array.isArray(message.rows) ? message.rows : [],
		meta: message.meta && typeof message.meta === "object" ? message.meta : {},
	};
}

export async function fetchTeamGrid(args) {
	const r = await frappe.call({
		method: TEAM_GRID,
		args: normalizeTeamArgs({ ...(args || {}), mode: (args && args.mode) || "user_totals" }),
	});
	return asGrid((r && r.message) || null);
}

export async function fetchUserProjects(args) {
	const a = args || {};
	const r = await frappe.call({
		method: TEAM_GRID,
		args: normalizeTeamArgs({
			...a,
			mode: "user_projects",
			detail_user: a.detail_user || a.email || "",
		}),
	});
	return asGrid((r && r.message) || null);
}

export async function fetchProjectTree(args) {
	const a = args || {};
	const r = await frappe.call({
		method: PROJECT_TREE,
		args: {
			project: a.project || "",
			view_type: a.view_type,
			date_from: a.date_from,
			date_to: a.date_to,
			load_actual: a.load_actual,
			worker_wtype: a.worker_wtype || "",
		},
	});
	return asGrid((r && r.message) || null);
}

export async function fetchTeamCharts(args) {
	const r = await frappe.call({
		method: TEAM_CHARTS,
		args: normalizeTeamChartArgs(args),
	});
	return (r && r.message) || null;
}

export async function fetchProjectCharts(args) {
	const a = args || {};
	const r = await frappe.call({
		method: PROJECT_CHARTS,
		args: {
			project: a.project || "",
			view_type: a.view_type,
			date_from: a.date_from,
			date_to: a.date_to,
			worker_wtype: a.worker_wtype || "",
			load_utilization: a.load_utilization != null ? a.load_utilization : 0,
			load_actual: a.load_actual != null ? a.load_actual : 0,
		},
	});
	return (r && r.message) || null;
}

export {
	TEAM_GRID,
	PROJECT_TREE,
	TEAM_CHARTS,
	PROJECT_CHARTS,
	TEAM_GRID_LEGACY,
	PROJECT_TREE_LEGACY,
};
