import { SURFACE_PROJECT } from "../constants.js";
import { fetchTeamCharts, fetchProjectCharts } from "../api/client.js";
import { ensureChartsHost, applyChartHeights } from "./mount.js";
import { bindChartAlign, syncYAxisGutterLabels, updateFixedChartLegend } from "./align.js";
import { ensureChartControls } from "./controls.js";
import { buildTeamChartOption } from "./options-team.js";
import { buildProjectChartOption } from "./options-project.js";
import { CHART_HEIGHT } from "./theme.js";

const DINEXT_CHARTS_CORE =
	"/assets/dinext_common/js/charts/dinext-charts-core.js";
const CHART_CSS = "/assets/project_workload_assignment/css/pwr-workload-charts.css";

let chartsFailNotified = false;
let coreLoadPromise = null;

function ensureStylesheet(href) {
	if (document.querySelector(`link[href^="${href}"]`)) return;
	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.href = href;
	document.head.appendChild(link);
}

function notifyChartsFailOnce(err) {
	if (chartsFailNotified) return;
	chartsFailNotified = true;
	console.error("[workload.charts]", err);
	frappe.msgprint({
		title: __("Charts"),
		indicator: "orange",
		message: __(
			"Workload charts failed to load; table still works. {0}",
			[err?.message || String(err)]
		),
	});
}

function loadDinextCharts() {
	ensureStylesheet(CHART_CSS);
	if (window.DinextCharts?.load) {
		return window.DinextCharts.load();
	}
	if (!coreLoadPromise) {
		coreLoadPromise = new Promise((resolve, reject) => {
			frappe.require([DINEXT_CHARTS_CORE], () => {
				if (window.DinextCharts?.load) {
					window.DinextCharts.load().then(resolve).catch(reject);
				} else {
					reject(new Error("DinextCharts failed to load"));
				}
			});
		});
	}
	return coreLoadPromise;
}

function ensureChartsState(state) {
	if (!state.charts) {
		state.charts = {
			hostEl: null,
			panel: null,
			chart: null,
			loadToken: 0,
			layoutCleanup: null,
			_controlsReady: false,
			onReload: null,
		};
	}
	return state.charts;
}

function disposeChartInstance(charts) {
	if (charts.layoutCleanup) {
		charts.layoutCleanup();
		charts.layoutCleanup = null;
	}
	if (charts.chart) {
		if (charts._yAxisSyncHandler) {
			try {
				charts.chart.off("finished", charts._yAxisSyncHandler);
			} catch (_e) {
				/* ignore */
			}
			charts._yAxisSyncHandler = null;
		}
		try {
			charts.chart.dispose();
		} catch (_e) {
			/* ignore */
		}
		charts.chart = null;
	}
	if (charts.panel?.$gutterYaxis) {
		charts.panel.$gutterYaxis.empty();
	}
	if (charts.panel?.$legendBar) {
		charts.panel.$legendBar.empty();
	}
	if (charts.panel?.$chartEl && window.DinextCharts?.dispose) {
		window.DinextCharts.dispose(charts.panel.$chartEl);
	}
}

function ensurePanel(state, title) {
	const charts = ensureChartsState(state);
	const host = ensureChartsHost(state);
	if (!host) return null;

	if (
		charts.panel &&
		charts.panel.$root?.length &&
		charts.panel.$root.closest("body").length &&
		charts.panel.$root.parent().get(0) === host
	) {
		return charts.panel;
	}

	disposeChartInstance(charts);
	$(host).empty();

	const $root = $('<div class="pwr-workload-charts-root"></div>').appendTo(host);
	const panel = window.DinextCharts.createPanel($root, {
		title: title || __("Workload"),
		collapsed: false,
		height: CHART_HEIGHT,
		layout: "ag-grid-aligned",
	});
	panel.$root = $root;
	charts.panel = panel;
	charts._controlsReady = false;
	applyChartHeights(panel);
	return panel;
}

function showChartLoading(panel, message) {
	if (!panel?.$chartEl?.length) return;
	panel.$chartEl.html(
		`<div class="pwr-chart-loading text-muted">${frappe.utils.escape_html(
			message || __("Loading chart...")
		)}</div>`
	);
}

