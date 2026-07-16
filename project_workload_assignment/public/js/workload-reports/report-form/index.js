/**
 * In-place Form mount for DocType «Projects Workload Report».
 * Filters: DocType Links + toolbar extras inside WR root (fullscreen shell).
 * Table/charts: workload-reports v3.
 */

const DOCTYPE = "Projects Workload Report";
const FIELD = "projects_workload_report";
const MOUNT_MAX_ATTEMPTS = 60;
const MOUNT_RETRY_MS = 50;
/** Bump only when Form layout contract changes (forces one remount). */
const MOUNT_VERSION = "form-filters-in-root-2026-07-16e";

function _applySessionUserFilter(frm) {
	const shouldFilter = sessionStorage.getItem("workload_report_should_filter");
	if (shouldFilter !== "true") {
		return;
	}
	const userEmail = sessionStorage.getItem("workload_report_filter_user");
	sessionStorage.removeItem("workload_report_should_filter");
	sessionStorage.removeItem("workload_report_filter_user");
	if (!userEmail) {
		return;
	}
	frm.set_value("user", userEmail);
	frm.set_value("project", "");
	frm.set_value("project_portfolio", "");
	frm.set_value("user_group", "");
}

function _markFiltersSection(frm) {
	const { common } = project_workload_assignment.workloadReports;

	if (
		frm.wrapper?.querySelector?.(
			".workload-reports-root .wr-filter-form-link, .workload-reports-root [data-fieldname='user']"
		)
	) {
		return true;
	}

	const $section = common.getFormFiltersSection(frm);
	if (!$section.length) {
		return false;
	}
	const $formSection = $section.closest(".form-section");
	if (
		$formSection.find(`[data-fieldname="${FIELD}"], .workload-reports-root`).length
	) {
		console.error("[workload-reports.form] refuse to mark report section as filters");
		return false;
	}
	$formSection.addClass("projects-workload-filters-section");
	$section.find(".projects-workload-controls, .unified-filters-row").remove();
	return true;
}

function _applyFormLayout(frm) {
	if (!frm?.wrapper) return;
	const $root = $(frm.wrapper);

	$root.find(".projects-workload-filters-section").each(function () {
		const hasReport = !!this.querySelector(
			`[data-fieldname="${FIELD}"], .workload-reports-root`
		);
		if (hasReport) {
			$(this).removeClass("projects-workload-filters-section").show();
			return;
		}
		$(this).hide();
	});

	const $tableSection = $root.find('[data-fieldname="section_break_nyf1"]');
	if ($tableSection.length) {
		$tableSection.find(".section-head").hide();
		$tableSection
			.find(
				'.section-body, .form-column, [data-fieldname="projects_workload_report"]'
			)
			.css({
				padding: 0,
				margin: 0,
				width: "100%",
				maxWidth: "100%",
				boxSizing: "border-box",
			});
		$tableSection.closest(".form-section").show();
	}

	const field = frm.get_field(FIELD);
	if (field?.$wrapper?.length) {
		field.$wrapper.find(".control-label").hide();
		field.$wrapper
			.addClass("workload-reports-form-host")
			.removeClass("input-max-width")
			.css({ maxWidth: "none", width: "100%", paddingRight: 0 });
	}
}

function _stripLegacyGrid(frm) {
	if (frm.projects_workload_dt && typeof frm.projects_workload_dt.destroy === "function") {
		try {
			frm.projects_workload_dt.destroy();
		} catch (_e) {
			/* ignore */
		}
	}
	frm.projects_workload_dt = null;
	frm.projects_workload_table_initialized = false;
	frm.get_field(FIELD)?.$wrapper
		?.find(".projects-workload-ag-grid, .projects-workload-table")
		.remove();
}

function _reloadNow(frm) {
	const { common } = project_workload_assignment.workloadReports;
	const state = frm._wrForm;
	if (!state?.zones) return;

	const args = state.getArgs();
	const pageSize = common.PAGE_SIZE || 20;
	const _projectsArgs = (extra = {}) => ({
		...args,
		mode: "user_totals",
		limit: pageSize,
		offset: 0,
		...extra,
	});

	const tableDone = common.loadTable(
		state.zones.table,
		() => common.getProjectsData(_projectsArgs()),
		{
			viewType: args.view_type,
			showFact: !!args.load_actual,
			onExpandRow: state.expand.onExpandRow,
			resetExpand: state.expand.reset,
			hydrateExpanded: state.expand.hydrateExpanded,
			onLoadMore: ({ offset, limit }) =>
				common.getProjectsData(_projectsArgs({ offset, limit })),
		}
	);
	const chartsDone = common.scheduleChartsReload(state.zones.charts);
	void Promise.all([tableDone, chartsDone]).then(() => {
		common.realignCharts?.(state.zones.charts);
	});
}

