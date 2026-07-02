/* ISS-2026-00002: бизнес-логика сводных графиков PWR / Project Workload. */
frappe.provide("project_workload_assignment.charts");

(function () {
	const TEAM_API =
		"project_workload_assignment.project_workload_api.pwr_run_team_workload_charts";
	const PROJECT_API =
		"project_workload_assignment.project_workload_api.pwr_run_project_workload_charts";

	const CHART_LAYOUT_VERSION = "filters-above-chart-v2";
	const Y_AXIS_GUTTER_PX = 50;
	const DEFAULT_PARTICIPANT_GUTTER_PX = 220;
	const RELOAD_DEBOUNCE_MS = 80;
	const TABLE_WAIT_MS = 300;
	const TABLE_WAIT_ATTEMPTS = 40;
	const CONTAINER_WAIT_MS = 50;
	const CONTAINER_WAIT_ATTEMPTS = 40;
	const LEGEND_BAND_PX = 36;
	const stateByForm = new WeakMap();
	const CHART_DATA_HEIGHT_PX = 200;
	const CHART_PLOT_HEIGHT_PX = CHART_DATA_HEIGHT_PX;
	const CHART_TOTAL_HEIGHT_PX = CHART_DATA_HEIGHT_PX + LEGEND_BAND_PX;
	const CHART_HEIGHT = `${CHART_TOTAL_HEIGHT_PX}px`;
	const CHART_PLOT_HEIGHT = `${CHART_PLOT_HEIGHT_PX}px`;
	const TEAM_WORKLOAD_GRID_MIN_HEIGHT_PX = 720;
	const PROJECT_WORKLOAD_GRID_MIN_HEIGHT_PX = 480;
	let pwrChartThemeObserver = null;

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
		return readPwrGlobal("pwrViewType", readPwrGlobal("currentViewType", "weekly"));
	}

	function getTeamPeriodRange() {
		return readPwrGlobal("currentPeriodRange", "quarter");
	}

	function getProjectViewType() {
		return readPwrGlobal(
			"projectWorkloadViewType",
			readPwrGlobal("currentViewType", "daily")
		);
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

	function getPeriodRangeMonths() {
		const periodRange = readPwrGlobal("currentPeriodRange", "quarter");
		if (periodRange === "half_year") {
			return 6;
		}
		if (periodRange === "year") {
			return 12;
		}
		return 3;
	}

	function resetTeamPeriodAnchorToToday() {
		const today = frappe.datetime.get_today();
		setTeamPeriodAnchor(today);
		return today;
	}

	function getTeamPeriodAnchor() {
		const anchor = readPwrGlobal("pwrPeriodAnchorDate", null);
		if (anchor) {
			return anchor;
		}
		return resetTeamPeriodAnchorToToday();
	}

	function setTeamPeriodAnchor(dateStr) {
		window.pwrPeriodAnchorDate = dateStr;
	}

	function getWorkerWtype(state) {
		if (typeof window !== "undefined" && window.pwrWorkerWtype != null) {
			return window.pwrWorkerWtype || "";
		}
		return (state && state.workerWtype) || "";
	}

	function setWorkerWtype(frm, value) {
		frm = resolveActiveWorkloadFrm(frm);
		window.pwrWorkerWtype = value || "";
		const state = ensureState(frm);
		state.workerWtype = window.pwrWorkerWtype;
		if (frm.doctype === "Projects Workload Report") {
			requestTeamChartReload(frm);
			debouncedReloadTeamWorkloadTable(frm);
			return;
		}
		if (frm.doctype === "Project") {
			requestProjectChartReload(frm);
			if (typeof window.debouncedLoadProjectWorkloadData === "function") {
				window.debouncedLoadProjectWorkloadData(frm, true, true);
			}
		}
	}

	function debouncedReloadTeamWorkloadTable(frm) {
		if (typeof window.debouncedLoadProjectsWorkloadData === "function") {
			window.debouncedLoadProjectsWorkloadData(frm, true, {
				loadActual: isShowFactEnabled() ? 1 : 0,
				workerWtype: window.pwrWorkerWtype || "",
			});
		} else {
			$(document).trigger("pwr-workload-data-reload", [frm, { showFact: isShowFactEnabled() }]);
		}
	}

	function isPwrChartDarkTheme() {
		const theme = document.documentElement.getAttribute("data-theme");
		if (theme === "dark" || theme === "light") {
			return theme === "dark";
		}
		const mode = document.documentElement.getAttribute("data-theme-mode");
		if (mode === "dark") {
			return true;
		}
		if (mode === "light") {
			return false;
		}
		return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
	}

	function getPwrChartThemeColors() {
		const rootStyle = getComputedStyle(document.documentElement);
		const fallbackText = isPwrChartDarkTheme() ? "#e2e2e2" : "#333333";
		const fallbackMuted = isPwrChartDarkTheme() ? "#a0a0a0" : "#748094";
		const fallbackBorder = isPwrChartDarkTheme() ? "#3a3a3a" : "#d1d8dd";
		const fallbackBg = isPwrChartDarkTheme() ? "#1e1e1e" : "#ffffff";

		return {
			text: rootStyle.getPropertyValue("--text-color").trim() || fallbackText,
			muted: rootStyle.getPropertyValue("--text-muted").trim() || fallbackMuted,
			border: rootStyle.getPropertyValue("--border-color").trim() || fallbackBorder,
			bg: rootStyle.getPropertyValue("--card-bg").trim() || fallbackBg,
		};
	}

	function getCurrentPeriodIndex(periods, viewType) {
		if (!periods?.length || !frappe.datetime?.get_today || !frappe.datetime?.str_to_obj) {
			return -1;
		}
		const today = frappe.datetime.str_to_obj(frappe.datetime.get_today());
		for (let i = 0; i < periods.length; i += 1) {
			const period = periods[i];
			if (viewType === "daily") {
				if (period.date === frappe.datetime.get_today()) {
					return i;
				}
				continue;
			}
			if (viewType === "weekly") {
				const start = frappe.datetime.str_to_obj(period.start_date);
				const end = frappe.datetime.str_to_obj(period.end_date);
				if (today >= start && today <= end) {
					return i;
				}
				continue;
			}
			if (
				period.year === today.getFullYear() &&
				Number(period.month) === today.getMonth() + 1
			) {
				return i;
			}
		}
		return -1;
	}

	function buildCurrentPeriodMarkLine(periods, viewType, labels, themeColors) {
		const index = getCurrentPeriodIndex(periods, viewType);
		if (index < 0) {
			return null;
		}
		return {
			silent: true,
			symbol: ["none", "none"],
			lineStyle: {
				color: themeColors.text,
				width: 1,
				type: "solid",
				opacity: 0.55,
			},
			label: {
				show: true,
				formatter: labels[index] || "",
				color: themeColors.text,
				fontSize: 10,
				position: "end",
			},
			data: [{ xAxis: index }],
		};
	}

	function isShowFactEnabled(state) {
		if (typeof window !== "undefined" && window.pwrShowFact != null) {
			return !!window.pwrShowFact;
		}
		return !!(state && state.showFact);
	}

	function syncShowFactGlobal(state) {
		window.pwrShowFact = isShowFactEnabled(state);
	}

	function syncGlobalsFromState(state) {
		syncShowFactGlobal(state);
		window.pwrPeriodAnchorDate = getTeamPeriodAnchor();
	}

	function syncStateFromGlobals(state) {
		state.showFact = !!readPwrGlobal("pwrShowFact", false);
		state.loadUtilization = !!readPwrGlobal("pwrLoadUtilization", false);
		if (typeof window !== "undefined" && window.pwrWorkerWtype != null) {
			state.workerWtype = window.pwrWorkerWtype || "";
		}
	}

	function sumSeries(a, b) {
		const left = a || [];
		const right = b || [];
		const len = Math.max(left.length, right.length);
		const out = [];
		for (let i = 0; i < len; i += 1) {
			out.push((parseFloat(left[i]) || 0) + (parseFloat(right[i]) || 0));
		}
		return out;
	}

	function formatPeriodAnchorLabel(frm) {
		if (frm.doctype === "Projects Workload Report") {
			return frappe.datetime.str_to_user(getTeamPeriodAnchor());
		}
		const { from, to } = getProjectDateRange();
		return `${frappe.datetime.str_to_user(from)} — ${frappe.datetime.str_to_user(to)}`;
	}

	function shiftWorkloadPeriod(frm, deltaSteps) {
		if (!frm) {
			return;
		}
		const state = ensureState(frm);
		state._controlsReady = false;
		const shiftMonths = deltaSteps || 0;
		if (!shiftMonths) {
			return;
		}

		if (frm.doctype === "Projects Workload Report") {
			setTeamPeriodAnchor(
				frappe.datetime.add_months(getTeamPeriodAnchor(), shiftMonths)
			);
		} else {
			const { from, to } = getProjectDateRange();
			window.displayDateFrom = frappe.datetime.add_months(from, shiftMonths);
			window.displayDateTo = frappe.datetime.add_months(to, shiftMonths);
			if (typeof displayDateFrom !== "undefined") {
				displayDateFrom = window.displayDateFrom;
			}
			if (typeof displayDateTo !== "undefined") {
				displayDateTo = window.displayDateTo;
			}
		}
		triggerWorkloadDataReload(frm);
	}

	function setShowFact(frm, value) {
		frm = resolveActiveWorkloadFrm(frm);
		window.pwrShowFact = !!value;
		document.querySelectorAll(".projects-workload-ag-grid").forEach(el => {
			el.classList.toggle("projects-workload-ag-grid--show-fact", !!value);
		});
		const state = ensureState(frm);
		state.showFact = !!value;
		const dt = frm && frm.projects_workload_dt;
		if (dt && typeof dt.schedulePeriodCellRefresh === "function") {
			dt.schedulePeriodCellRefresh();
		}
		triggerShowFactReload(frm, state);
	}

	function setLoadUtilization(frm, value) {
		frm = resolveActiveWorkloadFrm(frm);
		window.pwrLoadUtilization = !!value;
		const state = ensureState(frm);
		state.loadUtilization = !!value;
		triggerWorkloadDataReload(frm);
	}

	function getLoadUtilization(frm) {
		const state = frm ? ensureState(frm) : null;
		if (state) {
			return !!state.loadUtilization;
		}
		return !!readPwrGlobal("pwrLoadUtilization", false);
	}

	function getShowFact(frm) {
		return isShowFactEnabled(frm ? ensureState(frm) : null);
	}

	function triggerWorkloadDataReload(frm) {
		frm = resolveActiveWorkloadFrm(frm);
		if (!frm) {
			return;
		}
		const state = ensureState(frm);
		syncStateFromGlobals(state);
		syncGlobalsFromState(state);
		const reloadMeta = {
			showFact: isShowFactEnabled(state),
		};
		if (frm.doctype === "Projects Workload Report") {
			reloadMeta.periodAnchor = getTeamPeriodAnchor();
			reloadMeta.periodRangeMonths = getPeriodRangeMonths();
		} else {
			const { from, to } = getProjectDateRange();
			reloadMeta.periodAnchor = from;
			reloadMeta.periodAnchorTo = to;
		}
		$(document).trigger("pwr-workload-data-reload", [frm, reloadMeta]);

		if (frm.doctype === "Projects Workload Report") {
			requestTeamChartReload(frm);
			return;
		}
		requestProjectChartReload(frm);
	}

	function triggerShowFactReload(frm, state) {
		syncShowFactGlobal(state);
		triggerWorkloadDataReload(frm);
	}

	function getChartContextKey(frm, state) {
		if (!frm) {
			return "";
		}
		if (frm.doctype === "Projects Workload Report") {
			return [
				getTeamViewType(),
				getTeamPeriodRange(),
				getTeamPeriodAnchor(),
				getWorkerWtype(state),
				state.loadUtilization ? "1" : "0",
				isShowFactEnabled(state) ? "1" : "0",
				frm.doc.user || "",
				frm.doc.project || "",
				frm.doc.project_portfolio || "",
				frm.doc.user_group || "",
			].join("|");
		}
		const { from, to } = getProjectDateRange();
		return [
			getProjectViewType(),
			from,
			to,
			getWorkerWtype(state),
			state.loadUtilization ? "1" : "0",
			isShowFactEnabled(state) ? "1" : "0",
		].join("|");
	}

	function parseTeamChartContext(contextKey) {
		const parts = String(contextKey).split("|");
		return {
			viewType: parts[0],
			periodRange: parts[1],
			periodAnchor: parts[2],
		};
	}

	function applyChartHeights(panel) {
		if (!panel) {
			return;
		}
		const totalHeightVar = CHART_HEIGHT;
		const plotHeightVar = CHART_PLOT_HEIGHT;
		if (panel.$root && panel.$root.length) {
			panel.$root.css("--pwr-chart-plot-height", plotHeightVar);
			panel.$root.css("--pwr-chart-total-height", totalHeightVar);
		}
		if (panel.$syncGrid && panel.$syncGrid.length) {
			panel.$syncGrid.css("--pwr-chart-plot-height", plotHeightVar);
			panel.$syncGrid.css("--pwr-chart-total-height", totalHeightVar);
		}
		if (panel.$viewport && panel.$viewport.length) {
			panel.$viewport.css({ height: totalHeightVar, maxHeight: totalHeightVar });
		}
		if (panel.$gutterYaxis && panel.$gutterYaxis.length) {
			panel.$gutterYaxis.css({
				height: plotHeightVar,
				minHeight: plotHeightVar,
				maxHeight: plotHeightVar,
				alignSelf: "end",
			});
		}
		if (panel.$chartTrack && panel.$chartTrack.length) {
			panel.$chartTrack.css({
				height: plotHeightVar,
				minHeight: plotHeightVar,
				maxHeight: plotHeightVar,
				flex: "1 1 auto",
			});
		}
		if (panel.$chartEl && panel.$chartEl.length) {
			panel.$chartEl.css({ height: plotHeightVar, minHeight: plotHeightVar });
		}
		if (panel.$body && panel.$body.length) {
			panel.$body.css({ minHeight: totalHeightVar });
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
		return $chart.outerHeight(true) || CHART_TOTAL_HEIGHT_PX;
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

	function computeWorkloadGridHeight(gridTop, minHeightPx) {
		const available = window.innerHeight - gridTop - 16;
		return Math.max(minHeightPx, available);
	}

	function applyGridSlotHeight(frm, $gridRoot, $gridSlot, gridHeight, isProjectGrid) {
		setElementBoxHeight($gridSlot, gridHeight);
		$gridRoot.find(".projects-workload-ag-grid, .project-workload-ag-grid").each(function () {
			const node = this;
			node.style.setProperty("height", `${gridHeight}px`, "important");
			node.style.setProperty("min-height", `${gridHeight}px`, "important");
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
		const gridHeight = computeWorkloadGridHeight(
			gridTop,
			TEAM_WORKLOAD_GRID_MIN_HEIGHT_PX
		);
		applyGridSlotHeight(frm, $gridRoot, $gridSlot, gridHeight, false);
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
		const gridHeight = computeWorkloadGridHeight(
			gridTop,
			PROJECT_WORKLOAD_GRID_MIN_HEIGHT_PX
		);
		applyGridSlotHeight(frm, $gridRoot, $gridSlot, gridHeight, true);
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

	function measurePinnedGutterWidth(gridTable, $pinned, $grid) {
		if (gridTable && gridTable.api && typeof gridTable.api.getColumn === "function") {
			const col = gridTable.api.getColumn("participant");
			if (col && typeof col.getActualWidth === "function") {
				const width = col.getActualWidth();
				if (Number.isFinite(width) && width > 0) {
					return Math.round(width);
				}
			}
		}
		if ($grid && $grid.length) {
			const $pinnedHeader = $grid.find(".ag-pinned-left-header").first();
			if ($pinnedHeader.length) {
				const headerW = Math.round($pinnedHeader.outerWidth() || 0);
				if (headerW > 0) {
					return headerW;
				}
			}
		}
		return Math.round($pinned.outerWidth() || 0);
	}

	function sumGridPeriodColumnWidths(gridTable) {
		if (!gridTable || !gridTable.api) {
			return 0;
		}
		const getColumns =
			gridTable.api.getAllGridColumns || gridTable.api.getColumns || null;
		if (!getColumns) {
			return 0;
		}
		const columns = getColumns.call(gridTable.api) || [];
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
		return count > 0 ? Math.round(total) : 0;
	}

	function measureGridPeriodAreaWidth(gridTable, $centerContainer, $centerViewport) {
		const containerEl = $centerContainer && $centerContainer.get(0);
		if (containerEl) {
			const containerW = Math.round(
				containerEl.getBoundingClientRect().width ||
					containerEl.offsetWidth ||
					containerEl.scrollWidth ||
					0
			);
			if (containerW > 0) {
				return containerW;
			}
		}

		const fromColumns = sumGridPeriodColumnWidths(gridTable);
		if (fromColumns > 0) {
			return fromColumns;
		}

		const viewportEl = $centerViewport && $centerViewport.get(0);
		if (
			viewportEl &&
			viewportEl.scrollWidth > viewportEl.clientWidth &&
			viewportEl.scrollWidth > 0
		) {
			return Math.round(viewportEl.scrollWidth);
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
		return Math.round(periods * colWidth);
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

	function formatChartLegendValue(value) {
		if (Array.isArray(value)) {
			const raw = value[value.length - 1];
			const n = Number(raw);
			return Number.isFinite(n) ? n.toFixed(1) : raw;
		}
		const n = Number(value);
		if (!Number.isFinite(n)) {
			return value;
		}
		return n.toFixed(1);
	}

	function buildAxisTooltip(themeColors) {
		const colors = themeColors || getPwrChartThemeColors();
		return {
			trigger: "axis",
			appendToBody: true,
			confine: false,
			backgroundColor: colors.bg,
			borderColor: colors.border,
			textStyle: { color: colors.text },
			formatter(params) {
				const items = Array.isArray(params) ? params : [params];
				if (!items.length) {
					return "";
				}
				const header = items[0].axisValueLabel || items[0].name || "";
				const lines = [header];
				items.forEach((item) => {
					const raw = Array.isArray(item.value)
						? item.value[item.value.length - 1]
						: item.value;
					if (raw == null || raw === "") {
						return;
					}
					const num = Number(raw);
					if (!Number.isFinite(num)) {
						return;
					}
					const marker = item.marker || "";
					lines.push(`${marker}${item.seriesName}: ${num.toFixed(1)}`);
				});
				return lines.length > 1 ? lines.join("<br/>") : header;
			},
		};
	}

	function buildChartLegend() {
		return { show: false };
	}

	function getSeriesLegendColor(series) {
		if (!series) {
			return "#888";
		}
		if (series.lineStyle && series.lineStyle.color) {
			return series.lineStyle.color;
		}
		if (series.itemStyle && series.itemStyle.color) {
			return series.itemStyle.color;
		}
		if (series.areaStyle && series.areaStyle.color) {
			return series.areaStyle.color;
		}
		return "#888";
	}

	function resolveLegendSwatchColor(series) {
		const color = getSeriesLegendColor(series);
		if (series && (series.type === "scatter" || series.pwrUtilizationForecast)) {
			return PWR_UTILIZATION_FORECAST_COLOR;
		}
		return color || "#888";
	}

	function ensureFixedLegendBar(panel) {
		if (!panel || !panel.$viewport || !panel.$viewport.length) {
			return null;
		}
		if (panel.$legendBar && panel.$legendBar.length) {
			return panel.$legendBar;
		}
		const $bar = $(
			'<div class="pwr-chart-legend-bar d-flex align-items-center flex-wrap px-2"></div>'
		).css({
			gap: "8px 16px",
			height: `${LEGEND_BAND_PX}px`,
			minHeight: `${LEGEND_BAND_PX}px`,
			maxHeight: `${LEGEND_BAND_PX}px`,
			boxSizing: "border-box",
			overflow: "hidden",
			background: "var(--ag-background-color, var(--bg-color))",
			zIndex: 3,
		});
		panel.$viewport.prepend($bar);
		panel.$legendBar = $bar;
		return $bar;
	}

	function buildLegendSwatchStyle(series) {
		const color = resolveLegendSwatchColor(series);
		const style = {
			display: "inline-block",
			width: "14px",
			height: "10px",
			minWidth: "14px",
			minHeight: "10px",
			borderRadius: "2px",
			flexShrink: 0,
			boxSizing: "border-box",
			backgroundColor: color,
		};
		if (series && series.type === "line") {
			style.height = "2px";
			style.minHeight = "2px";
			style.marginTop = "4px";
			style.marginBottom = "4px";
			style.borderRadius = "1px";
		}
		if (series && (series.type === "scatter" || series.pwrUtilizationForecast)) {
			style.width = "8px";
			style.height = "8px";
			style.minWidth = "8px";
			style.minHeight = "8px";
			style.borderRadius = "50%";
			style.border = `1px solid ${PWR_UTILIZATION_FORECAST_BORDER}`;
		}
		return style;
	}

	function updateFixedChartLegend(panel, option) {
		const $bar = ensureFixedLegendBar(panel);
		if (!$bar || !option) {
			return;
		}
		const items = (option.series || []).filter((series) => series && series.name);
		$bar.empty();
		if (!items.length) {
			return;
		}
		items.forEach((series) => {
			const $item = $('<span class="pwr-chart-legend-item d-inline-flex align-items-center flex-shrink-0 mr-3"></span>').css({
				gap: "6px",
				whiteSpace: "nowrap",
			});
			const $swatch = $('<span class="pwr-chart-legend-swatch"></span>').css(
				buildLegendSwatchStyle(series)
			);
			const $label = $('<span class="pwr-chart-legend-label"></span>')
				.text(series.name)
				.css({
					fontSize: "10px",
					lineHeight: "1.2",
					color: "var(--text-muted, #8d99a6)",
				});
			$item.append($swatch, $label);
			$bar.append($item);
		});
	}

	function buildSyncedGrid() {
		return {
			left: 0,
			right: 0,
			top: 8,
			bottom: 8,
			containLabel: false,
		};
	}

	function buildSyncedYAxis(themeColors) {
		const colors = themeColors || getPwrChartThemeColors();
		return {
			type: "value",
			axisLabel: { show: false },
			axisTick: { show: false },
			axisLine: { show: false },
			name: "",
			splitLine: {
				show: true,
				lineStyle: {
					color: colors.border,
					opacity: 0.4,
					width: 0.5,
				},
			},
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

	const PWR_FORECAST_COLORS = {
		Employee: "#d8b4fe",
		Supplier: "#a8d8ff",
	};

	const PWR_FACT_COLORS = {
		Employee: "#531dab",
		Supplier: "#003eb3",
	};

	// const PWR_BAR_BORDER_RADIUS = [3, 3, 0, 0];
	const PWR_FORECAST_BAR_WIDTH = "36%";
	const PWR_ACTUAL_BAR_WIDTH = "36%";

	const PWR_LINE_COLORS = {
		capacityLine: "#243660",
		capacityArea: "#243660",
		teamCapacityLine: "#243660",
		teamCapacityArea: "#243660",
		projectPlan: "#91cc75",
		utilizationPlan: "#5d4037",
	};

	const PWR_CAPACITY_LINE_OPACITY = 0.18;
	const PWR_CAPACITY_AREA_OPACITY = 0.28;

	const PWR_UTILIZATION_FORECAST_COLOR = "#c9a66b";
	const PWR_UTILIZATION_FORECAST_BORDER = "#a67c52";
	// fact bars z:6 — utilization series must render above them when «Показать факт» включён
	const PWR_Z_UTILIZATION_PLAN = 7;
	const PWR_Z_UTILIZATION_FORECAST = 8;

	function hideZeroChartValues(data) {
		return (data || []).map((value) => {
			const hours = Number(value);
			return Number.isFinite(hours) && hours > 0 ? hours : null;
		});
	}

	function normalizeWorkerWtypeFilter(workerWtypeFilter) {
		if (!workerWtypeFilter || workerWtypeFilter === "all") {
			return "all";
		}
		return workerWtypeFilter;
	}

	function isWtypeSeriesIncluded(wtype, workerWtypeFilter) {
		const filter = normalizeWorkerWtypeFilter(workerWtypeFilter);
		return filter === "all" || filter === wtype;
	}

	function filterWtypeSeriesData(data, wtype, workerWtypeFilter) {
		const rows = data || [];
		if (!isWtypeSeriesIncluded(wtype, workerWtypeFilter)) {
			return rows.map(() => null);
		}
		return hideZeroChartValues(rows);
	}

	function buildUtilizationForecastSeriesData(hours) {
		return (hours || []).map((value) => {
			const hoursValue = Number(value);
			return Number.isFinite(hoursValue) && hoursValue > 0 ? hoursValue : null;
		});
	}

	function buildUtilizationForecastSeries(hours) {
		// Line + symbols: axis tooltip и category xAxis (scatter [[idx,y]] их не показывает).
		return {
			name: __("Utilization forecast"),
			type: "line",
			z: PWR_Z_UTILIZATION_FORECAST,
			showSymbol: true,
			showAllSymbol: true,
			symbol: "circle",
			symbolSize: 8,
			lineStyle: { width: 0, opacity: 0 },
			itemStyle: {
				color: PWR_UTILIZATION_FORECAST_COLOR,
				opacity: 0.95,
				borderColor: PWR_UTILIZATION_FORECAST_BORDER,
				borderWidth: 1,
			},
			data: buildUtilizationForecastSeriesData(hours),
			pwrUtilizationForecast: true,
		};
	}

	function buildPwrLineSeries(config) {
		const lineColor = config.lineColor || config.color || PWR_LINE_COLORS.capacityLine;
		const areaColor = config.areaColor || config.color || lineColor;
		const lineOpacity = config.lineOpacity != null ? config.lineOpacity : 0.85;
		const areaOpacity = config.areaOpacity != null ? config.areaOpacity : 0.12;
		return {
			name: config.name,
			type: "line",
			smooth: true,
			showSymbol: false,
			z: config.z != null ? config.z : 1,
			itemStyle: { color: lineColor },
			lineStyle: {
				color: lineColor,
				opacity: lineOpacity,
				width: config.lineWidth != null ? config.lineWidth : 2,
			},
			areaStyle: { color: areaColor, opacity: areaOpacity },
			data: config.data || [],
		};
	}

	function buildWtypeForecastBarSeries(name, stackId, data, wtype) {
		const color = PWR_FORECAST_COLORS[wtype] || PWR_FORECAST_COLORS.Employee;
		return {
			name,
			type: "bar",
			stack: stackId,
			z: 3,
			barWidth: PWR_FORECAST_BAR_WIDTH,
			itemStyle: {
				color,
				opacity: 0.9,
				// borderRadius: PWR_BAR_BORDER_RADIUS,
			},
			emphasis: { focus: "series" },
			data: data || [],
		};
	}

	function buildWtypeActualBarSeries(name, stackId, data, wtype) {
		const color = PWR_FACT_COLORS[wtype] || PWR_FACT_COLORS.Employee;
		return {
			name,
			type: "bar",
			stack: stackId,
			z: 6,
			barWidth: PWR_ACTUAL_BAR_WIDTH,
			barGap: "-100%",
			itemStyle: {
				color,
				opacity: 1,
				// borderRadius: PWR_BAR_BORDER_RADIUS,
			},
			emphasis: { focus: "series" },
			data: data || [],
		};
	}

	function appendWtypeWorkloadBars(chartSeries, options) {
		const employee = options.employee;
		const supplier = options.supplier;
		const actualEmp = options.actualEmp;
		const actualSup = options.actualSup;
		const forecastStackId = options.forecastStackId;
		const workerWtypeFilter = options.workerWtypeFilter;
		const showFact = !!options.showFact;

		if (isWtypeSeriesIncluded("Employee", workerWtypeFilter)) {
			chartSeries.push(
				buildWtypeForecastBarSeries(
					__("Employee forecast"),
					forecastStackId,
					employee,
					"Employee"
				)
			);
			if (showFact) {
				chartSeries.push(
					buildWtypeActualBarSeries(
						__("Employee fact"),
						"actual",
						actualEmp,
						"Employee"
					)
				);
			}
		}
		if (isWtypeSeriesIncluded("Supplier", workerWtypeFilter)) {
			chartSeries.push(
				buildWtypeForecastBarSeries(
					__("Supplier forecast"),
					forecastStackId,
					supplier,
					"Supplier"
				)
			);
			if (showFact) {
				chartSeries.push(
					buildWtypeActualBarSeries(
						__("Supplier fact"),
						"actual",
						actualSup,
						"Supplier"
					)
				);
			}
		}
	}

	function buildChartAriaOptions() {
		return {
			enabled: true,
		};
	}

	function buildTeamChartOption(data, viewType) {
		const periods = data.periods || [];
		const series = data.series || {};
		const meta = data.meta || {};
		const workerWtypeFilter = meta.worker_wtype_filter || "all";
		const labels = periodLabels(periods, viewType);
		const themeColors = getPwrChartThemeColors();
		const employee = filterWtypeSeriesData(
			(series.workload_forecast_hours_by_wtype || {}).Employee,
			"Employee",
			workerWtypeFilter
		);
		const supplier = filterWtypeSeriesData(
			(series.workload_forecast_hours_by_wtype || {}).Supplier,
			"Supplier",
			workerWtypeFilter
		);
		const actualEmp = filterWtypeSeriesData(
			(series.actual_hours_by_wtype || {}).Employee,
			"Employee",
			workerWtypeFilter
		);
		const actualSup = filterWtypeSeriesData(
			(series.actual_hours_by_wtype || {}).Supplier,
			"Supplier",
			workerWtypeFilter
		);
		const showFact = !!meta.actual_loaded;
		const showUtilization = !!meta.utilization_loaded;
		// markLine временно отключён — согласование с архитектором (ISS-2026-00002).
		// const markLine = buildCurrentPeriodMarkLine(periods, viewType, labels, themeColors);

		const chartSeries = [
			buildPwrLineSeries({
				name: __("Capacity"),
				lineColor: PWR_LINE_COLORS.capacityLine,
				areaColor: PWR_LINE_COLORS.capacityArea,
				lineOpacity: PWR_CAPACITY_LINE_OPACITY,
				areaOpacity: PWR_CAPACITY_AREA_OPACITY,
				z: 1,
				data: series.capacity_hours || [],
			}),
		];
		appendWtypeWorkloadBars(chartSeries, {
			employee,
			supplier,
			actualEmp,
			actualSup,
			forecastStackId: "workload",
			workerWtypeFilter,
			showFact,
		});

		if (showUtilization) {
			chartSeries.splice(
				1,
				0,
				buildPwrLineSeries({
					name: __("Utilization plan"),
					color: PWR_LINE_COLORS.utilizationPlan,
					lineOpacity: 0.85,
					areaOpacity: 0.12,
					z: PWR_Z_UTILIZATION_PLAN,
					data: series.utilization_plan_hours || [],
				}),
				buildUtilizationForecastSeries(series.utilization_forecast_hours)
			);
		}

		// if (markLine) {
		// 	chartSeries[0].markLine = markLine;
		// }

		return {
			backgroundColor: "transparent",
			aria: buildChartAriaOptions(),
			tooltip: buildAxisTooltip(themeColors),
			legend: buildChartLegend(themeColors),
			grid: buildSyncedGrid(),
			xAxis: buildSyncedXAxis(labels),
			yAxis: buildSyncedYAxis(themeColors),
			series: chartSeries,
		};
	}

	function buildProjectChartOption(data, viewType) {
		const periods = data.periods || [];
		const series = data.series || {};
		const meta = data.meta || {};
		const workerWtypeFilter = meta.worker_wtype_filter || "all";
		const labels = periodLabels(periods, viewType);
		const themeColors = getPwrChartThemeColors();
		const forecastEmp = filterWtypeSeriesData(
			(series.workload_forecast_hours_by_wtype || {}).Employee,
			"Employee",
			workerWtypeFilter
		);
		const forecastSup = filterWtypeSeriesData(
			(series.workload_forecast_hours_by_wtype || {}).Supplier,
			"Supplier",
			workerWtypeFilter
		);
		const actualEmp = filterWtypeSeriesData(
			(series.actual_hours_by_wtype || {}).Employee,
			"Employee",
			workerWtypeFilter
		);
		const actualSup = filterWtypeSeriesData(
			(series.actual_hours_by_wtype || {}).Supplier,
			"Supplier",
			workerWtypeFilter
		);
		const showFact = !!meta.actual_loaded;
		const showUtilization = !!meta.utilization_loaded;
		// markLine временно отключён — согласование с архитектором (ISS-2026-00002).
		// const markLine = buildCurrentPeriodMarkLine(periods, viewType, labels, themeColors);

		const chartSeries = [
			buildPwrLineSeries({
				name: __("Team capacity"),
				lineColor: PWR_LINE_COLORS.teamCapacityLine,
				areaColor: PWR_LINE_COLORS.teamCapacityArea,
				lineOpacity: PWR_CAPACITY_LINE_OPACITY,
				areaOpacity: PWR_CAPACITY_AREA_OPACITY,
				z: 1,
				data: series.team_capacity_hours || [],
			}),
			buildPwrLineSeries({
				name: __("Project plan"),
				color: PWR_LINE_COLORS.projectPlan,
				lineOpacity: 0.85,
				areaOpacity: 0.15,
				z: 2,
				data: series.project_plan_hours || [],
			}),
		];
		appendWtypeWorkloadBars(chartSeries, {
			employee: forecastEmp,
			supplier: forecastSup,
			actualEmp,
			actualSup,
			forecastStackId: "forecast",
			workerWtypeFilter,
			showFact,
		});

		if (showUtilization) {
			chartSeries.splice(
				2,
				0,
				buildPwrLineSeries({
					name: __("Utilization plan"),
					color: PWR_LINE_COLORS.utilizationPlan,
					lineOpacity: 0.85,
					areaOpacity: 0.12,
					z: PWR_Z_UTILIZATION_PLAN,
					data: series.utilization_plan_hours || [],
				}),
				buildUtilizationForecastSeries(series.utilization_forecast_hours)
			);
		}

		// if (markLine) {
		// 	chartSeries[0].markLine = markLine;
		// }

		return {
			backgroundColor: "transparent",
			aria: buildChartAriaOptions(),
			tooltip: buildAxisTooltip(themeColors),
			legend: buildChartLegend(themeColors),
			grid: buildSyncedGrid(),
			xAxis: buildSyncedXAxis(labels),
			yAxis: buildSyncedYAxis(themeColors),
			series: chartSeries,
		};
	}

	function rebuildChartOptionFromState(state) {
		if (!state || !state._lastChartPayload) {
			return null;
		}
		const payload = state._lastChartPayload;
		if (payload.kind === "team") {
			return buildTeamChartOption(payload.data, payload.viewType);
		}
		if (payload.kind === "project") {
			return buildProjectChartOption(payload.data, payload.viewType);
		}
		return null;
	}

	function refreshActiveChartTheme() {
		const frm = resolveActiveWorkloadFrm(cur_frm);
		if (!frm) {
			return;
		}
		const state = stateByForm.get(frm);
		if (!state || !state.chart || state.chart.isDisposed()) {
			return;
		}
		const option = rebuildChartOptionFromState(state);
		if (!option) {
			return;
		}
		state.chart.setOption(option, true);
		if (state.panel) {
			updateFixedChartLegend(state.panel, option);
			syncYAxisGutterLabels(state.chart, state.panel, __("Hours"));
		}
		state.chart.resize();
	}

	function ensurePwrChartThemeObserver() {
		if (typeof MutationObserver === "undefined" || pwrChartThemeObserver) {
			return;
		}
		const root = document.documentElement;
		if (!root) {
			return;
		}
		let theme = root.getAttribute("data-theme");
		pwrChartThemeObserver = new MutationObserver(() => {
			const nextTheme = root.getAttribute("data-theme");
			if (nextTheme === theme) {
				return;
			}
			theme = nextTheme;
			refreshActiveChartTheme();
		});
		pwrChartThemeObserver.observe(root, {
			attributes: true,
			attributeFilter: ["data-theme", "data-theme-mode"],
		});
	}

	function ensureState(frm) {
		if (!stateByForm.has(frm)) {
			stateByForm.set(frm, {
				workerWtype: "",
				loadUtilization: false,
				showFact: !!readPwrGlobal("pwrShowFact", false),
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
		const state = stateByForm.get(frm);
		syncStateFromGlobals(state);
		return state;
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
			state.panel.$chartEl.css({ width: "100%", height: CHART_PLOT_HEIGHT });
		}
		state._lastChartPayload = null;
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
		if (state.panel && state.panel.$legendBar) {
			state.panel.$legendBar.empty();
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
		ensureFixedLegendBar(panel);
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

		if (options.showUtilizationToggle !== false) {
			const utilizationLabel = __("Add utilization");
			const $field = $(
				`<div class="pwr-chart-filter-field pwr-chart-utilization-field d-flex align-items-start flex-shrink-0 mt-1">
					<label class="d-flex align-items-center mb-0">
						<input type="checkbox" class="pwr-chart-utilization-checkbox" />
						<span>${frappe.utils.escape_html(utilizationLabel)}</span>
					</label>
				</div>`
			).appendTo($filters);
			$field
				.find(".pwr-chart-utilization-checkbox")
				.prop("checked", !!state.loadUtilization)
				.on("change", function () {
					const frm = (options && options.frm) || window.cur_frm;
					const checked = $(this).is(":checked");
					if (
						project_workload_assignment.charts &&
						typeof project_workload_assignment.charts.setLoadUtilization === "function"
					) {
						project_workload_assignment.charts.setLoadUtilization(frm, checked);
						return;
					}
					state.loadUtilization = checked;
					window.pwrLoadUtilization = checked;
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

		const { $pinned, $centerViewport, $centerContainer, $grid } = elements;
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
			let gutterW = measurePinnedGutterWidth(gridTable, $pinned, $grid);
			if (!gutterW && state._lastGutterWidth) {
				gutterW = state._lastGutterWidth;
			}
			if (!gutterW) {
				gutterW = DEFAULT_PARTICIPANT_GUTTER_PX;
			}
			state._lastGutterWidth = gutterW;

			const viewportW = Math.round($centerViewport.outerWidth() || 0);
			const scrollW = measureGridPeriodAreaWidth(
				gridTable,
				$centerContainer,
				$centerViewport
			);
			const scrollLeft = $centerViewport.scrollLeft() || 0;
			const filtersW = Math.max(0, gutterW - Y_AXIS_GUTTER_PX);

			$syncGrid.css({
				gridTemplateColumns: `${filtersW}px ${Y_AXIS_GUTTER_PX}px minmax(0, 1fr)`,
			});
			if (panel.$root && panel.$root.length) {
				panel.$root.css("--pwr-yaxis-gutter-width", `${Y_AXIS_GUTTER_PX}px`);
				panel.$root.css("--pwr-filters-gutter-width", `${filtersW}px`);
			}
			if (panel.$gutterChrome && panel.$gutterChrome.length) {
				panel.$gutterChrome.css({
					width: filtersW,
					maxWidth: filtersW,
					minWidth: filtersW,
				});
			}
			if (panel.$gutterFilters && panel.$gutterFilters.length) {
				panel.$gutterFilters.css({
					width: "100%",
					maxWidth: filtersW,
					minWidth: 0,
				});
			}
			if (viewportW > 0) {
				$viewport.css({ maxWidth: viewportW });
			}
			if (!scrollW) {
				return;
			}
			const chartSynced = isChartLayoutSynced(frm, state, gridTable);
			let chartW = scrollW;
			if (!chartSynced && state.loadedContextKey) {
				scheduleChartResync(frm, state);
			}
			if (!chartW) {
				const chartPeriods =
					getChartCategoryCount(state) || state.loadedPeriodCount || 0;
				chartW = computeChartCanvasWidth(
					chartPeriods,
					gridTable,
					$centerContainer,
					$centerViewport,
					viewportW
				);
			}
			const trackW = Math.max(scrollW || 0, chartW || 0);
			if (trackW > 0) {
				$track.css({ width: trackW });
			}
			if (chartW > 0) {
				$chartEl.css({ width: chartW, height: CHART_PLOT_HEIGHT });
			}
			$track.css("transform", `translate3d(${-scrollLeft}px, 0, 0)`);

			if (state.chart && !state.chart.isDisposed() && chartW > 0) {
				state.chart.resize({ width: chartW, height: CHART_PLOT_HEIGHT_PX });
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
			["firstDataRendered", "gridReady", "gridColumnsChanged", "columnResized", "modelUpdated"].forEach((eventName) => {
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

	function scheduleChartResync(frm, state) {
		if (!frm || !state) {
			return;
		}
		clearTimeout(state._resyncTimer);
		state._resyncTimer = setTimeout(() => {
			if (!isChartContextCurrent(frm, state)) {
				if (frm.doctype === "Projects Workload Report") {
					requestTeamChartReload(frm);
				} else if (frm.doctype === "Project") {
					requestProjectChartReload(frm);
				}
				return;
			}
			const gridTable = getWorkloadGridTable(frm);
			if (!isChartLayoutSynced(frm, state, gridTable)) {
				if (frm.doctype === "Projects Workload Report") {
					requestTeamChartReload(frm);
				} else if (frm.doctype === "Project") {
					requestProjectChartReload(frm);
				}
			}
		}, 200);
	}

	function renderChart(panel, option, $wrapper, extraClass, state, frm, contextKey, token, chartKind, chartPayload) {
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
						const scrollW = elements
							? measureGridPeriodAreaWidth(
									gridTable,
									elements.$centerContainer,
									elements.$centerViewport
								)
							: 0;
						const mountW =
							scrollW ||
							computeChartCanvasWidth(
								periodCount,
								gridTable,
								elements && elements.$centerContainer,
								elements && elements.$centerViewport,
								viewportW
							);
						if (panel.$chartTrack && panel.$chartTrack.length) {
							panel.$chartTrack.css({ width: Math.max(scrollW || 0, mountW) });
						}
						panel.$chartEl.css({ width: mountW, height: CHART_PLOT_HEIGHT });
						state.chart = DinextCharts.mount(panel.$chartEl, option);
						updateFixedChartLegend(panel, option);
						state.loadedPeriodCount = periodCount;
						state.resizeCleanup = null;
						state.loadedContextKey = contextKey;
						state._lastChartPayload = chartPayload || null;

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
		const { viewType, periodRange, periodAnchor } = parseTeamChartContext(contextKey);
		syncShowFactGlobal(state);
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
				period_anchor_date: periodAnchor || getTeamPeriodAnchor(),
				worker_wtype: getWorkerWtype(state),
				load_utilization: state.loadUtilization ? 1 : 0,
				load_actual: isShowFactEnabled(state) ? 1 : 0,
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
					token,
					"team",
					{ kind: "team", data, viewType }
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
		syncShowFactGlobal(state);
		showChartLoading(panel);

		frappe.call({
			method: PROJECT_API,
			args: {
				project: frm.doc.name,
				view_type: viewType,
				date_from: from,
				date_to: to,
				worker_wtype: getWorkerWtype(state),
				load_utilization: state.loadUtilization ? 1 : 0,
				load_actual: isShowFactEnabled(state) ? 1 : 0,
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
					token,
					"project",
					{ kind: "project", data, viewType }
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
					frm,
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
					frm,
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

	function handlePwrPageShow(event) {
		if (!event.persisted) {
			return;
		}
		const frm = resolveActiveWorkloadFrm(cur_frm);
		if (!frm) {
			return;
		}
		if (frm.doctype === "Projects Workload Report") {
			triggerWorkloadDataReload(frm);
			return;
		}
		if (frm.doctype === "Project" && isProjectWorkloadVisible(frm)) {
			requestProjectChartReload(frm);
		}
	}

	function registerChartHandlers() {
		if (project_workload_assignment.charts._pwrHandlersRegistered) {
			return;
		}
		project_workload_assignment.charts._pwrHandlersRegistered = true;
		ensurePwrChartThemeObserver();

		window.addEventListener("pageshow", handlePwrPageShow);

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
					const state = stateByForm.get(frm);
					if (state && !isChartContextCurrent(frm, state)) {
						requestTeamChartReload(frm);
					}
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
					requestAnimationFrame(() => {
						syncProjectWorkloadGridViewportHeight(cur_frm);
					});
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
	project_workload_assignment.charts.isShowFactEnabled = getShowFact;
	project_workload_assignment.charts.getShowFact = getShowFact;
	project_workload_assignment.charts.setShowFact = setShowFact;
	project_workload_assignment.charts.setLoadUtilization = setLoadUtilization;
	project_workload_assignment.charts.getLoadUtilization = getLoadUtilization;
	project_workload_assignment.charts.setWorkerWtype = setWorkerWtype;
	project_workload_assignment.charts.getWorkerWtype = getWorkerWtype;
	project_workload_assignment.charts.getPeriodAnchorLabel = formatPeriodAnchorLabel;
	project_workload_assignment.charts.formatPeriodAnchorLabel = formatPeriodAnchorLabel;
	project_workload_assignment.charts.syncGlobals = syncGlobalsFromState;
	project_workload_assignment.charts.getTeamPeriodAnchor = getTeamPeriodAnchor;
	project_workload_assignment.charts.shiftPeriod = shiftWorkloadPeriod;
	project_workload_assignment.charts.shiftWorkloadPeriod = shiftWorkloadPeriod;
	project_workload_assignment.charts.getPeriodRangeMonths = getPeriodRangeMonths;
	project_workload_assignment.charts.resetTeamPeriodAnchorToToday =
		resetTeamPeriodAnchorToToday;
	project_workload_assignment.charts.triggerWorkloadDataReload =
		triggerWorkloadDataReload;
})();
