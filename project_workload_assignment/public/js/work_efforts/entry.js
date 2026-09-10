/**
 * Work Efforts Form entry (Project).
 * doctype_js → require bundle (shell glue + DinextTable) → catch-up mount.
 * Mirror of workload-reports/project-tab/entry.js.
 */
frappe.require(
	[
		"/assets/project_workload_assignment/css/work-efforts.css",
		"work-efforts.bundle.js",
	],
	() => {
		if (!project_workload_assignment?.work_efforts?.render_work_efforts_table) {
			console.error("[WorkEfforts] work-efforts.bundle: shell missing");
			return;
		}
		if (cur_frm?.doctype === "Project") {
			project_workload_assignment.work_efforts.render_work_efforts_table(cur_frm);
		}
	}
);
