frappe.pages["project-workload-report-v3"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Project Workload Report (v3)"),
		single_column: true,
	});

	frappe.require(
		[
			"/assets/project_workload_assignment/css/workload-reports-filters.css",
			"/assets/project_workload_assignment/css/workload-reports-charts.css",
			"/assets/project_workload_assignment/css/workload-reports-table.css",
			"dinext-table.bundle.js",
			"workload-reports-common.bundle.js",
			"workload-reports-page.bundle.js",
		],
		() => {
			project_workload_assignment.workloadReports.report.onPageLoad(wrapper, page);
		}
	);
};
