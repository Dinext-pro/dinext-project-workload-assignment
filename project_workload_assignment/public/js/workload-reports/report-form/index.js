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
const MOUNT_VERSION = "form-fill-breadcrumbs-2026-09-21";

const _dbg = (event, data) =>
	project_workload_assignment.workloadReports?.common?.wrDebug?.("form", event, data);
const _fieldSnap = (frm) =>
	project_workload_assignment.workloadReports?.common?.wrFieldSnapshot?.(frm, FIELD);

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

function _revealReportSection(field) {
	const $section = field?.$wrapper?.closest?.(".form-section");
	if (!$section?.length) {
		return;
	}
	$section
		.removeClass("empty-section hide-control")
		.addClass("visible-section workload-reports-form-section")
		.css("display", "");
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
			.closest(".form-section")
			.css({ padding: 0, margin: 0 })
			.show();
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
	}

	const field = frm.get_field(FIELD);
	if (field?.$wrapper?.length) {
		field.$wrapper.find(".control-label").hide();
		field.$wrapper
			.addClass("workload-reports-form-host")
			.removeClass("input-max-width")
			.css({ maxWidth: "none", width: "100%", padding: 0 });
		_revealReportSection(field);
	}

	// Form refresh may re-apply hide-control on Link filters still in WR root.
	project_workload_assignment.workloadReports.common?.unveilFormLinkFields?.(frm);
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
			toolbar: state.toolbar,
		}
	);
	const chartsDone = common.scheduleChartsReload(state.zones.charts);
	void Promise.all([tableDone, chartsDone]).then(() => {
		common.flushChartsWhenVisible?.(state.zones.charts);
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

function _isDisconnected(el) {
	if (!el) return true;
	if (typeof el.isConnected === "boolean") return !el.isConnected;
	return typeof document !== "undefined" && !document.contains(el);
}

function _needsRemount(frm, hostEl) {
	if (!frm._wrForm) return true;
	if (frm._wrForm.version !== MOUNT_VERSION) return true;
	if (!frm._wrForm.zones?.filters) return true;
	if (_isDisconnected(hostEl)) return true;
	if (_isDisconnected(frm._wrForm.zones?.table)) return true;
	if (!hostEl?.querySelector?.(":scope > .workload-reports-filters")) return true;
	return false;
}

function mount(frm, attempt = 0) {
	const { common } = project_workload_assignment.workloadReports;
	if (!frm || frm.doctype !== DOCTYPE) {
		_dbg("mount-skip-wrong-doctype", { doctype: frm?.doctype, attempt });
		return;
	}
	if (frm !== window.cur_frm) {
		_dbg("mount-skip-not-cur-frm", { attempt, cur: window.cur_frm?.doctype });
		return;
	}

	if (attempt === 0) {
		_dbg("mount-start", {
			attempt,
			field: _fieldSnap(frm),
			filterFields: ["user", "project", "project_portfolio", "user_group"].map((f) =>
				project_workload_assignment.workloadReports.common?.wrFieldSnapshot?.(frm, f)
			),
		});
	}

	frm.page?.clear_indicator?.();
	frm.page?.set_primary_action?.(null);
	frm.disable_save?.();

	_applySessionUserFilter(frm);

	const field = frm.get_field(FIELD);
	if (!field?.$wrapper?.length) {
		if (attempt < MOUNT_MAX_ATTEMPTS) {
			if (attempt === 0 || attempt % 10 === 0) {
				_dbg("mount-retry-field-missing", { attempt, field: _fieldSnap(frm) });
			}
			setTimeout(() => mount(frm, attempt + 1), MOUNT_RETRY_MS);
		} else {
			console.error("[workload-reports.form] field missing after retries", FIELD);
			_dbg("mount-fail-field-missing", _fieldSnap(frm));
		}
		return;
	}

	if (!_markFiltersSection(frm)) {
		// Soft: Link fields stay findable via fields_dict even when section is empty-section.
		// Do not block mount — relocate still works from frm.fields_dict.
		if (attempt === 0) {
			_dbg("mount-filters-section-soft-miss", {
				sectionLen: common.getFormFiltersSection(frm)?.length,
			});
		}
	}

	const hostEl = field.$wrapper.get(0);

	if (_needsRemount(frm, hostEl)) {
		_dbg("mount-remount", { hidden: field.df?.hidden });
		_destroyWrForm(frm);
		common.parkFormLinkFields?.(frm);
		field.$wrapper
			.removeClass("hide-control")
			.closest(".frappe-control")
			.removeClass("hide-control")
			.show();
		field.$wrapper.empty();

		const zones = common.mountLayout(hostEl);
		const expand = common.createProjectsExpandHandler({
			getFilters: () => frm._wrForm.getArgs(),
			fetchUserProjects: (args) => common.getUserProjects(args),
		});
		const session = common.mountProjectsFiltersFromForm(frm, zones.filters, () => {
			_reload(frm);
		});
		const toolbar = common.buildPeriodToolbar(session, "workload-reports-form", {
			getChartsState: () => zones.charts._wrCharts,
			onUtilizationChange: () => common.scheduleChartsReload(zones.charts),
			onStackByChange: () => common.remountChartsFromCache(zones.charts),
		});
		common.mountCharts(zones.charts, {
			surface: "report",
			getArgs: () => frm._wrForm.getArgs(),
			getTableApi: () => zones.table._wrTable?.table?.api ?? null,
		});
		common.mountChartVisibilityToggle(zones.filters, zones.charts, { append: true });

		frm._wrForm = {
			zones,
			getArgs: session.getArgs,
			session,
			expand,
			toolbar,
			version: MOUNT_VERSION,
		};
	}

	_applyFormLayout(frm);
	_reload(frm);
	_dbg("mount-done", {
		attempt,
		hasWrForm: !!frm._wrForm,
		hasWrRoot:
			!!hostEl?.classList?.contains("workload-reports-root") ||
			!!hostEl?.querySelector?.(".workload-reports-root"),
		sectionEmpty: hostEl
			?.closest?.(".form-section")
			?.classList?.contains("empty-section"),
	});
}

function bindForm() {
	// Global: bundle may evaluate more than once; module `let` would not dedupe.
	if (window.__PWR_FORM_BOUND__) {
		_dbg("bindForm-skip-already-bound");
		return;
	}
	window.__PWR_FORM_BOUND__ = true;
	_dbg("bindForm-ok");

	frappe.ui.form.on(DOCTYPE, {
		onload(frm) {
			_dbg("form-onload");
			frm.page?.clear_indicator?.();
			frm.page?.set_primary_action?.(null);
			frm.page?.clear_menu?.();
			// Previous SPA visit only — never race a mount that ran before onload.
			_destroyWrForm(frm);
		},
		refresh(frm) {
			_dbg("form-refresh");
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
		if (frm?.doctype === DOCTYPE) {
			_dbg("mount-fallback-timeout");
			mount(frm);
		}
	}, 0);
}

frappe.provide("project_workload_assignment.workloadReports.reportForm");

project_workload_assignment.workloadReports.reportForm = { bindForm, mount };