function showChartError(panel, message) {
	if (!panel?.$chartEl?.length) return;
	panel.$chartEl.html(
		`<div class="pwr-chart-loading text-danger">${frappe.utils.escape_html(
			message || __("Chart request failed")
		)}</div>`
	);
}

function buildTeamArgs(state) {
	const f = state.filters || {};
	return {
		user: f.user || "",
		project: f.project || "",
		project_portfolio: f.project_portfolio || "",
		user_group: f.user_group || "",
		view_type: f.view_type || "weekly",
		period_range: f.period_range || "quarter",
		period_anchor_date: f.period_anchor_date || frappe.datetime.get_today(),
		worker_wtype: f.worker_wtype || "",
		load_utilization: f.load_utilization != null ? f.load_utilization : 0,
		load_actual: f.load_actual != null ? f.load_actual : 0,
	};
}

function buildProjectArgs(state) {
	const f = state.filters || {};
	return {
		project: f.project || state.frm?.doc?.name || "",
		view_type: f.view_type || "daily",
		date_from: f.date_from,
		date_to: f.date_to,
		worker_wtype: f.worker_wtype || "",
		load_utilization: f.load_utilization != null ? f.load_utilization : 0,
		load_actual: f.load_actual != null ? f.load_actual : 0,
	};
}

function mountOption(state, panel, option) {
	const charts = state.charts;
	panel.$chartEl.empty();
	charts.chart = window.DinextCharts.mount(panel.$chartEl, option);
	updateFixedChartLegend(panel, option);

	const syncYAxis = () => {
		syncYAxisGutterLabels(charts.chart, panel, __("Hours"));
	};
	charts._yAxisSyncHandler = syncYAxis;
	charts.chart.on("finished", syncYAxis);
	bindChartAlign(state);
	syncYAxis();
}

/**
 * Reload charts for report or project surface from state.filters.
 * @param {object} state
 * @param {{ onReload?: Function }} [opts]
 */
export async function reload(state, opts) {
	if (!state) {
		throw new Error("workload.charts.reload: state required");
	}

	const charts = ensureChartsState(state);
	if (opts?.onReload) {
		charts.onReload = opts.onReload;
	}

	const token = ++charts.loadToken;

	try {
		await loadDinextCharts();
	} catch (err) {
		notifyChartsFailOnce(err);
		return null;
	}

	if (token !== charts.loadToken) return null;

	const isProject = state.surface === SURFACE_PROJECT;
	const title = isProject ? __("Project workload") : __("Team workload");
	const panel = ensurePanel(state, title);
	if (!panel) return null;

	ensureChartControls(state, (meta) => {
		const cb = charts.onReload;
		if (typeof cb === "function") {
			void cb(meta);
		} else if (meta?.chartOnly) {
			void reload(state);
		}
	});

	showChartLoading(panel);

	try {
		let data;
		let option;
		if (isProject) {
			data = await fetchProjectCharts(buildProjectArgs(state));
			if (token !== charts.loadToken) return null;
			if (data?.error) {
				showChartError(panel, data.error);
				return null;
			}
			option = buildProjectChartOption(data || {}, state.filters?.view_type || "daily");
		} else {
			data = await fetchTeamCharts(buildTeamArgs(state));
			if (token !== charts.loadToken) return null;
			if (data?.error) {
				showChartError(panel, data.error);
				return null;
			}
			option = buildTeamChartOption(
				data || {},
				state.filters?.view_type || "weekly"
			);
		}

		mountOption(state, panel, option);
		charts._lastPayload = { data, surface: state.surface };
		return charts.chart;
	} catch (err) {
		if (token !== charts.loadToken) return null;
		notifyChartsFailOnce(err);
		showChartError(panel, err?.message || String(err));
		return null;
	}
}

export function destroy(state) {
	if (!state?.charts) return;
	const charts = state.charts;
	disposeChartInstance(charts);
	if (charts.hostEl) {
		charts.hostEl.remove();
		charts.hostEl = null;
	}
	charts.panel = null;
	charts._controlsReady = false;
}

export { ensureChartsHost };
