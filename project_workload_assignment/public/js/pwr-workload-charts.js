/* ISS-2026-00002: бизнес-логика сводных графиков PWR / Project Workload. */
frappe.provide("project_workload_assignment.charts");

(function () {
	const TEAM_API =
		"project_workload_assignment.project_workload_api.pwr_run_team_workload_charts";
	const PROJECT_API =
		"project_workload_assignment.project_workload_api.pwr_run_project_workload_charts";

	const CHART_LAYOUT_VERSION = "filters-above-chart-v1";
	const Y_AXIS_GUTTER_PX = 50;
	const RELOAD_DEBOUNCE_MS = 80;
	const TABLE_WAIT_MS = 300;
	const TABLE_WAIT_ATTEMPTS = 40;
	const CONTAINER_WAIT_MS = 50;
	const CONTAINER_WAIT_ATTEMPTS = 40;
	const stateByForm = new WeakMap();
	const CHART_HEIGHT_PX = 200;
	const CHART_HEIGHT = `${CHART_HEIGHT_PX}px`;

	function getChartMountAnchor($table) {
		// График монтируется непосредственно перед таблицей, после строки фильтров grid.
		return $table;
	}

	function getFormWrapper(frm) {
		if (!frm || !frm.wrapper) {
			return $();
		}
		return frm.wrapper.jquery ? frm.wrapper : $(frm.wrapper);
	}

	function readPwrGlobal(name, fallback) {
		if (typeof window !== "undefined" && window[name] != null && window[name] !== "") {
			return window[name];
		}
		return fallback;
	}

	function getTeamViewType() {
		return readPwrGlobal("currentViewType", "weekly");
	}

	function getTeamPeriodRange() {
		return readPwrGlobal("currentPeriodRange", "quarter");
	}

	function getProjectViewType() {
		return readPwrGlobal("currentViewType", "daily");
	}

	function getProjectDateRange() {
		const from =
			readPwrGlobal("displayDateFrom", null) ||
			(typeof displayDateFrom !== "undefined" && displayDateFrom
				? displayDateFrom
				: null) ||
			frappe.datetime.get_today();
		const to =
			readPwrGlobal("displayDateTo", null) ||
			(typeof displayDateTo !== "undefined" && displayDateTo
				? displayDateTo
				: null) ||
			frappe.datetime.add_months(from, 1);
		return { from, to };
	}

	function getChartContextKey(frm, state) {
		if (!frm) {
			return "";
		}
		if (frm.doctype === "Projects Workload Report") {
			return [
				getTeamViewType(),
				getTeamPeriodRange(),
				state.workerWtype || "",
				state.loadUtilization ? "1" : "0",
				frm.doc.user || "",
				frm.doc.project || "",
				frm.doc.project_portfolio || "",
				frm.doc.user_group || "",
			].join("|");
		}
		const { from, to } = getProjectDateRange();
		return [getProjectViewType(), from, to, state.workerWtype || ""].join("|");
	}

	function parseTeamChartContext(contextKey) {
		const parts = String(contextKey).split("|");
		return {
			viewType: parts[0],
			periodRange: parts[1],
		};
	}

	function applyChartHeights(panel) {
		if (!panel) {
			return;
		}
		const heightVar = CHART_HEIGHT;
		if (panel.$root && panel.$root.length) {
			panel.$root.css("--pwr-chart-plot-height", heightVar);
		}
		if (panel.$syncGrid && panel.$syncGrid.length) {
			panel.$syncGrid.css("--pwr-chart-plot-height", heightVar);
		}
		if (panel.$viewport && panel.$viewport.length) {
			panel.$viewport.css({ height: heightVar });
		}
		if (panel.$gutterYaxis && panel.$gutterYaxis.length) {
			panel.$gutterYaxis.css({ height: heightVar, minHeight: heightVar });
		}
		if (panel.$chartEl && panel.$chartEl.length) {
			panel.$chartEl.css({ height: heightVar, minHeight: heightVar });
		}
	}

	function triggerWorkloadLayout(frm) {
		syncWorkloadGridViewportHeight(frm);
	}

	function getChartOccupiedHeight(frm) {
		if (!frm) {
			return 0;
		}
		const state = stateByForm.get(frm);
		if (state && state.chartVisible === false) {
			return 0;
		}
		const $chart = getFormWrapper(frm).find(".pwr-workload-charts-root").first();
		if (!$chart.length || !$chart.is(":visible")) {
			return 0;
		}
		return $chart.outerHeight(true) || CHART_HEIGHT_PX;
	}

	function resolveActiveWorkloadFrm(frm) {
		if (
			frm &&
			(frm.doctype === "Projects Workload Report" || frm.doctype === "Project")
		) {
			return frm;
		}
		if (
			cur_frm &&
			(cur_frm.doctype === "Projects Workload Report" || cur_frm.doctype === "Project")
		) {
			return cur_frm;
		}
		return frm;
	}

	function resolveProjectsWorkloadFrm(frm) {
		return resolveActiveWorkloadFrm(frm);
	}

	function setElementBoxHeight($el, heightPx) {
		if (!$el || !$el.length) {
			return;
		}
		const height = `${heightPx}px`;
		const node = $el[0];
		node.style.setProperty("height", height, "important");
		node.style.setProperty("min-height", height, "important");
		node.style.setProperty("max-height", height, "important");
		node.style.setProperty("flex", "1 1 auto");
		node.style.setProperty("min-width", "0");
		node.style.setProperty("box-sizing", "border-box");
	}

	function applyGridSlotHeight(frm, $gridRoot, $gridSlot, gridHeight) {
		setElementBoxHeight($gridSlot, gridHeight);
		$gridRoot.find(".projects-workload-ag-grid, .project-workload-ag-grid").each(function () {
			const node = this;
			node.style.setProperty("height", `${gridHeight}px`, "important");
			node.style.setProperty("min-height", "0", "important");
			node.style.setProperty("max-height", `${gridHeight}px`, "important");
			node.style.setProperty("margin", "0", "important");
			node.style.setProperty("flex", "1 1 auto");
			node.style.setProperty("box-sizing", "border-box");
		});

		const gridTable = getWorkloadGridTable(frm);
		if (gridTable && gridTable.api) {
			requestAnimationFrame(() => {
				if (gridTable.api.isDestroyed && gridTable.api.isDestroyed()) {
					return;
				}
				if (typeof gridTable.api.resetRowHeights === "function") {
					gridTable.api.resetRowHeights();
				}
			});
		}
	}

	function installProjectsWorkloadViewportHeight() {
		window.applyProjectsWorkloadGridViewportHeight = function (frm) {
			syncWorkloadGridViewportHeight(frm);
		};
		window.applyProjectsWorkloadGridViewportHeight._pwrInstalled = true;
	}

	function applyWorkloadGridRootLayout($gridRoot) {
		$gridRoot.css({
			display: "flex",
			flexDirection: "column",
			boxSizing: "border-box",
			height: "auto",
			minHeight: 0,
			maxHeight: "none",
		});
	}

	function syncProjectsWorkloadGridViewportHeight(frm) {
		installProjectsWorkloadViewportHeight();
		frm = resolveActiveWorkloadFrm(frm);
		if (!frm || !frm.wrapper || frm.doctype !== "Projects Workload Report") {
			return;
		}
		const $root = getFormWrapper(frm);
		const $gridRoot = $root.find(".projects_workload_report").first();
		const $gridSlot = $gridRoot.find(".projects-workload-table").first();
		if (!$gridRoot.length || !$gridSlot.length) {
			return;
		}

		applyWorkloadGridRootLayout($gridRoot);

		const gridTop = $gridSlot[0].getBoundingClientRect().top;
		const gridHeight = Math.max(320, window.innerHeight - gridTop - 16);
		applyGridSlotHeight(frm, $gridRoot, $gridSlot, gridHeight);
	}

	function syncProjectWorkloadGridViewportHeight(frm) {
		frm = resolveActiveWorkloadFrm(frm);
		if (!frm || !frm.wrapper || frm.doctype !== "Project" || !isProjectWorkloadVisible(frm)) {
			return;
		}
		const field = frm.get_field && frm.get_field("custom_workload");
		if (!field || !field.$wrapper || !field.$wrapper.length) {
			return;
		}
		const $gridRoot = field.$wrapper;
		const $gridSlot = $gridRoot.find(".project-workload-table").first();
		if (!$gridSlot.length) {
			return;
		}

		applyWorkloadGridRootLayout($gridRoot);

		const gridTop = $gridSlot[0].getBoundingClientRect().top;
		const gridHeight = Math.max(320, window.innerHeight - gridTop - 16);
		applyGridSlotHeight(frm, $gridRoot, $gridSlot, gridHeight);
	}

	function syncWorkloadGridViewportHeight(frm) {
		installProjectsWorkloadViewportHeight();
		frm = resolveActiveWorkloadFrm(frm);
		if (!frm || !frm.wrapper) {
			return;
		}
		if (frm.doctype === "Projects Workload Report") {
			syncProjectsWorkloadGridViewportHeight(frm);
		} else if (frm.doctype === "Project") {
			syncProjectWorkloadGridViewportHeight(frm);
		}
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

	function isPeriodColumnId(columnId) {
		return columnId && columnId !== "participant" && String(columnId).indexOf("workload_") === 0;
	}

	function getWorkloadGridTable(frm) {
		if (!frm) {
			return null;
		}
		if (frm.doctype === "Projects Workload Report") {
			return frm.projects_workload_dt || null;
		}
		if (frm.doctype === "Project") {
			return frm.project_workload_dt || null;
		}
		return null;
	}

	function countGridPeriodColumns(gridTable) {
		if (!gridTable || !gridTable.api) {
			return 0;
		}
		const getColumns =
			gridTable.api.getAllGridColumns || gridTable.api.getColumns || null;
		if (!getColumns) {
			return 0;
		}
		const columns = getColumns.call(gridTable.api) || [];
		let count = 0;
		columns.forEach((column) => {
			const colId =
				typeof column.getColId === "function" ? column.getColId() : column.colId;
			if (isPeriodColumnId(colId)) {
				count += 1;
			}
		});
		return count;
	}

	function getChartCategoryCount(state) {
		if (!state.chart || state.chart.isDisposed()) {
			return 0;
		}
		try {
			const xAxis = state.chart.getOption().xAxis;
			const axis = Array.isArray(xAxis) ? xAxis[0] : xAxis;
			const data = axis && axis.data;
			return Array.isArray(data) ? data.length : 0;
		} catch (_e) {
			return 0;
		}
	}

	function isChartLayoutSynced(frm, state, gridTable) {
		if (!isChartContextCurrent(frm, state)) {
			return false;
		}
		if (!state.chart || state.chart.isDisposed()) {
			return false;
		}
		const gridPeriods = countGridPeriodColumns(gridTable);
		const chartPeriods = getChartCategoryCount(state);
		if (!gridPeriods || !chartPeriods) {
			return false;
		}
		return gridPeriods === chartPeriods;
	}

	function measurePinnedGutterWidth(gridTable, $pinned) {
		if (gridTable && gridTable.api && typeof gridTable.api.getColumn === "function") {
			const col = gridTable.api.getColumn("participant");
			if (col && typeof col.getActualWidth === "function") {
				const width = col.getActualWidth();
				if (Number.isFinite(width) && width > 0) {
					return Math.round(width);
				}
			}
		}
		return Math.round($pinned.outerWidth() || 0);
	}

	function measureGridPeriodAreaWidth(gridTable, $centerContainer, $centerViewport) {
		const viewportEl = $centerViewport && $centerViewport.get(0);
		const containerEl = $centerContainer && $centerContainer.get(0);
		if (viewportEl && viewportEl.scrollWidth > 0) {
			return Math.round(viewportEl.scrollWidth);
		}
		if (containerEl && containerEl.scrollWidth > 0) {
			return Math.round(containerEl.scrollWidth);
		}
		const containerW = Math.round(($centerContainer && $centerContainer.outerWidth()) || 0);
		if (containerW > 0) {
			return containerW;
		}
		if (gridTable && gridTable.api) {
			const getColumns =
				gridTable.api.getAllGridColumns || gridTable.api.getColumns || null;
			const columns = getColumns ? getColumns.call(gridTable.api) : [];
			let total = 0;
			let count = 0;
			(columns || []).forEach((column) => {
				const colId =
					typeof column.getColId === "function" ? column.getColId() : column.colId;
				if (!isPeriodColumnId(colId)) {
					return;
				}
				const width =
					typeof column.getActualWidth === "function" ? column.getActualWidth() : 0;
				if (Number.isFinite(width) && width > 0) {
					total += width;
					count += 1;
				}
			});
			if (count > 0) {
				return Math.round(total);
			}
		}
		return 0;
	}

	function measureAveragePeriodColumnWidth(gridTable, $centerContainer, $centerViewport) {
		const gridPeriods = countGridPeriodColumns(gridTable);
		const scrollW = measureGridPeriodAreaWidth(
			gridTable,
			$centerContainer,
			$centerViewport
		);
		if (gridPeriods > 0 && scrollW > 0) {
			return scrollW / gridPeriods;
		}
		return 0;
	}

	function computeChartCanvasWidth(
		periodCount,
		gridTable,
		$centerContainer,
		$centerViewport,
		viewportW
	) {
		const periods = Number(periodCount) || 0;
		const viewport = Number(viewportW) || 0;
		if (!periods) {
			return viewport || 320;
		}
		const colWidth = measureAveragePeriodColumnWidth(
			gridTable,
			$centerContainer,
			$centerViewport
		);
		if (!colWidth) {
			return viewport || 320;
		}
		return Math.max(Math.round(periods * colWidth), viewport);
	}

	function attachWheelSync(targets, handler) {
		const opts = { passive: false, capture: true };
		const bound = [];
		(targets || []).forEach((target) => {
			const el = target && target.jquery ? target.get(0) : target;
			if (!el) {
				return;
			}
			el.addEventListener("wheel", handler, opts);
			bound.push({ el, handler, opts });
		});
		return () => {
			bound.forEach(({ el, handler: fn, opts: listenerOpts }) => {
				el.removeEventListener("wheel", fn, listenerOpts);
			});
		};
	}

	function collectChartWheelTargets(panel, state) {
		const targets = [
			panel.$viewport,
			panel.$chartTrack,
			panel.$chartEl,
			panel.$gutterYaxis,
			panel.$gutterChrome,
			panel.$gutterFilters,
		];
		if (state.chart && !state.chart.isDisposed() && typeof state.chart.getZr === "function") {
			const zr = state.chart.getZr();
			if (zr && zr.dom) {
				targets.push($(zr.dom));
			}
		}
		return targets;
	}

	function buildSyncedGrid() {
		return { left: 0, right: 0, top: 4, bottom: 0, containLabel: false };
	}

	function buildSyncedYAxis() {
		return {
			type: "value",
			axisLabel: { show: false },
			axisTick: { show: false },
			axisLine: { show: false },
			name: "",
		};
	}

	function formatYAxisTick(value, compact) {
		const n = Number(value);
		if (!Number.isFinite(n)) {
			return "";
		}
		if (compact && Math.abs(n) >= 1000) {
			const k = n / 1000;
			if (Math.abs(k - Math.round(k)) < 0.05) {
				return `${Math.round(k)}k`;
			}
			return `${k.toFixed(1)}k`;
		}
		if (Math.abs(n) >= 100) {
			return String(Math.round(n));
		}
		if (Math.abs(n - Math.round(n)) < 0.05) {
			return String(Math.round(n));
		}
		return n.toFixed(1);
	}

	function syncYAxisGutterLabels(chart, panel, yAxisName) {
		const $gutterYaxis = panel.$gutterYaxis;
		if (!chart || chart.isDisposed() || !$gutterYaxis || !$gutterYaxis.length) {
			return;
		}
		const yAxisModel = chart.getModel().getComponent("yAxis", 0);
		if (!yAxisModel || !yAxisModel.axis) {
			return;
		}

		const chartRect = panel.$chartEl[0].getBoundingClientRect();
		const yaxisRect = $gutterYaxis[0].getBoundingClientRect();
		const name = yAxisName || __("Hours");
		const gridModel = chart.getModel().getComponent("grid", 0);
		const gridRect = gridModel && gridModel.coordinateSystem
			? gridModel.coordinateSystem.getRect()
			: null;

		let $name = $gutterYaxis.find(".pwr-chart-yaxis-name");
		if (!$name.length) {
			$name = $('<div class="pwr-chart-yaxis-name"></div>').prependTo($gutterYaxis);
		}
		$name.text(name);
		if (gridRect) {
			const nameTop = chartRect.top - yaxisRect.top + gridRect.y + gridRect.height / 2;
			$name.css({
				top: `${nameTop}px`,
				left: "50%",
				transform: "translate(-50%, -50%) rotate(-90deg)",
			});
		}

		const $ticks = $('<div class="pwr-chart-yaxis-ticks"></div>');
		const plotMin = gridRect ? gridRect.y : 0;
		const plotMax = gridRect ? gridRect.y + gridRect.height : yaxisRect.height;
		(yAxisModel.axis.scale.getTicks() || []).forEach((tick) => {
			const py = chart.convertToPixel({ yAxisIndex: 0 }, tick.value);
			if (!Number.isFinite(py)) {
				return;
			}
			const top = chartRect.top - yaxisRect.top + py;
			if (top < plotMin || top > plotMax) {
				return;
			}
			$(
				`<span class="pwr-chart-yaxis-tick" style="top:${top}px">${frappe.utils.escape_html(
					formatYAxisTick(tick.value, true)
				)}</span>`
			).appendTo($ticks);
		});

		$gutterYaxis.find(".pwr-chart-yaxis-ticks").remove();
		$gutterYaxis.append($ticks);
	}

	function buildSyncedXAxis(labels) {
		return {
			type: "category",
			data: labels,
			boundaryGap: true,
			axisLabel: { show: false },
			axisTick: { show: false },
		};
	}

	function buildTeamChartOption(data, viewType) {
		const periods = data.periods || [];
		const series = data.series || {};
		const labels = periodLabels(periods, viewType);
		const employee = (series.workload_forecast_hours_by_wtype || {}).Employee || [];
		const supplier = (series.workload_forecast_hours_by_wtype || {}).Supplier || [];

		return {
			tooltip: { trigger: "axis" },
			grid: buildSyncedGrid(),
			xAxis: buildSyncedXAxis(labels),
			yAxis: buildSyncedYAxis(),
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
			grid: buildSyncedGrid(),
			xAxis: buildSyncedXAxis(labels),
			yAxis: buildSyncedYAxis(),
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
				chartVisible: true,
				$visibilityToggle: null,
				chart: null,
				panel: null,
				layoutCleanup: null,
				resizeCleanup: null,
				loadToken: 0,
				loadedContextKey: "",
				loadedPeriodCount: 0,
				_controlsReady: false,
				_reloadTimer: null,
			});
		}
		return stateByForm.get(frm);
	}

	function getChartToolbarButtons(frm) {
		const $wrapper = getFormWrapper(frm);
		if (frm.doctype === "Projects Workload Report") {
			return $wrapper.find(".projects-workload-filters-section .filter-buttons").first();
		}
		if (frm.doctype === "Project") {
			return $wrapper.find(".unified-filters-row .filter-buttons").first();
		}
		return $();
	}

	function updateChartVisibilityToggle(state) {
		if (!state.$visibilityToggle || !state.$visibilityToggle.length) {
			return;
		}
		const visible = state.chartVisible !== false;
		state.$visibilityToggle.text(visible ? "▾" : "▸");
		state.$visibilityToggle.attr(
			"title",
			visible ? __("Hide chart") : __("Show chart")
		);
	}

	function applyChartVisibility(frm, state) {
		const visible = state.chartVisible !== false;
		const $chartRoot =
			state.panel && state.panel.$root && state.panel.$root.length
				? state.panel.$root
				: getFormWrapper(resolveActiveWorkloadFrm(frm))
						.find(".pwr-workload-charts-root")
						.first();
		if ($chartRoot.length) {
			$chartRoot.toggle(visible);
		}
		updateChartVisibilityToggle(state);
	}

	function setChartVisible(frm, state, visible) {
		frm = resolveActiveWorkloadFrm(frm);
		state = ensureState(frm);
		state.chartVisible = !!visible;
		applyChartVisibility(frm, state);
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				syncWorkloadGridViewportHeight(frm);
				if (
					state.chartVisible &&
					state.chart &&
					!state.chart.isDisposed() &&
					state.panel &&
					state.panel.$chartEl
				) {
					state.chart.resize();
				}
			});
		});
	}

	function ensureChartVisibilityToggle(frm, state) {
		const $buttons = getChartToolbarButtons(frm);
		if (!$buttons.length) {
			return;
		}
		if (state.$visibilityToggle && state.$visibilityToggle.closest("body").length) {
			applyChartVisibility(frm, state);
			return;
		}
		const $btn = $(
			`<button type="button" class="btn btn-default btn-sm pwr-chart-visibility-toggle" title="${frappe.utils.escape_html(
				__("Hide chart")
			)}">▾</button>`
		);
		$buttons.prepend($btn);
		state.$visibilityToggle = $btn;
		applyChartVisibility(frm, state);
	}

	function isChartContextCurrent(frm, state) {
		if (!frm || !state.loadedContextKey) {
			return false;
		}
		return state.loadedContextKey === getChartContextKey(frm, state);
	}

	function isChartRenderCurrent(state, token) {
		return token === state.loadToken;
	}

	function showChartLoading(panel, message) {
		if (!panel || !panel.$chartEl || !panel.$chartEl.length) {
			return;
		}
		panel.$chartEl.html(
			`<div class="pwr-chart-loading text-muted">${frappe.utils.escape_html(
				message || __("Loading chart...")
			)}</div>`
		);
	}

	function invalidateChartForReload(state) {
		state.loadedContextKey = "";
		state.loadedPeriodCount = 0;
		disposeChartState(state);
		if (state.panel && state.panel.$chartEl && state.panel.$chartEl.length) {
			state.panel.$chartEl.css({ width: "100%", height: CHART_HEIGHT });
		}
	}

	function resetChartPanel(state) {
		invalidateChartForReload(state);
		if (state.panel && state.panel.$root && state.panel.$root.length) {
			state.panel.$root.remove();
		}
		state.panel = null;
		state._controlsReady = false;
	}

	function disposeChartState(state) {
		if (state.layoutCleanup) {
			state.layoutCleanup();
			state.layoutCleanup = null;
		}
		if (state.resizeCleanup) {
			state.resizeCleanup();
			state.resizeCleanup = null;
		}
		if (state.chart) {
			if (state._yAxisSyncHandler) {
				try {
					state.chart.off("finished", state._yAxisSyncHandler);
				} catch (_e) {
					/* ignore */
				}
				state._yAxisSyncHandler = null;
			}
			try {
				state.chart.dispose();
			} catch (_e) {
				/* ignore */
			}
			state.chart = null;
		}
		if (state.panel && state.panel.$gutterYaxis) {
			state.panel.$gutterYaxis.empty();
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
			state.panel.$syncGrid &&
			state.panel.$syncGrid.length &&
			state.panel.$gutterChrome &&
			state.panel.$gutterChrome.length &&
			state.panel.$syncGrid.attr("data-pwr-layout") === CHART_LAYOUT_VERSION &&
			state.panel.$viewport &&
			state.panel.$viewport.length &&
			state.panel.$gutterYaxis &&
			state.panel.$gutterYaxis.length &&
			state.panel.$root.closest("body").length &&
			state.panel.$root.next().get(0) === $anchor.get(0)
		) {
			return state.panel;
		}

		disposeChartState(state);
		removeChartRootsNear($anchor);
		state._controlsReady = false;
		state.loadedContextKey = "";

		const $root = $('<div class="pwr-workload-charts-root"></div>');
		$anchor.before($root);
		const panel = DinextCharts.createPanel($root, {
			title,
			collapsed: false,
			height: CHART_HEIGHT,
			layout: "ag-grid-aligned",
		});
		panel.$root = $root;
		panel.$syncGrid.attr("data-pwr-layout", CHART_LAYOUT_VERSION);
		state.panel = panel;
		applyChartHeights(panel);
		return panel;
	}

	function ensurePanelControls(panel, state, reloadFn, options) {
		if (state._controlsReady) {
			return;
		}
		panel.$gutterFilters.empty();
		if (panel.$gutterHead && panel.$gutterHead.length) {
			panel.$gutterHead.remove();
		}

		const $filters = $('<div class="pwr-chart-filters"></div>').appendTo(panel.$gutterFilters);
		const workerTypeLabel = __("Worker type");
		const allWorkersLabel = __("All");

		const $workerField = $(`
			<div class="pwr-chart-filter-field">
				<label class="pwr-chart-filter-label">${frappe.utils.escape_html(workerTypeLabel)}</label>
				<select class="form-control input-xs pwr-chart-worker-wtype" title="${frappe.utils.escape_html(
					workerTypeLabel
				)}">
					<option value="">${frappe.utils.escape_html(allWorkersLabel)}</option>
					<option value="Employee">${frappe.utils.escape_html(__("Employee"))}</option>
					<option value="Supplier">${frappe.utils.escape_html(__("Supplier"))}</option>
				</select>
			</div>
		`).appendTo($filters);

		const $workerSelect = $workerField.find(".pwr-chart-worker-wtype");
		$workerSelect.val(state.workerWtype || "");
		$workerSelect.on("change", () => {
			state.workerWtype = $workerSelect.val() || "";
			reloadFn();
		});

		if (options.showUtilizationButton) {
			const utilizationLabel = __("Load utilization");
			$(
				`<div class="pwr-chart-filter-field pwr-chart-filter-field--action">
					<button type="button" class="btn btn-xs btn-default pwr-chart-utilization-btn" title="${frappe.utils.escape_html(
						utilizationLabel
					)}">${frappe.utils.escape_html(__("Util."))}</button>
				</div>`
			)
				.appendTo($filters)
				.find(".pwr-chart-utilization-btn")
				.on("click", () => {
					state.loadUtilization = true;
					reloadFn();
				});
		}
		state._controlsReady = true;
	}

	function findAgGridElements($wrapper, extraClass) {
		const $grid = $wrapper.find(`.${extraClass}`).first();
		if (!$grid.length) {
			return null;
		}
		let $pinned = $grid.find(".ag-pinned-left-cols-container").first();
		if (!$pinned.length) {
			$pinned = $grid.find(".ag-pinned-left-header").first();
		}
		const $centerViewport = $grid.find(".ag-center-cols-viewport").first();
		const $centerContainer = $grid.find(".ag-center-cols-container").first();
		return { $grid, $pinned, $centerViewport, $centerContainer };
	}

	function bindAgGridChartLayout(panel, $wrapper, extraClass, state, frm) {
		if (state.layoutCleanup) {
			state.layoutCleanup();
			state.layoutCleanup = null;
		}

		const elements = findAgGridElements($wrapper, extraClass);
		if (!elements || !elements.$centerViewport.length) {
			return;
		}

		const { $pinned, $centerViewport, $centerContainer } = elements;
		const gridTable = getWorkloadGridTable(frm);
		const $syncGrid = panel.$syncGrid;
		const $viewport = panel.$viewport;
		const $track = panel.$chartTrack;
		const $chartEl = panel.$chartEl;
		if (!$syncGrid || !$viewport || !$track || !$chartEl) {
			return;
		}
		applyChartHeights(panel);

		let layoutTimer = null;
		const applyLayout = () => {
			const gutterW = measurePinnedGutterWidth(gridTable, $pinned);
			const viewportW = Math.round($centerViewport.outerWidth() || 0);
			const scrollW = measureGridPeriodAreaWidth(
				gridTable,
				$centerContainer,
				$centerViewport
			);
			if (!gutterW || !scrollW) {
				return;
			}
			const scrollLeft = $centerViewport.scrollLeft() || 0;
			const filtersW = Math.max(0, gutterW - Y_AXIS_GUTTER_PX);

			if (gutterW > 0) {
				$syncGrid.css({
					gridTemplateColumns: `${filtersW}px ${Y_AXIS_GUTTER_PX}px minmax(0, 1fr)`,
				});
				if (panel.$root && panel.$root.length) {
					panel.$root.css("--pwr-yaxis-gutter-width", `${Y_AXIS_GUTTER_PX}px`);
				}
			}
			if (viewportW > 0) {
				$viewport.css({ maxWidth: viewportW });
			}
			const chartSynced = isChartLayoutSynced(frm, state, gridTable);
			const chartPeriods =
				getChartCategoryCount(state) || state.loadedPeriodCount || 0;
			const chartW = chartSynced
				? scrollW
				: computeChartCanvasWidth(
						chartPeriods,
						gridTable,
						$centerContainer,
						$centerViewport,
						viewportW
					);
			const trackW = Math.max(scrollW || 0, chartW || 0);
			if (trackW > 0) {
				$track.css({ width: trackW });
			}
			if (chartW > 0) {
				$chartEl.css({ width: chartW, height: CHART_HEIGHT });
			}
			$track.css("transform", `translate3d(${-scrollLeft}px, 0, 0)`);

			if (state.chart && !state.chart.isDisposed() && chartW > 0) {
				state.chart.resize({ width: chartW, height: CHART_HEIGHT_PX });
				if (chartSynced) {
					syncYAxisGutterLabels(state.chart, panel, __("Hours"));
				}
			}
		};

		const scheduleLayout = () => {
			clearTimeout(layoutTimer);
			layoutTimer = setTimeout(applyLayout, 16);
		};

		const onScroll = () => {
			const scrollLeft = $centerViewport.scrollLeft() || 0;
			$track.css("transform", `translate3d(${-scrollLeft}px, 0, 0)`);
		};

		const onChartWheel = (e) => {
			const viewportEl = $centerViewport.get(0);
			if (!viewportEl || viewportEl.scrollWidth <= viewportEl.clientWidth) {
				return;
			}
			let delta = e.deltaX;
			if (!delta && e.shiftKey) {
				delta = e.deltaY;
			}
			if (!delta && e.deltaY) {
				delta = e.deltaY;
			}
			if (!delta) {
				return;
			}
			viewportEl.scrollLeft += delta;
			e.preventDefault();
		};

		$centerViewport.on("scroll.pwr-chart-layout", onScroll);
		const wheelCleanup = attachWheelSync(collectChartWheelTargets(panel, state), onChartWheel);

		const gridApi = gridTable && gridTable.api;
		const gridListeners = [];
		if (gridApi && typeof gridApi.addEventListener === "function") {
			const onGridLayout = () => scheduleLayout();
			["firstDataRendered", "gridColumnsChanged", "columnResized"].forEach((eventName) => {
				gridApi.addEventListener(eventName, onGridLayout);
				gridListeners.push({ eventName, handler: onGridLayout });
			});
		}

		const observers = [];
		if (window.ResizeObserver) {
			[$pinned.get(0), $centerViewport.get(0), $centerContainer.get(0)].forEach((el) => {
				if (!el) {
					return;
				}
				const ro = new ResizeObserver(scheduleLayout);
				ro.observe(el);
				observers.push(ro);
			});
		}

		applyLayout();
		requestAnimationFrame(applyLayout);

		state.layoutCleanup = () => {
			clearTimeout(layoutTimer);
			$centerViewport.off("scroll.pwr-chart-layout");
			wheelCleanup();
			gridListeners.forEach(({ eventName, handler }) => {
				if (gridApi && typeof gridApi.removeEventListener === "function") {
					gridApi.removeEventListener(eventName, handler);
				}
			});
			observers.forEach((ro) => ro.disconnect());
		};
	}

	function renderChart(panel, option, $wrapper, extraClass, state, frm, contextKey, token) {
		if (!isChartRenderCurrent(state, token)) {
			return Promise.resolve();
		}

		return DinextCharts.load().then(() => {
			if (!isChartRenderCurrent(state, token)) {
				return Promise.resolve();
			}
			return new Promise((resolve) => {
					waitForVisibleContainer(panel.$viewport || panel.$chartEl, () => {
						if (!isChartRenderCurrent(state, token)) {
							resolve();
							return;
						}
						panel.$chartEl.empty();
						const periodCount = (
							(option.xAxis && option.xAxis[0] && option.xAxis[0].data) ||
							[]
						).length;
						const gridTable = getWorkloadGridTable(frm);
						const elements = findAgGridElements($wrapper, extraClass);
						const viewportW =
							Math.round((panel.$viewport && panel.$viewport.outerWidth()) || 0) ||
							320;
						const mountW = computeChartCanvasWidth(
							periodCount,
							gridTable,
							elements && elements.$centerContainer,
							elements && elements.$centerViewport,
							viewportW
						);
						if (panel.$chartTrack && panel.$chartTrack.length) {
							const scrollW = elements
								? measureGridPeriodAreaWidth(
										gridTable,
										elements.$centerContainer,
										elements.$centerViewport
									)
								: 0;
							panel.$chartTrack.css({ width: Math.max(scrollW || 0, mountW) });
						}
						panel.$chartEl.css({ width: mountW, height: CHART_HEIGHT });
						state.chart = DinextCharts.mount(panel.$chartEl, option);
						state.loadedPeriodCount = periodCount;
						state.resizeCleanup = DinextCharts.bindResize(state.chart, panel.$chartEl);
						state.loadedContextKey = contextKey;

						const yAxisName = __("Hours");
						const syncYAxis = () => {
							syncYAxisGutterLabels(state.chart, panel, yAxisName);
						};
						state._yAxisSyncHandler = syncYAxis;
						state.chart.on("finished", syncYAxis);

						bindAgGridChartLayout(panel, $wrapper, extraClass, state, frm);
						syncYAxis();
						triggerWorkloadLayout(frm);
						resolve();
					});
				});
		});
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

	function fetchTeamChartData(frm, state, panel, $section, token, contextKey) {
		const { viewType, periodRange } = parseTeamChartContext(contextKey);
		showChartLoading(panel);

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
					state,
					frm,
					contextKey,
					token
				);
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
	}

	function fetchProjectChartData(frm, state, panel, $wrapper, token, contextKey) {
		const viewType = getProjectViewType();
		const { from, to } = getProjectDateRange();
		showChartLoading(panel);

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
					state,
					frm,
					contextKey,
					token
				);
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
	}

	function executeTeamChartReload(frm, state) {
		const contextKey = getChartContextKey(frm, state);
		const token = ++state.loadToken;
		invalidateChartForReload(state);
		if (state.panel) {
			showChartLoading(state.panel);
		}
		const $section = getTeamFieldWrapper(frm);
		if (!$section.length) {
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
				const $anchor = getChartMountAnchor($table);
				const panel = ensureChartPanel($anchor, state, __("Team workload summary"));
				ensurePanelControls(panel, state, () => requestTeamChartReload(frm), {
					showUtilizationButton: true,
				});
				ensureChartVisibilityToggle(frm, state);
				applyChartHeights(panel);
				showChartLoading(panel);
				fetchTeamChartData(frm, state, panel, $section, token, contextKey);
			});
		});
	}

	function executeProjectChartReload(frm, state) {
		if (!isProjectWorkloadVisible(frm)) {
			return;
		}

		const contextKey = getChartContextKey(frm, state);
		const token = ++state.loadToken;
		invalidateChartForReload(state);
		if (state.panel) {
			showChartLoading(state.panel);
		}
		const field = frm.get_field("custom_workload");
		if (!field || !field.$wrapper) {
			return;
		}
		const $wrapper = field.$wrapper;

		const startLoad = ($anchor) => {
			if (token !== state.loadToken) {
				return;
			}
			DinextCharts.load().then(() => {
				if (token !== state.loadToken) {
					return;
				}
				const $mountAnchor = getChartMountAnchor($anchor);
				const panel = ensureChartPanel($mountAnchor, state, __("Project workload summary"));
				ensurePanelControls(panel, state, () => requestProjectChartReload(frm), {
					showUtilizationButton: false,
				});
				ensureChartVisibilityToggle(frm, state);
				applyChartHeights(panel);
				showChartLoading(panel);
				fetchProjectChartData(frm, state, panel, $wrapper, token, contextKey);
			});
		};

		waitForTable(
			$wrapper,
			".project-workload-table",
			($table) => startLoad($table),
			() => {
				const $container = $wrapper.find(".project_workload_container").first();
				startLoad($container.length ? $container : $wrapper);
			}
		);
	}

	function requestTeamChartReload(frm) {
		const state = ensureState(frm);
		const nextContextKey = getChartContextKey(frm, state);
		if (!state.loadedContextKey || state.loadedContextKey !== nextContextKey) {
			resetChartPanel(state);
		}
		clearTimeout(state._reloadTimer);
		state._reloadTimer = setTimeout(() => {
			executeTeamChartReload(frm, state);
		}, RELOAD_DEBOUNCE_MS);
	}

	function requestProjectChartReload(frm) {
		const state = ensureState(frm);
		const nextContextKey = getChartContextKey(frm, state);
		if (!state.loadedContextKey || state.loadedContextKey !== nextContextKey) {
			resetChartPanel(state);
		}
		clearTimeout(state._reloadTimer);
		state._reloadTimer = setTimeout(() => {
			executeProjectChartReload(frm, state);
		}, RELOAD_DEBOUNCE_MS);
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

	function registerChartHandlers() {
		if (project_workload_assignment.charts._pwrHandlersRegistered) {
			return;
		}
		project_workload_assignment.charts._pwrHandlersRegistered = true;

		$(window).on(
			"resize.pwr-workload-grid",
			frappe.utils.debounce(() => {
				if (
					cur_frm &&
					(cur_frm.doctype === "Projects Workload Report" ||
						cur_frm.doctype === "Project")
				) {
					syncWorkloadGridViewportHeight(cur_frm);
				}
			}, 150)
		);

		$(document).on("click.pwr-chart-visibility", ".pwr-chart-visibility-toggle", function () {
			const frm = resolveActiveWorkloadFrm(cur_frm);
			if (
				!frm ||
				(frm.doctype !== "Projects Workload Report" && frm.doctype !== "Project")
			) {
				return;
			}
			const state = ensureState(frm);
			state.$visibilityToggle = $(this);
			setChartVisible(frm, state, state.chartVisible === false);
		});

		frappe.ui.form.on("Projects Workload Report", {
			onload(frm) {
				installProjectsWorkloadViewportHeight();
			},
			refresh(frm) {
				installProjectsWorkloadViewportHeight();
				requestAnimationFrame(() => {
					syncProjectsWorkloadGridViewportHeight(frm);
				});
			},
		});

		frappe.ui.form.on("Project", {
			refresh(frm) {
				if (isProjectWorkloadVisible(frm)) {
					requestAnimationFrame(() => {
						syncProjectWorkloadGridViewportHeight(frm);
					});
				}
			},
			custom_загрузка(frm) {
				requestProjectChartReload(frm);
			},
		});

		$(document).on(
			"shown.bs.tab",
			'[data-fieldname="custom_загрузка"], a[data-fieldname="custom_загрузка"]',
			function () {
				if (cur_frm && cur_frm.doctype === "Project") {
					requestProjectChartReload(cur_frm);
				}
			}
		);

		$(document).on("pwr-workload-chart-reload", (_e, frm) => {
			if (!frm || !frm.doctype) {
				return;
			}
			if (frm.doctype === "Projects Workload Report") {
				requestTeamChartReload(frm);
			} else if (frm.doctype === "Project" && isProjectWorkloadVisible(frm)) {
				requestProjectChartReload(frm);
			}
		});
	}

	project_workload_assignment.charts.boot = function () {
		installProjectsWorkloadViewportHeight();
		registerChartHandlers();
	};
	project_workload_assignment.charts.syncGridViewportHeight =
		syncWorkloadGridViewportHeight;
	project_workload_assignment.charts.getOccupiedHeight = getChartOccupiedHeight;
})();
