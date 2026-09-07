/**
 * Projects Workload Report Form entry (custom DocType → no doctype_js).
 * app_include only: load v3 bundles on report Form route, bind handlers once.
 * Mount happens in reportForm refresh — not here.
 * Mirror of project-tab/entry.js, but route-gated because load channel is app_include.
 */
(function () {
	frappe.provide("project_workload_assignment");
	console.log("[WR-DEBUG:form-entry] script-loaded");

	const DOCTYPE = "Projects Workload Report";
	const ASSETS = [
		"/assets/project_workload_assignment/css/workload-reports-filters.css",
		"/assets/project_workload_assignment/css/workload-reports-charts.css",
		"/assets/project_workload_assignment/css/workload-reports-table.css",
		"dinext-table.bundle.js",
		"workload-reports-common.bundle.js",
		"workload-reports-form.bundle.js",
	];

	let loadPromise = null;
	let routeTimer = null;

	function isReportFormRoute(route) {
		return !!(route && route[0] === "Form" && route[1] === DOCTYPE);
	}

	function scriptsReady() {
		return (
			typeof project_workload_assignment?.workloadReports?.reportForm?.bindForm ===
			"function"
		);
	}

	function ensureScripts() {
		if (scriptsReady()) return Promise.resolve();
		if (!loadPromise) {
			loadPromise = new Promise((resolve, reject) => {
				frappe.require(ASSETS, () => {
					if (!scriptsReady()) {
						reject(new Error("workload-reports-form.bundle: reportForm missing"));
						return;
					}
					resolve();
				});
			}).catch((err) => {
				loadPromise = null;
				console.error("[PWR form boot]", err);
				throw err;
			});
		}
		return loadPromise;
	}

	function bindOnReportRoute() {
		const route = frappe.get_route?.() || [];
		if (!isReportFormRoute(route)) return;
		console.log("[WR-DEBUG:form-entry] route-match", { route });
		ensureScripts()
			.then(() => {
				console.log("[WR-DEBUG:form-entry] scripts-ready");
				project_workload_assignment.workloadReports.reportForm.bindForm();
			})
			.catch((err) => {
				console.error("[WR-DEBUG:form-entry] scripts-failed", err);
			});
	}

	function onRoute() {
		if (routeTimer) clearTimeout(routeTimer);
		routeTimer = setTimeout(() => {
			routeTimer = null;
			console.log("[WR-DEBUG:form-entry] onRoute", { route: frappe.get_route?.() });
			bindOnReportRoute();
		}, 0);
	}

	if (frappe.router?.on) {
		frappe.router.on("change", onRoute);
	}
	if (typeof frappe.ready === "function") {
		frappe.ready(onRoute);
	} else {
		document.addEventListener("DOMContentLoaded", onRoute);
	}
})();
