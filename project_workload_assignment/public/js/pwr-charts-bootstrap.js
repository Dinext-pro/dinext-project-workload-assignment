/* ISS-2026-00002: bootstrap — единственная точка входа; отключение графиков одной константой. */
(function () {
	/** Отключить графики: window.DINEXT_PWR_CHARTS_ENABLED = false до загрузки bootstrap */
	if (window.DINEXT_PWR_CHARTS_ENABLED === false) {
		return;
	}
	window.DINEXT_PWR_CHARTS_ENABLED = true;

	frappe.provide("project_workload_assignment.charts");

	function loadChartsCss() {
		const href = "/assets/project_workload_assignment/css/pwr-workload-charts.css";
		if (document.querySelector(`link[href="${href}"]`)) {
			return;
		}
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = href;
		document.head.appendChild(link);
	}

	function bootCharts() {
		loadChartsCss();
		frappe.require(
			[
				"/assets/dinext_common/js/charts/dinext-charts-core.js",
				"/assets/project_workload_assignment/js/pwr-workload-charts.js",
			],
			() => {
				if (
					project_workload_assignment.charts &&
					project_workload_assignment.charts.boot
				) {
					project_workload_assignment.charts.boot();
				}
			}
		);
	}

	if (project_workload_assignment.charts && project_workload_assignment.charts.boot) {
		project_workload_assignment.charts.boot();
		return;
	}

	bootCharts();
})();