/** Collapse duplicate refresh/bind mount into one data load. */
function _reload(frm) {
	if (!frm) return;
	if (frm._wrReloadTimer) {
		clearTimeout(frm._wrReloadTimer);
	}
	frm._wrReloadTimer = setTimeout(() => {
		frm._wrReloadTimer = null;
		_reloadNow(frm);
	}, 0);
}

function _destroyWrForm(frm) {
	const { common } = project_workload_assignment.workloadReports;
	if (frm._wrForm?.zones) {
		common.destroyTable?.(frm._wrForm.zones.table);
		common.destroyCharts?.(frm._wrForm.zones.charts);
	}
	frm._wrForm = null;
}

function _needsRemount(frm, hostEl) {
	if (!frm._wrForm) return true;
	if (frm._wrForm.version !== MOUNT_VERSION) return true;
	if (!frm._wrForm.zones?.filters) return true;
	if (!hostEl?.querySelector?.(":scope > .workload-reports-filters")) return true;
	if (hostEl.querySelector(".projects-workload-ag-grid")) return true;
	return false;
}

function mount(frm, attempt = 0) {
	const { common } = project_workload_assignment.workloadReports;
	if (!frm || frm.doctype !== DOCTYPE) return;
	if (frm !== window.cur_frm) return;

	frm.page?.clear_indicator?.();
	frm.page?.set_primary_action?.(null);
	frm.disable_save?.();

	_applySessionUserFilter(frm);

	const field = frm.get_field(FIELD);
	if (!field?.$wrapper?.length) {
		if (attempt < MOUNT_MAX_ATTEMPTS) {
			setTimeout(() => mount(frm, attempt + 1), MOUNT_RETRY_MS);
		} else {
			console.error("[workload-reports.form] field missing after retries", FIELD);
		}
		return;
	}

	if (!_markFiltersSection(frm)) {
		if (attempt < MOUNT_MAX_ATTEMPTS) {
			setTimeout(() => mount(frm, attempt + 1), MOUNT_RETRY_MS);
		} else {
			console.error("[workload-reports.form] filters section not ready");
		}
		return;
	}

	const hostEl = field.$wrapper.get(0);

	if (_needsRemount(frm, hostEl)) {
		_destroyWrForm(frm);
		_stripLegacyGrid(frm);
		common.parkFormLinkFields?.(frm);
		field.$wrapper.empty();

		const zones = common.mountLayout(hostEl);
		const expand = common.createProjectsExpandHandler({
			getFilters: () => frm._wrForm.getArgs(),
			fetchUserProjects: (args) => common.getUserProjects(args),
		});
		const getArgs = common.mountProjectsFiltersFromForm(frm, zones.filters, () => {
			_reload(frm);
		});
		common.mountCharts(zones.charts, {
			surface: "report",
			getArgs: () => frm._wrForm.getArgs(),
			getTableApi: () => zones.table._wrTable?.table?.api ?? null,
		});
		common.mountChartVisibilityToggle(zones.filters, zones.charts);

		frm._wrForm = { zones, getArgs, expand, version: MOUNT_VERSION };
	}

	_applyFormLayout(frm);
	_reload(frm);
}

function bindForm() {
	// Global: bundle may evaluate more than once; module `let` would not dedupe.
	if (window.__PWR_FORM_BOUND__) return;
	window.__PWR_FORM_BOUND__ = true;

	frappe.ui.form.on(DOCTYPE, {
		onload(frm) {
			frm.page?.clear_indicator?.();
			frm.page?.set_primary_action?.(null);
			frm.page?.clear_menu?.();
			// Previous SPA visit only — never race a mount that ran before onload.
			_destroyWrForm(frm);
			_stripLegacyGrid(frm);
		},
		refresh(frm) {
			mount(frm);
		},
		user(frm) {
			if (frm._wrForm) _reload(frm);
		},
		project(frm) {
			if (frm._wrForm) _reload(frm);
		},
		project_portfolio(frm) {
			if (frm._wrForm) _reload(frm);
		},
		user_group(frm) {
			if (frm._wrForm) _reload(frm);
		},
	});

	// Missed refresh (handlers bound after Form lifecycle): mount once, after onload/refresh.
	setTimeout(() => {
		const frm = window.cur_frm;
		if (frm?.doctype === DOCTYPE && !frm._wrForm) {
			mount(frm);
		}
	}, 0);
}

frappe.provide("project_workload_assignment.workloadReports.reportForm");

project_workload_assignment.workloadReports.reportForm = { bindForm, mount };
