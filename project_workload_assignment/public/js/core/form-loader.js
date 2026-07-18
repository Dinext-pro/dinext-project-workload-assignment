/* ISS-2026-00002: fallback loader when FormMeta __js bundle is stale or incomplete. */
console.log("[PWR] pwr-form-loader.js loaded");

(function () {
	frappe.provide("project_workload_assignment");
	const DOCTYPE = "Projects Workload Report";
	const ASSET_BASE = "/assets/project_workload_assignment";
	const MIN_EXPECTED_META_JS_LEN = 60000;
	const REPORT_ASSETS = [
		`${ASSET_BASE}/js/core/api-methods.js`,
		`${ASSET_BASE}/js/core/plan-fact-cell.js`,
		`${ASSET_BASE}/js/core/shared.js`,
		`${ASSET_BASE}/js/pwr-report/helpers.js`,
		`${ASSET_BASE}/js/pwr-report/absences.js`,
		`${ASSET_BASE}/js/pwr-report/filters.js`,
		`${ASSET_BASE}/js/pwr-report/columns.js`,
		`${ASSET_BASE}/js/pwr-report/data.js`,
		`${ASSET_BASE}/js/pwr-report/form.js`,
		`${ASSET_BASE}/js/charts/bootstrap.js`,
	];

	let loadPromise = null;

	function log(step, detail) {
		const line = detail != null ? `[PWR boot] ${step} — ${detail}` : `[PWR boot] ${step}`;
		console.log(line);
		if (project_workload_assignment.pwrBoot && project_workload_assignment.pwrBoot.log) {
			project_workload_assignment.pwrBoot.log(step, detail);
		}
	}

	function isReportFormRoute(route) {
		if (!route || route[0] !== "Form") {
			return false;
		}
		return route[1] === DOCTYPE;
	}

	function reportScriptsReady() {
		return (
			project_workload_assignment.pwrReport &&
			typeof project_workload_assignment.pwrReport.render_projects_workload_table ===
				"function"
		);
	}

	function metaJsLooksStale(meta) {
		if (!meta || !meta.__js) {
			return true;
		}
		if (meta.__js.length < MIN_EXPECTED_META_JS_LEN) {
			return true;
		}
		return meta.__js.indexOf("render_projects_workload_table") === -1;
	}

	function resetStaleMetaCache() {
		const meta = locals.DocType && locals.DocType[DOCTYPE];
		if (!metaJsLooksStale(meta)) {
			return false;
		}
		log(
			"form-loader reset meta",
			meta && meta.__js
				? `stale __js len=${meta.__js.length}`
				: "missing __js"
		);
		delete locals.DocType[DOCTYPE];
		try {
			localStorage.removeItem(`_doctype:${DOCTYPE}`);
		} catch (_e) {
			/* ignore */
		}
		return true;
	}

	function ensureReportScripts() {
		if (reportScriptsReady()) {
			return Promise.resolve();
		}
		if (!loadPromise) {
			loadPromise = new Promise((resolve, reject) => {
				log("form-loader require start");
				frappe.require(REPORT_ASSETS, () => {
					if (reportScriptsReady()) {
						log("form-loader require done");
						resolve();
						return;
					}
					reject(
						new Error(
							"PWR report scripts loaded but render_projects_workload_table missing"
						)
					);
				});
			}).catch((error) => {
				loadPromise = null;
				log("form-loader require FAIL", error.message || String(error));
				console.error("[PWR boot] form-loader", error);
				throw error;
			});
		}
		return loadPromise;
	}

	function retryCurrentFormRender() {
		const frm = window.cur_frm;
		if (!frm || frm.doctype !== DOCTYPE || !reportScriptsReady()) {
			return;
		}
		if (frm.projects_workload_dt) {
			return;
		}
		const NS = project_workload_assignment.pwrReport;
		if (!NS || typeof NS.scheduleProjectsWorkloadFiltersInit !== "function") {
			return;
		}
		log("form-loader retry render", frm.doc && frm.doc.name ? frm.doc.name : "new");
		NS.scheduleProjectsWorkloadFiltersInit(frm).then((filtersReady) => {
			if (!filtersReady || frm !== window.cur_frm || frm.projects_workload_dt) {
				return;
			}
			NS.render_projects_workload_table(frm);
		});
	}

	function handleReportRoute() {
		if (!isReportFormRoute(frappe.get_route())) {
			return;
		}
		const stale = resetStaleMetaCache();
		if (stale) {
			frappe.model.with_doctype(DOCTYPE, () => {
				ensureReportScripts()
					.then(retryCurrentFormRender)
					.catch(() => {});
			});
			return;
		}
		ensureReportScripts()
			.then(retryCurrentFormRender)
			.catch(() => {});
	}

	log("pwr-form-loader.js init");

	if (frappe.router && frappe.router.on) {
		frappe.router.on("change", handleReportRoute);
	}

	function callWhenFrappeReady(fn, attemptsLeft) {
		if (typeof frappe.ready === "function") {
			frappe.ready(fn);
			return;
		}
		if (attemptsLeft <= 0) {
			log("form-loader frappe.ready unavailable, falling back to DOMContentLoaded");
			document.addEventListener("DOMContentLoaded", fn);
			return;
		}
		setTimeout(() => callWhenFrappeReady(fn, attemptsLeft - 1), 50);
	}

	callWhenFrappeReady(handleReportRoute, 100);
})();
