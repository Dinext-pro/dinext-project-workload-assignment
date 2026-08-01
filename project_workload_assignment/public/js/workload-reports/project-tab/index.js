const FIELD = "custom_workload";
const TAB_FIELD = "custom_загрузка";

const _reload = (frm, el) => {
	const { common } = project_workload_assignment.workloadReports;
	const args = { project: frm.doc.name, ...el._getArgs() };
	const tableDone = common.loadTable(el._wr.table, () => common.getProjectData(args), {
		viewType: args.view_type,
		showFact: !!args.load_actual,
	});
	const chartsDone = common.scheduleChartsReload(el._wr.charts);
	return Promise.all([tableDone, chartsDone]).then(() => {
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

	const field = frm.get_field(FIELD);
	if (!field?.$wrapper?.length) {
		return;
	}

	const el = field.$wrapper.get(0);
	const isNew = !el._wr;
	if (isNew) {
		field.$wrapper
			.empty()
			.addClass("workload-reports-project-tab")
			.removeClass("input-max-width");
		el._wr = common.mountLayout(el);
		el._getArgs = common.mountProjectFilters(el._wr.filters, () => {
			_reload(frm, el);
		});
		common.mountCharts(el._wr.charts, {
			surface: "project",
			getArgs: () => ({ project: frm.doc.name, ...el._getArgs() }),
			getTableApi: () => el._wr.table._wrTable?.table?.api ?? null,
		});
		common.mountChartVisibilityToggle(el._wr.filters, el._wr.charts);
		_bindChartsTab();
	}

	return _reload(frm, el);
}

/** Shell deferred; table/API only when tab «Загрузка» is visible. */
function scheduleMount(frm) {
	const bind = project_workload_assignment.bindLazyTabMount;
	if (typeof bind !== "function") {
		console.error("[WorkloadReports] bindLazyTabMount missing — refuse eager mount");
		return;
	}
	bind(frm, FIELD, () => mount(frm));
	// Deep-link from PWR: open Загрузка once (mount via shown.bs.tab / already-active)
	project_workload_assignment.workloadReports.common?.consumeOpenWorkloadTab?.(frm, FIELD);
}

let bound = false;

const _bindForm = () => {
	if (bound) {
		return;
	}
	bound = true;
	frappe.ui.form.on("Project", {
		refresh(frm) {
			scheduleMount(frm);
		},
	});
};

frappe.provide("project_workload_assignment.workloadReports.project");

project_workload_assignment.workloadReports.project = {
	bindForm: _bindForm,
	mount,
	scheduleMount,
};
