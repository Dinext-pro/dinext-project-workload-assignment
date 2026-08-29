/**
 * Lazy mount for heavy Project form tab content.
 * - mountFn runs once per bind cycle (form refresh), not on every tab switch
 * - CSS overlay on tab pane until mountFn settles (Promise-aware)
 */
(function () {
	frappe.provide("project_workload_assignment");

	function getFieldTab(frm, fieldname) {
		const field = frm?.get_field?.(fieldname);
		if (!field) {
			if (fieldname === "custom_workload_tab_anchor") {
				const tabs = frm?.layout?.tabs;
				if (tabs?.length) {
					for (let i = 0; i < tabs.length; i++) {
						const tab = tabs[i];
						if (tab?.df?.fieldname === "custom_загрузка") {
							return tab;
						}
					}
				}
			}
			return null;
		}
		if (field.tab) {
			return field.tab;
		}
		const node = field.$wrapper?.get?.(0);
		const tabs = frm.layout?.tabs;
		if (!node || !tabs?.length) {
			return null;
		}
		for (let i = 0; i < tabs.length; i++) {
			const tab = tabs[i];
			const pane = tab.wrapper?.get?.(0);
			if (pane && $.contains(pane, node)) {
				return tab;
			}
		}
		return null;
	}

	function isFieldTabVisible(frm, fieldname) {
		const tab = getFieldTab(frm, fieldname);
		if (!tab) {
			return false;
		}
		return typeof tab.is_active === "function"
			? tab.is_active()
			: !!tab.wrapper?.hasClass?.("active");
	}

	function ensureLazyState(frm) {
		if (!frm._pwaLazy) {
			frm._pwaLazy = {
				mountFns: {},
				done: {},
				inflight: {},
				overlayCount: {},
				bound: {},
			};
		}
		return frm._pwaLazy;
	}

	function tabPaneKey(frm, fieldname) {
		const tab = getFieldTab(frm, fieldname);
		return (tab && tab.df && tab.df.fieldname) || fieldname;
	}

	function showTabOverlay(frm, fieldname) {
		const tab = getFieldTab(frm, fieldname);
		const $pane = tab && tab.wrapper;
		if (!$pane || !$pane.length) {
			return;
		}

		const state = ensureLazyState(frm);
		const key = tabPaneKey(frm, fieldname);
		state.overlayCount[key] = (state.overlayCount[key] || 0) + 1;
		if (state.overlayCount[key] > 1) {
			return;
		}

		$pane.addClass("pwa-tab-loading-host");
		let $el = $pane.children(".pwa-tab-loading");
		if (!$el.length) {
			const label = frappe.utils.escape_html(__("Loading…"));
			$el = $(
				`<div class="pwa-tab-loading" aria-live="polite"><p class="text-muted">${label}</p></div>`
			);
			$pane.prepend($el);
		}
		$el.removeClass("is-hidden");
	}

	function hideTabOverlay(frm, fieldname) {
		const tab = getFieldTab(frm, fieldname);
		const $pane = tab && tab.wrapper;
		if (!$pane || !$pane.length) {
			return;
		}

		const state = ensureLazyState(frm);
		const key = tabPaneKey(frm, fieldname);
		state.overlayCount[key] = Math.max(0, (state.overlayCount[key] || 0) - 1);
		if (state.overlayCount[key] > 0) {
			return;
		}

		$pane.children(".pwa-tab-loading").addClass("is-hidden");
	}

	function runLazyMount(frm, fieldname) {
		const state = ensureLazyState(frm);
		if (state.done[fieldname] || state.inflight[fieldname]) {
			console.log("[WR-DEBUG:lazy-tab] runLazyMount-skip", {
				fieldname,
				done: !!state.done[fieldname],
				inflight: !!state.inflight[fieldname],
			});
			return;
		}

		const mountFn = state.mountFns[fieldname];
		if (typeof mountFn !== "function") {
			console.log("[WR-DEBUG:lazy-tab] runLazyMount-no-fn", { fieldname });
			return;
		}

		console.log("[WR-DEBUG:lazy-tab] runLazyMount-start", { fieldname, project: frm?.doc?.name });
		state.inflight[fieldname] = true;
		showTabOverlay(frm, fieldname);

		Promise.resolve()
			.then(() => mountFn())
			.catch((err) => {
				console.error(`[WR-DEBUG:lazy-tab] ${fieldname} failed`, err);
			})
			.finally(() => {
				state.inflight[fieldname] = false;
				state.done[fieldname] = true;
				hideTabOverlay(frm, fieldname);
				console.log("[WR-DEBUG:lazy-tab] runLazyMount-done", { fieldname });
			});
	}

	/**
	 * Bind mountFn to the field's tab `shown.bs.tab`.
	 * Call from form refresh: resets once-flag for this field (shell may be new),
	 * but repeat tab switches within the same cycle do not remount / re-show overlay.
	 */
	function bindLazyTabMount(frm, fieldname, mountFn) {
		if (!frm || !fieldname || typeof mountFn !== "function") {
			console.log("[WR-DEBUG:lazy-tab] bind-abort-invalid-args", {
				hasFrm: !!frm,
				fieldname,
				hasMountFn: typeof mountFn === "function",
			});
			return;
		}

		const state = ensureLazyState(frm);
		state.mountFns[fieldname] = mountFn;
		if (!state.inflight[fieldname]) {
			delete state.done[fieldname];
		}

		const attach = () => {
			const tab = getFieldTab(frm, fieldname);
			if (!tab) {
				console.log("[WR-DEBUG:lazy-tab] attach-no-tab", {
					fieldname,
					hasField: !!frm.get_field?.(fieldname),
					project: frm?.doc?.name,
				});
				return false;
			}

			const $link = tab.tab_link?.find?.(".nav-link");
			if ($link?.length && !state.bound[fieldname]) {
				state.bound[fieldname] = true;
				$link.on("shown.bs.tab", function () {
					console.log("[WR-DEBUG:lazy-tab] tab-shown", { fieldname });
					runLazyMount(frm, fieldname);
				});
			}

			const tabVisible = isFieldTabVisible(frm, fieldname);
			console.log("[WR-DEBUG:lazy-tab] attach", {
				fieldname,
				tabVisible,
				tabFieldname: tab.df?.fieldname,
			});
			if (tabVisible) {
				runLazyMount(frm, fieldname);
			}
			return true;
		};

		if (attach()) {
			return;
		}

		setTimeout(() => {
			console.log("[WR-DEBUG:lazy-tab] attach-retry", { fieldname });
			attach();
		}, 0);
	}

	project_workload_assignment.getFieldTab = getFieldTab;
	project_workload_assignment.isFieldTabVisible = isFieldTabVisible;
	project_workload_assignment.bindLazyTabMount = bindLazyTabMount;

	// Workload project-tab: boot here (form-tab always loads; doctype entry.js may be cached/skipped).
	(function wrProjectTabBoot() {
		const ASSETS = [
			"/assets/project_workload_assignment/css/workload-reports-filters.css",
			"/assets/project_workload_assignment/css/workload-reports-charts.css",
			"/assets/project_workload_assignment/css/workload-reports-table.css",
			"dinext-table.bundle.js",
			"workload-reports-common.bundle.js",
			"workload-reports-project.bundle.js",
		];
		let loadPromise = null;

		function ensureWorkloadProject() {
			const project = project_workload_assignment?.workloadReports?.project;
			if (project?.scheduleMount) {
				return Promise.resolve(project);
			}
			if (!loadPromise) {
				loadPromise = new Promise((resolve, reject) => {
					console.log("[WR-DEBUG:project-boot] loading assets");
					frappe.require(ASSETS, () => {
						const api = project_workload_assignment?.workloadReports?.project;
						if (!api?.bindForm || !api?.scheduleMount) {
							reject(new Error("workload-reports-project.bundle: project API missing"));
							return;
						}
						api.bindForm();
						console.log("[WR-DEBUG:project-boot] assets-ready");
						resolve(api);
					});
				}).catch((err) => {
					loadPromise = null;
					console.error("[WR-DEBUG:project-boot] failed", err);
					throw err;
				});
			}
			return loadPromise;
		}

		frappe.ui.form.on("Project", {
			refresh(frm) {
				ensureWorkloadProject()
					.then((project) => project.scheduleMount(frm))
					.catch(() => {});
			},
		});
	})();

	// Projects Workload Report: boot here (entry.js in app_include may not execute).
	(function wrFormBoot() {
		const DOCTYPE = "Projects Workload Report";
		const ASSETS = [
			"/assets/project_workload_assignment/css/workload-reports-shell.css",
			"/assets/project_workload_assignment/css/workload-reports-filters.css",
			"/assets/project_workload_assignment/css/workload-reports-charts.css",
			"/assets/project_workload_assignment/css/workload-reports-table.css",
			"dinext-table.bundle.js",
			"workload-reports-common.bundle.js",
			"workload-reports-form.bundle.js",
		];
		let loadPromise = null;
		let formHookRegistered = false;

		function isReportFormRoute(route) {
			return !!(route && route[0] === "Form" && route[1] === DOCTYPE);
		}

		function ensureWorkloadForm() {
			const api = project_workload_assignment?.workloadReports?.reportForm;
			if (api?.bindForm && window.__PWR_FORM_BOUND__) {
				return Promise.resolve(api);
			}
			if (!loadPromise) {
				loadPromise = new Promise((resolve, reject) => {
					console.log("[WR-DEBUG:form-boot] loading assets");
					frappe.require(ASSETS, () => {
						const reportForm = project_workload_assignment?.workloadReports?.reportForm;
						if (!reportForm?.bindForm) {
							reject(new Error("workload-reports-form.bundle: reportForm missing"));
							return;
						}
						reportForm.bindForm();
						console.log("[WR-DEBUG:form-boot] assets-ready");
						resolve(reportForm);
					});
				}).catch((err) => {
					loadPromise = null;
					console.error("[WR-DEBUG:form-boot] failed", err);
					throw err;
				});
			}
			return loadPromise;
		}

		function mountIfNeeded(api) {
			const frm = window.cur_frm;
			if (frm?.doctype === DOCTYPE && !frm._wrForm) {
				console.log("[WR-DEBUG:form-boot] mount-now");
				api.mount?.(frm);
			}
		}

		function registerFormHook() {
			if (formHookRegistered) {
				return;
			}
			formHookRegistered = true;
			console.log("[WR-DEBUG:form-boot] register-form-hook");
			frappe.ui.form.on(DOCTYPE, {
				refresh(frm) {
					console.log("[WR-DEBUG:form-boot] form-refresh", { name: frm?.doc?.name });
					ensureWorkloadForm()
						.then((api) => {
							if (!frm._wrForm) {
								api.mount?.(frm);
							}
						})
						.catch((err) => {
							console.error("[WR-DEBUG:form-boot] refresh-failed", err);
						});
				},
			});
		}

		function tryRouteBoot(attempt = 0) {
			const route = frappe.get_route?.() || [];
			const dataRoute = document.body?.getAttribute?.("data-route") || "";
			const onReport =
				isReportFormRoute(route) ||
				dataRoute.includes("Projects Workload Report") ||
				dataRoute.includes("projects-workload-report");

			if (!isReportFormRoute(route)) {
				if (onReport && attempt < 60) {
					setTimeout(() => tryRouteBoot(attempt + 1), 50);
				}
				return;
			}
			console.log("[WR-DEBUG:form-boot] route-match", { route, attempt });
			registerFormHook();
			ensureWorkloadForm()
				.then(mountIfNeeded)
				.catch((err) => {
					console.error("[WR-DEBUG:form-boot] route-failed", err);
				});
		}

		registerFormHook();

		function onRoute() {
			setTimeout(() => tryRouteBoot(0), 0);
		}

		if (frappe.router?.on) {
			frappe.router.on("change", onRoute);
		}
		if (typeof frappe.ready === "function") {
			frappe.ready(onRoute);
		}
		// Desk may already be ready when this app_include runs — boot immediately.
		onRoute();
		setTimeout(() => tryRouteBoot(0), 100);
		setTimeout(() => tryRouteBoot(0), 500);
	})();
})();
