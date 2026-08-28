console.log("[WR-DEBUG:project-entry] script-loaded");

frappe.require(
	[
		"/assets/project_workload_assignment/css/workload-reports-filters.css",
		"/assets/project_workload_assignment/css/workload-reports-charts.css",
		"/assets/project_workload_assignment/css/workload-reports-table.css",
		"dinext-table.bundle.js",
		"workload-reports-common.bundle.js",
		"workload-reports-project.bundle.js",
	],
	() => {
		console.log("[WR-DEBUG:project-entry] assets-loaded", {
			hasWorkloadReports: !!project_workload_assignment?.workloadReports,
			hasProject: !!project_workload_assignment?.workloadReports?.project,
			curFrm: cur_frm?.doctype,
			project: cur_frm?.doc?.name,
		});
		try {
			const { project } = project_workload_assignment.workloadReports;
			project.bindForm();
			if (cur_frm?.doctype === "Project") {
				project.scheduleMount(cur_frm);
			} else {
				console.log("[WR-DEBUG:project-entry] skip-scheduleMount-not-project", {
					curFrm: cur_frm?.doctype,
				});
			}
		} catch (err) {
			console.error("[WR-DEBUG:project-entry] boot-failed", err);
		}
	}
);
