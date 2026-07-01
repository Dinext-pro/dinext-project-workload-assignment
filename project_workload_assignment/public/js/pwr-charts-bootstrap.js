/* ISS-2026-00002: bootstrap — единая точка входа PWR / Project Workload UI. */
(function () {
	if (window.DINEXT_PWR_CHARTS_ENABLED === false) {
		return;
	}
	window.DINEXT_PWR_CHARTS_ENABLED = true;

	frappe.provide("project_workload_assignment.charts");

	const ASSET_BASE = "/assets/project_workload_assignment";
	const PWR_ASSET_VERSION = "20260702-actual-bar-half-width";
	const SHARED_CSS = [
		`${ASSET_BASE}/css/pwr-workload-cells.css`,
		`${ASSET_BASE}/css/pwr-workload-participant-column.css`,
		`${ASSET_BASE}/css/pwr-workload-filters.css`,
		`${ASSET_BASE}/css/pwr-workload-charts.css`,
	];

	function versionedHref(href) {
		return `${href}?v=${PWR_ASSET_VERSION}`;
	}

	function loadStylesheet(href) {
		const src = versionedHref(href);
		const stale = document.querySelector(`link[href^="${href}"]`);
		if (stale && stale.getAttribute("href") === src) {
			return;
		}
		if (stale) {
			stale.remove();
		}
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = src;
		document.head.appendChild(link);
	}

	function resolvePageCss() {
		const route = frappe.get_route ? frappe.get_route() : [];
		if (route[0] === "Form" && route[1] === "Projects Workload Report") {
			return `${ASSET_BASE}/css/pwr-workload-report-page.css`;
		}
		if (route[0] === "Form" && route[1] === "Project") {
			return `${ASSET_BASE}/css/pwr-workload-project-tab.css`;
		}
		return null;
	}

	function loadSharedCss() {
		SHARED_CSS.forEach(loadStylesheet);
		const pageCss = resolvePageCss();
		if (pageCss) {
			loadStylesheet(pageCss);
		}
	}

	function bootWorkloadUi() {
		loadSharedCss();
		frappe.require(
			[
				`${ASSET_BASE}/js/pwr-shared.js`,
				`${ASSET_BASE}/js/pwr-plan-fact-cell.js`,
				`${ASSET_BASE}/js/projects-workload-ag-grid.js`,
				"/assets/dinext_common/js/charts/dinext-charts-core.js",
				`${ASSET_BASE}/js/pwr-workload-charts.js`,
			],
			() => {
				if (
					project_workload_assignment.charts &&
					typeof project_workload_assignment.charts.boot === "function"
				) {
					project_workload_assignment.charts.boot();
				}
			}
		);
	}

	if (project_workload_assignment.charts && project_workload_assignment.charts.boot) {
		loadSharedCss();
		project_workload_assignment.charts.boot();
		return;
	}

	bootWorkloadUi();
})();
