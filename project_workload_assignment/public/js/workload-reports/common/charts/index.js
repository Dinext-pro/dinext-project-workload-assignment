/**
 * Charts entry for workload-reports v3 — lazy, non-blocking shell.
 */

import { getTeamCharts, getProjectCharts } from "../api.js";
import {
	buildReportChartOption,
	buildProjectChartOption,
} from "./options.js";
import {
	ensurePlaceholder,
	ensurePanel,
	showChartMessage,
	disposeChartInstance,
} from "./shell.js";
import { bindChartAlign, updateFixedChartLegend } from "./align.js";
import { mountChartVisibilityToggle } from "./visibility.js";

export { buildReportChartOption, buildProjectChartOption };
export { mountChartVisibilityToggle };

const DINEXT_CHARTS_CORE =
	"/assets/dinext_common/js/charts/dinext-charts-core.js";

let coreLoadPromise = null;
const _liveHosts = new Set();
let _themeObserver = null;

function _getState(hostEl) {
	return hostEl?._wrCharts || null;
}

function _registerLiveHost(hostEl) {
	if (hostEl) _liveHosts.add(hostEl);
	_ensureThemeObserver();
}

function _unregisterLiveHost(hostEl) {
	if (hostEl) _liveHosts.delete(hostEl);
}

/** P&L pattern: rebuild option after Desk `data-theme` switch (no page reload). */
function _refreshChartsTheme() {
	for (const hostEl of [..._liveHosts]) {
		if (!hostEl?.isConnected) {
			_liveHosts.delete(hostEl);
			continue;
		}
		const state = _getState(hostEl);
		if (!state?.lastPayload) continue;
		if (_isChartsSuppressed(hostEl)) {
			state.themeDirty = true;
			continue;
		}
		state.themeDirty = false;
		remountChartsFromCache(hostEl);
	}
}

function _ensureThemeObserver() {
	if (typeof MutationObserver === "undefined" || _themeObserver) return;
	const root = document.documentElement;
	if (!root) return;

	let theme = root.getAttribute("data-theme");
	let themeMode = root.getAttribute("data-theme-mode");

	_themeObserver = new MutationObserver(() => {
		const nextTheme = root.getAttribute("data-theme");
		const nextThemeMode = root.getAttribute("data-theme-mode");
		if (nextTheme === theme && nextThemeMode === themeMode) return;
		theme = nextTheme;
		themeMode = nextThemeMode;
		// Let CSS vars (and ECharts `getThemeName`) settle on the new `data-theme`.
		requestAnimationFrame(() => _refreshChartsTheme());
	});
	_themeObserver.observe(root, {
		attributes: true,
		attributeFilter: ["data-theme", "data-theme-mode"],
	});
}

function _ensureState(hostEl, ctx = {}) {
	if (!hostEl) return null;
	let state = hostEl._wrCharts;
	if (!state) {
		state = hostEl._wrCharts = {
			surface: ctx.surface || "report",
			getArgs: ctx.getArgs || (() => ({})),
			getTableApi: ctx.getTableApi || (() => null),
			projectArgs: ctx.projectArgs || null,
			onProjectArgsChange: ctx.onProjectArgsChange || null,
			utilization: 0,
			stackBy: "wtype",
			lastPayload: null,
			lastViewType: null,
			loadToken: 0,
			pending: false,
			io: null,
			panel: null,
			chart: null,
			layoutCleanup: null,
			_controlsReady: false,
		};
	} else {
		if (ctx.surface) state.surface = ctx.surface;
		if (typeof ctx.getArgs === "function") state.getArgs = ctx.getArgs;
		if (typeof ctx.getTableApi === "function") state.getTableApi = ctx.getTableApi;
		if (ctx.projectArgs) state.projectArgs = ctx.projectArgs;
		if (typeof ctx.onProjectArgsChange === "function") {
			state.onProjectArgsChange = ctx.onProjectArgsChange;
		}
	}
	return state;
}

function _loadDinextCharts() {
	if (window.DinextCharts?.load) {
		return window.DinextCharts.load();
	}
	if (!coreLoadPromise) {
		coreLoadPromise = new Promise((resolve, reject) => {
			frappe.require([DINEXT_CHARTS_CORE], () => {
				if (window.DinextCharts?.load) {
					window.DinextCharts.load().then(resolve).catch((err) => {
						coreLoadPromise = null;
						reject(err);
					});
				} else {
					coreLoadPromise = null;
					reject(new Error("DinextCharts failed to load"));
				}
			});
		});
	}
	return coreLoadPromise;
}

