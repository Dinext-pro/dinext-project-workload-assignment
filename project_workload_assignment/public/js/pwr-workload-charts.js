/* ISS-2026-00002: бизнес-логика сводных графиков PWR / Project Workload. */
frappe.provide("project_workload_assignment.charts");

(function () {
	const TEAM_API =
		"project_workload_assignment.project_workload_api.pwr_run_team_workload_charts";
	const PROJECT_API =
		"project_workload_assignment.project_workload_api.pwr_run_project_workload_charts";

	const WORKER_WTYPE_OPTIONS = "\nEmployee\nSupplier";
	const TABLE_WAIT_MS = 300;
	const TABLE_WAIT_ATTEMPTS = 40;
	const CONTAINER_WAIT_MS = 50;
	const CONTAINER_WAIT_ATTEMPTS = 40;
	const stateByForm = new WeakMap();
	const TEAM_GRID_ROOT = ".projects_workload_report";
	const PROJECT_GRID_ROOT = ".project_workload_container";

	function cleanupOrphanedDataZoomSliders($scope) {
		// ECharts dataZoom slider рендерится в body и остаётся после dispose/remount.
		$("body > .ec-extension").remove();
		const $root = $scope && $scope.length ? $scope : $(document.body);
		$root.find(".ec-datazoom-slider, .echarts-datazoom").each(function () {
			if (!$(this).closest(".dinext-chart-panel__chart").length) {
				$(this).closest(".ec-extension, .echarts-datazoom").remove();
				$(this).remove();
			}
		});
	}

	function getChartMountAnchor($table, gridRootSelector) {
		const $gridRoot = $table.closest(gridRootSelector);
		return $gridRoot.length ? $gridRoot : $table;
	}

	function getFormWrapper(frm) {
		if (!frm || !frm.wrapper) {
			return $();
		}
		return frm.wrapper.jquery ? frm.wrapper : $(frm.wrapper);
	}

	function triggerWorkloadLayout(frm) {
		if (!frm) {
			return;
		}
		if (
			frm.doctype === "Projects Workload Report" &&
			typeof applyProjectsWorkloadGridViewportHeight === "function"
		) {
			applyProjectsWorkloadGridViewportHeight(frm);
			const $root = getFormWrapper(frm);
			const $chart = $root.find(".pwr-workload-charts-root").first();
			const $gridRoot = $root.find(".projects_workload_report").first();
			if ($chart.length && $gridRoot.length) {
				const chartH = $chart.outerHeight(true) || 0;
				const currentH = parseFloat($gridRoot.css("height")) || 0;
				if (chartH > 0 && currentH > 320) {
					const nextH = Math.max(320, currentH - chartH);
					$gridRoot.css({
						height: nextH,
						minHeight: nextH,
						maxHeight: nextH,
					});
				}
			}
		}
		window.dispatchEvent(new Event("resize"));
	}

	function getTeamFieldWrapper(frm) {
		const field = frm.get_field && frm.get_field("projects_workload_report");
		if (field && field.$wrapper && field.$wrapper.length) {
			return field.$wrapper;
		}
		return getFormWrapper(frm).find('[data-fieldname="projects_workload_report"]').first();
	}

	function waitForVisibleContainer($el, callback) {
		let attempts = 0;
		const tick = () => {
			if ($el.is(":visible") && $el.width() > 80) {
				callback();
				return;
			}
			attempts += 1;
			if (attempts < CONTAINER_WAIT_ATTEMPTS) {
				setTimeout(tick, CONTAINER_WAIT_MS);
			}
		};
		tick();
	}

	function getTeamViewType() {
		return typeof currentViewType !== "undefined" ? currentViewType : "weekly";
	}

	function getTeamPeriodRange() {
		return typeof currentPeriodRange !== "undefined" ? currentPeriodRange : "quarter";
	}

	function getProjectViewType() {
		return typeof currentViewType !== "undefined" ? currentViewType : "daily";
	}

	function getProjectDateRange() {
		const from =
			typeof displayDateFrom !== "undefined" && displayDateFrom
				? displayDateFrom
				: frappe.datetime.get_today();
		const to =
			typeof displayDateTo !== "undefined" && displayDateTo
				? displayDateTo
				: frappe.datetime.add_months(from, 1);
		return { from, to };
	}

	function periodLabels(periods, viewType) {
		return (periods || []).map((p) => {
			if (viewType === "daily") {
				return frappe.datetime.str_to_user(p.date);
			}
			if (viewType === "weekly") {
				return `${p.start_date} — ${p.end_date}`;
			}
			return `${p.year}-${String(p.month).padStart(2, "0")}`;
		});
	}

	function buildDataZoom() {
		// Только inside: видимый slider утекал в DOM при remount без dispose.
		return [{ type: "inside", filterMode: "none" }];
	}

	function buildTeamChartOption(data, viewType) {
		const periods = data.periods || [];
		const series = data.series || {};
		const labels = periodLabels(periods, viewType);
		const employee = (series.workload_forecast_hours_by_wtype || {}).Employee || [];
		const supplier = (series.workload_forecast_hours_by_wtype || {}).Supplier || [];

		return {
			tooltip: { trigger: "axis" },
			legend: { top: 0, type: "scroll" },
			grid: { left: 48, right: 16, top: 48, bottom: 24, containLabel: true },
			dataZoom: buildDataZoom(),
			xAxis: { type: "category", data: labels, boundaryGap: true },
			yAxis: { type: "value", name: __("Hours") },
			series: [
				{
					name: __("Capacity"),
					type: "line",
					smooth: true,
					showSymbol: false,
					areaStyle: { opacity: 0.15 },
					data: series.capacity_hours || [],
				},
				{
					name: __("Utilization plan"),
					type: "line",
					smooth: true,
					showSymbol: false,
					areaStyle: { opacity: 0.12 },
					data: series.utilization_plan_hours || [],
				},
				{
					name: __("Employee forecast"),
					type: "bar",
					stack: "workload",
					data: employee,
				},
				{
					name: __("Supplier forecast"),
					type: "bar",
					stack: "workload",
					data: supplier,
				},
				{
					name: __("Utilization forecast"),
					type: "scatter",
					data: (series.utilization_forecast_hours || []).map((v, i) => [i, v]),
				},
			],
		};
	}

	function buildProjectChartOption(data, viewType) {
		const periods = data.periods || [];
		const series = data.series || {};
		const labels = periodLabels(periods, viewType);
		const forecastEmp = (series.workload_forecast_hours_by_wtype || {}).Employee || [];
		const forecastSup = (series.workload_forecast_hours_by_wtype || {}).Supplier || [];
		const actualEmp = (series.actual_hours_by_wtype || {}).Employee || [];
		const actualSup = (series.actual_hours_by_wtype || {}).Supplier || [];

		return {
			tooltip: { trigger: "axis" },
			legend: { top: 0, type: "scroll" },
			grid: { left: 48, right: 16, top: 48, bottom: 24, containLabel: true },
			dataZoom: buildDataZoom(),
			xAxis: { type: "category", data: labels, boundaryGap: true },
			yAxis: { type: "value", name: __("Hours") },
			series: [
				{
					name: __("Project plan"),
					type: "line",
					smooth: true,
					showSymbol: false,
					areaStyle: { opacity: 0.15 },
					data: series.project_plan_hours || [],
				},
				{
					name: __("Team capacity"),
					type: "line",
					smooth: true,
					showSymbol: false,
					areaStyle: { opacity: 0.12 },
					data: series.team_capacity_hours || [],
				},
				{
					name: __("Employee forecast"),
					type: "bar",
					stack: "forecast",
					data: forecastEmp,
				},
				{
					name: __("Supplier forecast"),
					type: "bar",
					stack: "forecast",
					data: forecastSup,
				},
				{
					name: __("Employee actual"),
					type: "bar",
					stack: "actual",
					data: actualEmp,
				},
				{
					name: __("Supplier actual"),
					type: "bar",
					stack: "actual",
					data: actualSup,
				},
			],
		};
	}

	function ensureState(frm) {
		if (!stateByForm.has(frm)) {
			stateByForm.set(frm, {
				workerWtype: "",
				loadUtilization: false,
				chart: null,
				panel: null,
				scrollCleanup: null,
				resizeCleanup: null,
				loadToken: 0,
				_controlsReady: false,
			});
		}
		return stateByForm.get(frm);
	}

	function disposeChartState(state) {
		if (state.scrollCleanup) {
			state.scrollCleanup();
			state.scrollCleanup = null;
		}
		if (state.resizeCleanup) {
			state.resizeCleanup();
			state.resizeCleanup = null;
		}
		if (state.chart) {
			try {
				state.chart.dispose();
			} catch (_e) {
				/* ignore */
			}
			state.chart = null;
		}
		if (state.panel && state.panel.$chartEl) {
			DinextCharts.dispose(state.panel.$chartEl);
		}
	}

	function removeChartRootsNear($anchor) {
		$anchor.siblings(".pwr-workload-charts-root").each(function () {
			$(this)
				.find(".dinext-chart-panel__chart")
				.each(function () {
					DinextCharts.dispose(this);
				});
			$(this).remove();
		});
	}

	function ensureChartPanel($anchor, state, title) {
		if (
			state.panel &&
			state.panel.$root &&
			state.panel.$root.length &&
			state.panel.$root.closest("body").length &&
			state.panel.$root.next().get(0) === $anchor.get(0)
		) {
			return state.panel;
		}

		disposeChartState(state);
		removeChartRootsNear($anchor);
		state._controlsReady = false;

		const $root = $('<div class="pwr-workload-charts-root"></div>');
		$anchor.before($root);
		const panel = DinextCharts.createPanel($root, {
			title,
			collapsed: false,
			height: "300px",
		});
		panel.$root = $root;
		state.panel = panel;
		return panel;
	}

	function ensurePanelControls(panel, state, reloadFn, options) {
		if (state._controlsReady) {
			return;
		}
		panel.$extra.empty();
		const $filters = $('<div class="pwr-chart-filters"></div>').appendTo(panel.$extra);
		const control = frappe.ui.form.make_control({
			parent: $filters.get(0),
			df: {
				fieldtype: "Select",
				label: __("Worker type"),
				fieldname: "pwr_chart_worker_wtype",
				options: WORKER_WTYPE_OPTIONS,
			},
			render_input: true,
		});
		control.set_value(state.workerWtype || "");
		control.$input.on("change", () => {
			state.workerWtype = control.get_value() || "";
			reloadFn();
		});

		if (options.showUtilizationButton) {
			$(
				`<button type="button" class="btn btn-xs btn-default pwr-chart-utilization-btn">${__(
					"Load utilization"
				)}</button>`
			)
				.appendTo($filters)
				.on("click", () => {
					state.loadUtilization = true;
					reloadFn();
				});
		}
		state._controlsReady = true;
	}

	function findGridViewport($wrapper, extraClass) {
		return $wrapper.find(`.${extraClass} .ag-body-viewport`).first();
	}

	function renderChart(panel, option, $wrapper, extraClass, state) {
		if (state.chart) {
			try {
				state.chart.dispose();
			} catch (_e) {
				/* ignore */
			}
			state.chart = null;
		}
		if (state.scrollCleanup) {
			state.scrollCleanup();
			state.scrollCleanup = null;
		}
		if (state.resizeCleanup) {
			state.resizeCleanup();
			state.resizeCleanup = null;
		}

		return DinextCharts.load().then(
			() =>
				new Promise((resolve) => {
					waitForVisibleContainer(panel.$chartEl, () => {
						panel.$chartEl.empty();
						state.chart = DinextCharts.mount(panel.$chartEl, option);
						state.resizeCleanup = DinextCharts.bindResize(state.chart, panel.$chartEl);

						const resizeAndSync = () => {
							if (!state.chart || state.chart.isDisposed()) {
								return;
							}
							state.chart.resize();
							const viewport = findGridViewport($wrapper, extraClass);
							if (viewport.length && panel.$chartEl.width() > 80) {
								if (state.scrollCleanup) {
									state.scrollCleanup();
								}
								state.scrollCleanup = DinextCharts.syncHorizontalScroll(
									state.chart,
									viewport
								);
							}
						};

						requestAnimationFrame(resizeAndSync);
						setTimeout(resizeAndSync, 120);
						resolve();
					});
				})
		);
	}

	function waitForTable($scope, selector, callback, onTimeout) {
		let attempts = 0;
		const tick = () => {
			const $table = $scope.find(selector).first();
			if ($table.length) {
				callback($table);
				return;
			}
			attempts += 1;
			if (attempts < TABLE_WAIT_ATTEMPTS) {
				setTimeout(tick, TABLE_WAIT_MS);
			} else if (typeof onTimeout === "function") {
				onTimeout();
			}
		};
		tick();
	}

	function loadTeamChart(frm, state, attempt = 0) {
		const token = ++state.loadToken;
		const $section = getTeamFieldWrapper(frm);
		if (!$section.length) {
			if (attempt < 25) {
				scheduleTeamChart(frm, attempt + 1);
			}
			return;
		}

		waitForTable(getFormWrapper(frm), ".projects-workload-table", ($table) => {
			if (token !== state.loadToken) {
				return;
			}
			DinextCharts.load().then(() => {
				if (token !== state.loadToken) {
					return;
				}
				cleanupOrphanedDataZoomSliders(getFormWrapper(frm));
				const $anchor = getChartMountAnchor($table, TEAM_GRID_ROOT);
				const panel = ensureChartPanel($anchor, state, __("Team workload summary"));
				ensurePanelControls(panel, state, () => loadTeamChart(frm, state), {
					showUtilizationButton: true,
				});
				panel.$chartEl.html(`<div class="pwr-chart-loading">${__("Loading chart...")}</div>`);

				const viewType = getTeamViewType();
				const periodRange = getTeamPeriodRange();

				frappe.call({
					method: TEAM_API,
					args: {
						user: frm.doc.user || "",
						project: frm.doc.project || "",
						project_portfolio: frm.doc.project_portfolio || "",
						user_group: frm.doc.user_group || "",
						view_type: viewType,
						period_range: periodRange,
						worker_wtype: state.workerWtype || "",
						load_utilization: state.loadUtilization ? 1 : 0,
					},
					callback(r) {
						if (token !== state.loadToken) {
							return;
						}
						const data = r.message || {};
						if (data.error) {
							panel.$chartEl.html(
								`<div class="pwr-chart-loading text-danger">${frappe.utils.escape_html(
									data.error
								)}</div>`
							);
							return;
						}
						renderChart(
							panel,
							buildTeamChartOption(data, viewType),
							$section,
							"projects-workload-ag-grid",
							state
						).then(() => triggerWorkloadLayout(frm));
					},
					error(r) {
						if (token !== state.loadToken) {
							return;
						}
						panel.$chartEl.html(
							`<div class="pwr-chart-loading text-danger">${frappe.utils.escape_html(
								r?.message || __("Chart request failed")
							)}</div>`
						);
					},
				});
			});
		});
	}

	function isProjectWorkloadVisible(frm) {
		const field = frm.get_field && frm.get_field("custom_workload");
		if (!field || !field.$wrapper || !field.$wrapper.length) {
			const $pane = getFormWrapper(frm).find(
				'.tab-pane[data-fieldname="custom_загрузка"], #project-custom_загрузка'
			);
			return $pane.length > 0 && $pane.hasClass("active") && $pane.is(":visible");
		}
		return field.$wrapper.is(":visible") && field.$wrapper.width() > 40;
	}

	function loadProjectChart(frm, state) {
		if (!isProjectWorkloadVisible(frm)) {
			return;
		}
		const token = ++state.loadToken;
		const field = frm.get_field("custom_workload");
		if (!field || !field.$wrapper) {
			return;
		}
		const $wrapper = field.$wrapper;

		waitForTable(
			$wrapper,
			".project-workload-table",
			($table) => {
				loadProjectChartWithAnchor(frm, state, token, $wrapper, $table);
			},
			() => {
				const $container = $wrapper.find(".project_workload_container").first();
				const $anchor = $container.length ? $container : $wrapper;
				loadProjectChartWithAnchor(frm, state, token, $wrapper, $anchor);
			}
		);
	}

	function loadProjectChartWithAnchor(frm, state, token, $wrapper, $anchor) {
		if (token !== state.loadToken) {
			return;
		}
		DinextCharts.load().then(() => {
			if (token !== state.loadToken) {
				return;
			}
			cleanupOrphanedDataZoomSliders(getFormWrapper(frm));
			const $mountAnchor = getChartMountAnchor($anchor, PROJECT_GRID_ROOT);
			const panel = ensureChartPanel($mountAnchor, state, __("Project workload summary"));
			ensurePanelControls(panel, state, () => loadProjectChart(frm, state), {
				showUtilizationButton: false,
			});
			panel.$chartEl.html(`<div class="pwr-chart-loading">${__("Loading chart...")}</div>`);

			const viewType = getProjectViewType();
			const { from, to } = getProjectDateRange();

			frappe.call({
				method: PROJECT_API,
				args: {
					project: frm.doc.name,
					view_type: viewType,
					date_from: from,
					date_to: to,
					worker_wtype: state.workerWtype || "",
				},
				callback(r) {
					if (token !== state.loadToken) {
						return;
					}
					const data = r.message || {};
					if (data.error) {
						panel.$chartEl.html(
							`<div class="pwr-chart-loading text-danger">${frappe.utils.escape_html(
								data.error
							)}</div>`
						);
						return;
					}
					renderChart(
						panel,
						buildProjectChartOption(data, viewType),
						$wrapper,
						"project-workload-ag-grid",
						state
					).then(() => triggerWorkloadLayout(frm));
				},
				error(r) {
					if (token !== state.loadToken) {
						return;
					}
					panel.$chartEl.html(
						`<div class="pwr-chart-loading text-danger">${frappe.utils.escape_html(
							r?.message || __("Chart request failed")
						)}</div>`
					);
				},
			});
		});
	}

	function scheduleTeamChart(frm, attempt = 0) {
		const state = ensureState(frm);
		clearTimeout(state._teamTimer);
		const delay = attempt === 0 ? 600 : 350;
		state._teamTimer = setTimeout(() => {
			cleanupOrphanedDataZoomSliders(getFormWrapper(frm));
			loadTeamChart(frm, state, attempt);
		}, delay);
	}

	function scheduleProjectChart(frm) {
		const state = ensureState(frm);
		clearTimeout(state._projectTimer);
		state._projectTimer = setTimeout(() => loadProjectChart(frm, state), 400);
	}

	function registerChartHandlers() {
		if (project_workload_assignment.charts._pwrHandlersRegistered) {
			return;
		}
		project_workload_assignment.charts._pwrHandlersRegistered = true;
		cleanupOrphanedDataZoomSliders();

		frappe.ui.form.on("Projects Workload Report", {
			refresh(frm) {
				scheduleTeamChart(frm);
			},
		});

		frappe.ui.form.on("Project", {
			refresh(frm) {
				scheduleProjectChart(frm);
			},
			custom_загрузка(frm) {
				scheduleProjectChart(frm);
			},
		});

		$(document).on(
			"shown.bs.tab",
			'[data-fieldname="custom_загрузка"], a[data-fieldname="custom_загрузка"]',
			function () {
				if (cur_frm && cur_frm.doctype === "Project") {
					scheduleProjectChart(cur_frm);
				}
			}
		);

		if (frappe.router && frappe.router.on) {
			frappe.router.on("change", () => {
				setTimeout(() => cleanupOrphanedDataZoomSliders(), 0);
			});
		}

		$(document).on("pwr-workload-data-updated", (_e, frm) => {
			if (!frm || !frm.doctype) {
				return;
			}
			if (frm.doctype === "Projects Workload Report") {
				scheduleTeamChart(frm);
			}
			if (frm.doctype === "Project") {
				scheduleProjectChart(frm);
			}
		});
	}

	function activateChartsForCurrentForm() {
		if (!cur_frm || !cur_frm.doctype) {
			return;
		}
		if (cur_frm.doctype === "Projects Workload Report") {
			scheduleTeamChart(cur_frm);
		} else if (cur_frm.doctype === "Project") {
			scheduleProjectChart(cur_frm);
		}
	}

	project_workload_assignment.charts.boot = function () {
		registerChartHandlers();
		activateChartsForCurrentForm();
	};
	project_workload_assignment.charts.init = project_workload_assignment.charts.boot;
})();
