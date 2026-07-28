import {
	CHART_HEIGHT,
	CHART_PLOT_HEIGHT,
	LEGEND_BAND_PX,
	Y_AXIS_GUTTER_PX,
	DEFAULT_LABEL_GUTTER_PX,
} from "./theme.js";

const PLACEHOLDER_CLASS = "wr-charts-placeholder";
const STATUS_CLASS = "wr-chart-status";

/** Set --wr-* tokens on host / root; layout heights come from CSS. */
export function applyChartHeights(hostEl, panel) {
	const vars = {
		"--wr-chart-total-height": CHART_HEIGHT,
		"--wr-chart-plot-height": CHART_PLOT_HEIGHT,
		"--wr-charts-min-height": CHART_HEIGHT,
		"--wr-yaxis-gutter-width": `${Y_AXIS_GUTTER_PX}px`,
		"--wr-filters-gutter-width": `${DEFAULT_LABEL_GUTTER_PX - Y_AXIS_GUTTER_PX}px`,
		"--wr-legend-band": `${LEGEND_BAND_PX}px`,
	};

	const applyVars = (el) => {
		if (!el) return;
		Object.entries(vars).forEach(([k, v]) => {
			el.style.setProperty(k, v);
		});
	};

	applyVars(hostEl);
	const rootEl = panel?.$root?.get?.(0);
	applyVars(rootEl);
}

/** Muted placeholder in host until panel exists. */
export function ensurePlaceholder(hostEl, message) {
	if (!hostEl) return;
	applyChartHeights(hostEl, null);
	if (hostEl.querySelector(`.${PLACEHOLDER_CLASS}`)) return;
	if (hostEl.querySelector(".wr-charts-root")) return;

	const el = document.createElement("div");
	el.className = `${PLACEHOLDER_CLASS} text-muted`;
	el.textContent = message || __("Loading chart...");
	hostEl.appendChild(el);
}

export function clearPlaceholder(hostEl) {
	if (!hostEl) return;
	hostEl.querySelectorAll(`.${PLACEHOLDER_CLASS}`).forEach((n) => n.remove());
}

/**
 * Status / loading / error text.
 * Never wipe host.innerHTML — only chartEl or placeholder node.
 */
export function showChartMessage(target, message, kind = "muted") {
	const text = message || __("Chart unavailable");
	const tone =
		kind === "error" ? "text-danger" : "text-muted";

	if (target?.$chartEl?.length) {
		target.$chartEl.html(
			`<div class="${STATUS_CLASS} ${tone}">${frappe.utils.escape_html(text)}</div>`
		);
		return;
	}

	if (!(target instanceof HTMLElement)) return;

	const host = target;
	let node =
		host.querySelector(`.${PLACEHOLDER_CLASS}`) ||
		host.querySelector(`.${STATUS_CLASS}`);
	if (!node) {
		node = document.createElement("div");
		node.className = PLACEHOLDER_CLASS;
		host.appendChild(node);
	}
	node.className = `${PLACEHOLDER_CLASS} ${STATUS_CLASS} ${tone}`;
	node.textContent = text;
}

/**
 * Create / reuse DinextCharts ag-grid-aligned panel inside host.
 * Requires window.DinextCharts (assets already loaded).
 */
export function ensurePanel(hostEl, title) {
	if (!hostEl || !window.DinextCharts?.createPanel) return null;

	const state = hostEl._wrCharts;
	const existing = state?.panel;
	if (
		existing?.$root?.length &&
		existing.$root.closest("body").length &&
		existing.$root.parent().get(0) === hostEl
	) {
		applyChartHeights(hostEl, existing);
		return existing;
	}

	disposeChartInstance(state);
	clearPlaceholder(hostEl);
	$(hostEl).empty();

	const $root = $('<div class="wr-charts-root"></div>').appendTo(hostEl);
	const panel = window.DinextCharts.createPanel($root, {
		title: title || __("Workload"),
		collapsed: false,
		height: CHART_HEIGHT,
		layout: "ag-grid-aligned",
	});
	panel.$root = $root;
	applyChartHeights(hostEl, panel);

	if (state) {
		state.panel = panel;
		state._controlsReady = false;
		state.chart = null;
	}
	return panel;
}

/** Dispose chart instance + layout cleanup; keep panel DOM if present. */
export function disposeChartInstance(state) {
	if (!state) return;

	if (typeof state.layoutCleanup === "function") {
		try {
			state.layoutCleanup();
		} catch (_e) {
			/* ignore */
		}
		state.layoutCleanup = null;
	}

	if (state.chart) {
		try {
			state.chart.dispose();
		} catch (_e) {
			/* ignore */
		}
		state.chart = null;
	}

	if (state.panel?.$gutterYaxis?.length) {
		state.panel.$gutterYaxis.empty();
	}
	if (state.panel?.$legendBar?.length) {
		state.panel.$legendBar.empty();
	}
	if (state.panel?.$chartEl?.length && window.DinextCharts?.dispose) {
		window.DinextCharts.dispose(state.panel.$chartEl);
	}
}
