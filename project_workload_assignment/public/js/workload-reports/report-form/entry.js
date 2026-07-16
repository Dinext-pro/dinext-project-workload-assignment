/* Manual require helper. Desk uses pwr-form-boot.js (app_include). */
frappe.require(
	[
		"/assets/project_workload_assignment/css/workload-reports-filters.css",
		"/assets/project_workload_assignment/css/workload-reports-charts.css",
		"/assets/project_workload_assignment/css/workload-reports-table.css",
		"dinext-table.bundle.js",
		"workload-reports-common.bundle.js",
		"workload-reports-form.bundle.js",
	],
	() => {
		project_workload_assignment.workloadReports.reportForm.bindForm();
	}
);