function _isHostVisible(hostEl) {
	if (!hostEl || !hostEl.isConnected) return false;
	const rect = hostEl.getBoundingClientRect();
	if (rect.width === 0 && rect.height === 0) return false;
	const vh = window.innerHeight || document.documentElement.clientHeight || 0;
	const margin = 80;
	return rect.bottom >= -margin && rect.top <= vh + margin;
}

/** Fullscreen / collapse / display:none — chart must not mount or align at 0×0. */
function _isChartsSuppressed(hostEl) {
	if (!hostEl || !hostEl.isConnected) return true;
	if (hostEl.hidden) return true;
	if (hostEl.classList.contains("workload-reports-charts--collapsed")) return true;
	const root = hostEl.closest?.(".workload-reports-root");
	if (root?.classList.contains("workload-reports-root--fullscreen")) return true;
	if (
		typeof document !== "undefined"
		&& root
		&& document.fullscreenElement === root
	) {
		return true;
	}
	const rect = hostEl.getBoundingClientRect();
	return rect.width === 0 && rect.height === 0;
}

function _disconnectIo(state) {
	if (state?.io) {
		try {
			state.io.disconnect();
		} catch (_e) {
			/* ignore */
		}
		state.io = null;
	}
}

function _ensureIo(hostEl) {
	const state = _getState(hostEl);
	if (!state || state.io || typeof IntersectionObserver !== "function") return;

	state.io = new IntersectionObserver(
		(entries) => {
			const hit = entries.some((e) => e.isIntersecting);
			if (!hit) return;
			if (!state.pending) return;
			state.pending = false;
			_runReload(hostEl);
		},
		{ root: null, rootMargin: "80px 0px", threshold: 0.01 }
	);
	state.io.observe(hostEl);
}

function _failCharts(hostEl, err) {
	console.error("[workload-reports.charts]", err);
	const state = _getState(hostEl);
	if (state) {
		state.pending = false;
		_disconnectIo(state);
	}
	const msg = err?.message || String(err) || __("Chart request failed");
	if (state?.panel) {
		showChartMessage(state.panel, msg, "error");
	} else if (hostEl) {
		showChartMessage(hostEl, msg, "error");
	}
}

/** Fire reloadCharts; swallow rejections so table path stays clean. */
function _runReload(hostEl) {
	return Promise.resolve()
		.then(() => reloadCharts(hostEl))
		.catch((err) => {
			_failCharts(hostEl, err);
			return null;
		});
}

function _mountOption(hostEl, panel, option) {
	const state = _getState(hostEl);
	if (!state) return null;

	disposeChartInstance(state);
	panel.$chartEl.empty();
	const chart = window.DinextCharts.mount(panel.$chartEl, option);
	state.chart = chart;

	try {
		updateFixedChartLegend(panel, option, chart);
	} catch (err) {
		console.error("[workload-reports.charts] legend", err);
	}

	try {
		bindChartAlign({
			hostEl,
			panel,
			chart,
			getTableApi: state.getTableApi,
		});
		// Table columns may land a tick later; remount bare-resize may also race.
		requestAnimationFrame(() => {
			requestAnimationFrame(() => realignCharts(hostEl));
		});
	} catch (err) {
		console.error("[workload-reports.charts] align", err);
	}

	state.pending = false;
	_disconnectIo(state);

	return chart;
}

function _buildChartOption(state) {
	const payload = state.lastPayload || {};
	const viewType = state.lastViewType || "weekly";
	const args = typeof state.getArgs === "function" ? state.getArgs() || {} : {};
	const opts = {
		stackBy: state.stackBy === "role" ? "role" : "wtype",
		considerLimit: args.consider_limit == null ? true : !!args.consider_limit,
	};
	return state.surface === "project"
		? buildProjectChartOption(payload, viewType, opts)
		: buildReportChartOption(payload, viewType, opts);
}

/** Rebuild series from cached payload (stack mode toggle — no refetch). */
export function remountChartsFromCache(hostEl) {
	const state = _getState(hostEl);
	if (!state?.panel || !state.lastPayload) return null;
	try {
		return _mountOption(hostEl, state.panel, _buildChartOption(state));
	} catch (err) {
		_failCharts(hostEl, err);
		return null;
	}
}

/**
 * Bind ctx + placeholder. Does NOT load echarts.
 * @param {HTMLElement} hostEl
 * @param {{ surface: "report"|"project", getArgs: Function, getTableApi: Function }} ctx
 */
