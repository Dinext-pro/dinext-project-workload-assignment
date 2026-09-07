/**
 * Canonical grid API: { periods, rows, meta }.
 * Chart API: { periods, series, meta }.
 */

const _path = "project_workload_assignment.api.";

const PROJECTS_GRID = _path + "pwr_run_team_workload_grid_canonical";
const PROJECT_TREE = _path + "pwr_run_project_workload_tree_canonical";
const TEAM_CHARTS = _path + "pwr_run_team_workload_charts";
const PROJECT_CHARTS = _path + "pwr_run_project_workload_charts";

const _asGrid = (message) => ({
	periods: message?.periods || [],
	rows: message?.rows || [],
	meta: message?.meta || {},
});

const _projectsArgs = (args = {}) => ({
	user: args.user || "",
	project: args.project || "",
	project_portfolio: args.project_portfolio || "",
	user_group: args.user_group || "",
	view_type: args.view_type,
	period_range: args.period_range,
	period_anchor_date: args.period_anchor_date || frappe.datetime?.get_today?.(),
	load_actual: args.load_actual ? 1 : 0,
	worker_wtype: args.worker_wtype || "",
	project_role_filters: Array.isArray(args.project_role_filters)
		? args.project_role_filters
		: args.project_role_filters
			? [args.project_role_filters]
			: [],
	mode: args.mode || "user_totals",
	limit: args.limit,
	offset: args.offset ?? 0,
	detail_user: args.detail_user || "",
});

const _projectArgs = (args = {}) => ({
	project: args.project || "",
	view_type: args.view_type,
	date_from: args.date_from,
	date_to: args.date_to,
	load_actual: args.load_actual ? 1 : 0,
	worker_wtype: args.worker_wtype || "",
	project_role_filters: Array.isArray(args.project_role_filters)
		? args.project_role_filters
		: args.project_role_filters
			? [args.project_role_filters]
			: [],
});

const _teamChartsArgs = (args = {}) => ({
	user: args.user || "",
	project: args.project || "",
	project_portfolio: args.project_portfolio || "",
	user_group: args.user_group || "",
	view_type: args.view_type,
	period_range: args.period_range,
	period_anchor_date: args.period_anchor_date || frappe.datetime?.get_today?.(),
	worker_wtype: args.worker_wtype || "",
	project_role_filters: Array.isArray(args.project_role_filters)
		? args.project_role_filters
		: args.project_role_filters
			? [args.project_role_filters]
			: [],
	load_actual: args.load_actual ? 1 : 0,
	load_utilization: args.load_utilization ? 1 : 0,
});

const _projectChartsArgs = (args = {}) => ({
	..._projectArgs(args),
	load_utilization: args.load_utilization ? 1 : 0,
});

/** Projects page roots: mode user_totals. */
export async function getProjectsData(args = {}) {
	const r = await frappe.call({
		method: PROJECTS_GRID,
		args: _projectsArgs({ ...args, mode: args.mode || "user_totals" }),
	});
	return _asGrid(r.message);
}

/** Projects page lazy children for one user. */
export async function getUserProjects(args = {}) {
	const r = await frappe.call({
		method: PROJECTS_GRID,
		args: _projectsArgs({
			...args,
			mode: "user_projects",
			detail_user: args.detail_user || args.email || "",
		}),
	});
	return _asGrid(r.message);
}

/** Project tab nested tree. */
export async function getProjectData(args = {}) {
	const r = await frappe.call({
		method: PROJECT_TREE,
		args: _projectArgs(args),
	});
	return _asGrid(r.message);
}

/** Projects page summary charts. */
export async function getTeamCharts(args = {}) {
	const r = await frappe.call({
		method: TEAM_CHARTS,
		args: _teamChartsArgs(args),
	});
	return r.message;
}

/** Project tab summary charts. */
export async function getProjectCharts(args = {}) {
	const r = await frappe.call({
		method: PROJECT_CHARTS,
		args: _projectChartsArgs(args),
	});
	return r.message;
}
