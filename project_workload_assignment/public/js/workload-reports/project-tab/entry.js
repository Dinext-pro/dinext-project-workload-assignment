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
		const { project } = project_workload_assignment.workloadReports;
		project.bindForm();
		if (cur_frm?.doctype === "Project") {
			project.mount(cur_frm);
		}
	}
);
