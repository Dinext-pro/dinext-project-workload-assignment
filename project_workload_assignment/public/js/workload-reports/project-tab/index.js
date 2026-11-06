const FIELD = "custom_workload";
const TAB_ANCHOR = "custom_workload_tab_anchor";
const TAB_FIELD = "custom_загрузка";

function _lazyTabField(frm) {
	if (frm?.get_field?.(TAB_ANCHOR)) {
		return TAB_ANCHOR;
	}
	return FIELD;
}

const _dbg = (event, data) =>
	project_workload_assignment.workloadReports?.common?.wrDebug?.("project", event, data);
const _fieldSnap = (frm) =>
	project_workload_assignment.workloadReports?.common?.wrFieldSnapshot?.(frm, FIELD);

function _revealProjectHost(field) {
	if (!field?.$wrapper?.length) return;
	field.$wrapper
		.removeClass("hide-control")
		.closest(".frappe-control")
		.removeClass("hide-control")
		.show();
}

function _applyProjectTabLayout(field) {
	if (!field?.$wrapper?.length) return;
	field.$wrapper.css({ maxWidth: "none", width: "100%", padding: 0 });
	const $section = field.$wrapper.closest(".form-section");
	if (!$section.length) return;
	$section
		.removeClass("empty-section hide-control")
		.addClass("visible-section workload-reports-project-section")
		.css({ padding: 0, margin: 0, display: "" });
	$section.find(".section-head").hide();
	$section.find(".section-body, .form-column").css({
		padding: 0,
		margin: 0,
		width: "100%",
		maxWidth: "100%",
		boxSizing: "border-box",
	});
}

function _hostIsLive(el, project) {
	return !!(
		el?._wr &&
		el.isConnected !== false &&
		el.querySelector?.(".workload-reports-root") &&
		el._wrProject === project
	);
}

const _reload = (frm, el) => {
	const { common } = project_workload_assignment.workloadReports;
	const args = { project: frm.doc.name, ...el._getArgs() };
	const tableDone = common.loadTable(el._wr.table, () => common.getProjectData(args), {
		viewType: args.view_type,
		showFact: !!args.load_actual,
		applyLimit: !!args.consider_limit,
		toolbar: el._wrToolbar,
	});
	const chartsDone = common.scheduleChartsReload(el._wr.charts);
	return Promise.all([tableDone, chartsDone]).then(() => {
		common.flushChartsWhenVisible?.(el._wr.charts);
		common.realignCharts?.(el._wr.charts);
	});
};

let chartsTabBound = false;

const _bindChartsTab = () => {
	if (chartsTabBound) {
		return;
	}
	chartsTabBound = true;
	$(document).on("shown.bs.tab", ".nav-link[data-toggle='tab']", (e) => {
		if ($(e.target).attr("data-fieldname") !== TAB_FIELD) {
			return;
		}
		const host = cur_frm?.get_field?.(FIELD)?.$wrapper?.get?.(0);
		const charts = host?._wr?.charts;
		if (!charts) {
			return;
		}
		// Tab was display:none — realign (or reload only if filters changed while hidden).
		// Full scheduleChartsReload here disposed the chart on every switch.
		project_workload_assignment.workloadReports.common.flushChartsWhenVisible?.(charts);
	});
};

