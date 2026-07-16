/* ISS-2026-00002: единый реестр whitelist API (без Server Script api_method). */
console.log("[PWR] eval pwr-api-methods.js");
frappe.provide("project_workload_assignment.pwrApi");

Object.assign(project_workload_assignment.pwrApi, {
	TEAM_GRID: "project_workload_assignment.project_workload_api.pwr_run_team_workload_grid_canonical",
	PROJECT_TREE: "project_workload_assignment.project_workload_api.pwr_run_project_workload_tree_canonical",
	TEAM_CHARTS: "project_workload_assignment.project_workload_api.pwr_run_team_workload_charts",
	PROJECT_CHARTS: "project_workload_assignment.project_workload_api.pwr_run_project_workload_charts",
	TASKS_FORECAST: "project_workload_assignment.project_workload_api.pwr_run_tasks_forecast_workload",
	ADD_FORECAST_FROM_WE:
		"project_workload_assignment.project_workload_api.pwr_run_add_forecast_from_work_efforts",
	CHECK_OVERLOAD: "project_workload_assignment.project_workload_api.check_workload_overload",
	CONSOLIDATED_DATA: "project_workload_assignment.project_workload_api.get_work_efforts_consolidated_data",
	GRID: "project_workload_assignment.project_workload_api.get_work_efforts_grid",
	SAVE_FORECAST: "project_workload_assignment.project_workload_api.we_save_forecast_changes",
	TIMESHEET_LIMITS: "project_workload_assignment.project_workload_api.calculate_timesheet_limits",
	SAVE_FORECAST_PLAN: "project_workload_assignment.project_workload_api.save_forecast_as_plan",
	UPDATE_FORECAST_ASSIGNMENTS:
		"project_workload_assignment.project_workload_api.update_forecast_from_assignments",
});

project_workload_assignment.pwrApi.get = function (key, fallback) {
	return this[key] || fallback;
};

frappe.provide("project_workload_assignment.pwrBoot");
project_workload_assignment.pwrBoot.log = function (step, detail) {
	const line = detail != null ? `[PWR boot] ${step} — ${detail}` : `[PWR boot] ${step}`;
	console.log(line);
	window.__PWR_BOOT_TRACE = window.__PWR_BOOT_TRACE || [];
	window.__PWR_BOOT_TRACE.push({ step: step, detail: detail || null, t: Date.now() });
};

project_workload_assignment.pwrBoot.fail = function (moduleName, error) {
	const message = error && error.message ? error.message : String(error);
	project_workload_assignment.pwrBoot.log(`${moduleName} FAIL`, message);
	console.error(`[PWR boot] ${moduleName}`, error);
};

project_workload_assignment.pwrBoot.log("pwr-api-methods.js");