export function mountCharts(hostEl, ctx) {
	if (!hostEl) return;
	_ensureState(hostEl, ctx || {});
	_registerLiveHost(hostEl);
	ensurePlaceholder(hostEl);
}

/**
 * Fire-and-forget reload entry. Never throws to caller.
 * While charts are hidden (fullscreen / collapsed), only mark pending.
 * @param {HTMLElement} hostEl
 */
export function scheduleChartsReload(hostEl) {
	try {
		const state = _getState(hostEl);
		if (!state) return Promise.resolve(null);

		if (_isChartsSuppressed(hostEl) || !_isHostVisible(hostEl)) {
			state.pending = true;
			_ensureIo(hostEl);
			// Never mount while suppressed (0×0). If no IO, wait for flushChartsWhenVisible.
			return Promise.resolve(null);
		}

		state.pending = false;
		return _runReload(hostEl);
	} catch (err) {
		_failCharts(hostEl, err);
		return Promise.resolve(null);
	}
}

/**
 * After charts become visible again (exit fullscreen / uncollapse):
 * reload if pending (filter/period may have changed while hidden), else realign.
 * @param {HTMLElement} hostEl
 */
export function flushChartsWhenVisible(hostEl) {
	try {
		const state = _getState(hostEl);
		if (!state || !hostEl) return;
		if (_isChartsSuppressed(hostEl)) return;

		_disconnectIo(state);
		if (state.pending) {
			state.pending = false;
			state.themeDirty = false;
			_runReload(hostEl);
			return;
		}
		if (state.themeDirty) {
			state.themeDirty = false;
			remountChartsFromCache(hostEl);
			return;
		}
		realignCharts(hostEl);
	} catch (err) {
		_failCharts(hostEl, err);
	}
}

/**
 * Full chart reload path (assets → panel → fetch → mount).
 * Safe to await; errors stay isolated (no rethrow to table path when used via schedule).
 * @param {HTMLElement} hostEl
 */
export async function reloadCharts(hostEl) {
	const state = _getState(hostEl);
	if (!state || !hostEl) return null;

	const token = ++state.loadToken;

	try {
		await _loadDinextCharts();
		if (token !== state.loadToken) return null;

		const isProject = state.surface === "project";
		const title = isProject ? __("Project workload") : __("Workload");
		const panel = ensurePanel(hostEl, title);
		if (!panel) {
			_failCharts(hostEl, new Error("Chart panel unavailable"));
			return null;
		}

		// Dispose before loading message so $chartEl.html does not orphan echarts.
		disposeChartInstance(state);

		showChartMessage(panel, null, "loading");

		const baseArgs =
			typeof state.getArgs === "function" ? state.getArgs() || {} : {};
		const args = {
			...baseArgs,
			load_utilization: state.utilization ? 1 : 0,
		};
		const viewType = args.view_type || (isProject ? "daily" : "weekly");

		const data = isProject
			? await getProjectCharts(args)
			: await getTeamCharts(args);

		if (token !== state.loadToken) return null;

		if (data?.error) {
			showChartMessage(panel, data.error, "error");
			state.pending = false;
			_disconnectIo(state);
			return null;
		}

		state.lastPayload = data || {};
		state.lastViewType = viewType;
		return _mountOption(hostEl, panel, _buildChartOption(state));
	} catch (err) {
		if (token !== state.loadToken) return null;
		_failCharts(hostEl, err);
		return null;
	}
}

/** Re-bind chart↔table align after late table mount / column layout. */
export function realignCharts(hostEl) {
	const state = hostEl?._wrCharts;
	if (!state?.panel || !state?.chart) return;
	try {
		bindChartAlign({
			hostEl,
			panel: state.panel,
			chart: state.chart,
			getTableApi: state.getTableApi,
		});
	} catch (err) {
		console.error("[workload-reports.charts] realign", err);
	}
}

/** Tear down chart, IO, panel DOM, state bag. */
export function destroyCharts(hostEl) {
	const state = _getState(hostEl);
	if (!state) {
		if (hostEl) hostEl.replaceChildren();
		return;
	}

	_disconnectIo(state);
	disposeChartInstance(state);
	state.panel = null;
	state._controlsReady = false;
	state.pending = false;
	state.themeDirty = false;
	state.loadToken += 1;
	_unregisterLiveHost(hostEl);

	if (hostEl) {
		hostEl.replaceChildren();
		delete hostEl._wrCharts;
	}
}