function mount(frm) {
	const { common } = project_workload_assignment.workloadReports;

	_dbg("mount-start", {
		project: frm?.doc?.name,
		isCurFrm: frm === window.cur_frm,
		field: _fieldSnap(frm),
	});

	const field = frm.get_field(FIELD);
	if (!field?.$wrapper?.length) {
		_dbg("mount-abort-no-field", _fieldSnap(frm));
		return;
	}

	const el = field.$wrapper.get(0);
	if (_hostIsLive(el, frm.doc.name)) {
		_revealProjectHost(field);
		_applyProjectTabLayout(field);
		_dbg("mount-skip-live-same", { project: frm.doc.name });
		return;
	}

	const stale =
		!!el._wr &&
		(el.isConnected === false || !el.querySelector?.(".workload-reports-root"));
	if (stale) {
		el._wr = null;
		el._wrProject = null;
	}
	const isNew = !el._wr;
	if (isNew) {
		_dbg("mount-layout-new", { hidden: field.df?.hidden });
		_revealProjectHost(field);
		field.$wrapper
			.empty()
			.addClass("workload-reports-project-tab")
			.removeClass("input-max-width")
			.css({ maxWidth: "none", width: "100%", padding: 0 });
		el._wr = common.mountLayout(el);
		const session = common.mountProjectFilters(el._wr.filters, () => {
			_reload(frm, el);
		}, {
			getProject: () => frm.doc.name,
			workload_base: frm.doc.custom_workload_base || "От плана",
			onWorkloadBaseChange: (v) => frm.set_value("custom_workload_base", v),
		});
		el._getArgs = session.getArgs;
		el._wrToolbar = common.buildPeriodToolbar(session, "workload-reports-project", {
			getChartsState: () => el._wr.charts._wrCharts,
			onUtilizationChange: () => common.scheduleChartsReload(el._wr.charts),
			onStackByChange: () => common.remountChartsFromCache(el._wr.charts),
			projectArgs: session.args,
			onProjectArgsChange: () => _reload(frm, el),
		});
		common.mountCharts(el._wr.charts, {
			surface: "project",
			getArgs: () => ({ project: frm.doc.name, ...el._getArgs() }),
			getTableApi: () => el._wr.table._wrTable?.table?.api ?? null,
			projectArgs: session.args,
			onProjectArgsChange: () => _reload(frm, el),
		});
		common.mountChartVisibilityToggle(el._wr.filters, el._wr.charts);
		_bindChartsTab();
	} else {
		_dbg("mount-reuse-existing", { hasWr: !!el._wr, prev: el._wrProject });
		_revealProjectHost(field);
	}

	el._wrProject = frm.doc.name;
	_applyProjectTabLayout(field);
	const reload = _reload(frm, el);
	_dbg("mount-done", { isNew, hasWrRoot: !!el.querySelector?.(".workload-reports-root") });
	return reload;
}

function _scheduleMountNow(frm) {
	const lazyField = _lazyTabField(frm);
	_dbg("schedule-mount", {
		project: frm?.doc?.name,
		lazyField,
		hasBindLazyTabMount: typeof project_workload_assignment.bindLazyTabMount === "function",
		field: _fieldSnap(frm),
		anchor: project_workload_assignment.workloadReports?.common?.wrFieldSnapshot?.(
			frm,
			TAB_ANCHOR
		),
		tabVisible: project_workload_assignment.isFieldTabVisible?.(frm, lazyField),
	});
	const bind = project_workload_assignment.bindLazyTabMount;
	if (typeof bind !== "function") {
		console.error("[WorkloadReports] bindLazyTabMount missing — refuse eager mount");
		return;
	}
	const field = frm.get_field(FIELD);
	const hostEl = field?.$wrapper?.get?.(0);
	if (field && (_hostIsLive(hostEl, frm.doc?.name) || project_workload_assignment.isFieldTabVisible?.(frm, lazyField))) {
		_revealProjectHost(field);
		_applyProjectTabLayout(field);
	}
	bind(frm, lazyField, () => mount(frm));
	// Deep-link from PWR: open Загрузка once (mount via shown.bs.tab / already-active)
	project_workload_assignment.workloadReports.common?.consumeOpenWorkloadTab?.(frm, FIELD);
}

/** Shell deferred; table/API only when tab «Загрузка» is visible. */
function scheduleMount(frm) {
	if (!frm) return;
	if (frm._wrMountTimer) {
		clearTimeout(frm._wrMountTimer);
	}
	frm._wrMountTimer = setTimeout(() => {
		frm._wrMountTimer = null;
		_scheduleMountNow(frm);
	}, 0);
}

let bound = false;

const _bindForm = () => {
	if (bound) {
		_dbg("bindForm-skip-already-bound");
		return;
	}
	bound = true;
	_dbg("bindForm-ok");
	frappe.ui.form.on("Project", {
		refresh(frm) {
			_dbg("form-refresh", { project: frm?.doc?.name });
			scheduleMount(frm);
		},
		after_save(frm) {
			const el = frm.get_field(FIELD)?.$wrapper?.get?.(0);
			if (_hostIsLive(el, frm.doc.name)) {
				_reload(frm, el);
			}
		},
	});
};

frappe.provide("project_workload_assignment.workloadReports.project");

project_workload_assignment.workloadReports.project = {
	bindForm: _bindForm,
	mount,
	scheduleMount,
};
