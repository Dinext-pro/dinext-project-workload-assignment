/**
 * Chart visibility toggle in filter actions (before Refresh).
 * Icon rotates; charts zone fades/collapses via CSS.
 */

import { bindChartAlign } from "./align.js";

const COLLAPSED_CLASS = "workload-reports-charts--collapsed";
const BTN_COLLAPSED_CLASS = "wr-chart-visibility-toggle--collapsed";
const TRANSITION_MS = 280;

/**
 * Prepend visibility button into `.wr-filters-actions`.
 * @param {HTMLElement} filtersEl
 * @param {HTMLElement} chartsEl
 */
export function mountChartVisibilityToggle(filtersEl, chartsEl) {
	if (!filtersEl || !chartsEl) return null;

	const actions = filtersEl.querySelector(".wr-filters-actions");
	if (!actions) return null;

	const existing = actions.querySelector(".wr-chart-visibility-toggle");
	if (existing) return existing;

	chartsEl.classList.add("workload-reports-charts--anim");

	const btn = document.createElement("button");
	btn.type = "button";
	btn.className =
		"btn btn-default btn-sm wr-filters-icon-btn wr-chart-visibility-toggle";
	btn.innerHTML = '<span class="wr-chart-visibility-toggle__icon" aria-hidden="true">▼</span>';

	let visible = chartsEl.dataset.wrChartsVisible !== "0";
	let animTimer = null;

	const afterVisible = () => {
		// Avoid circular import with charts/index.js (re-exports this module).
		const flush =
			project_workload_assignment?.workloadReports?.common?.flushChartsWhenVisible;
		if (typeof flush === "function") {
			flush(chartsEl);
			return;
		}
		const state = chartsEl._wrCharts;
		const chart = state?.chart;
		const panel = state?.panel;
		if (!panel || !chart || chart.isDisposed?.()) return;
		try {
			bindChartAlign({
				hostEl: chartsEl,
				panel,
				chart,
				getTableApi: state.getTableApi,
			});
			chart.resize();
		} catch (_e) {
			/* ignore */
		}
	};

	const apply = ({ animate } = { animate: false }) => {
		chartsEl.dataset.wrChartsVisible = visible ? "1" : "0";
		btn.classList.toggle(BTN_COLLAPSED_CLASS, !visible);
		btn.title = visible ? __("Hide chart") : __("Show chart");
		btn.setAttribute("aria-expanded", visible ? "true" : "false");

		if (animTimer) {
			clearTimeout(animTimer);
			animTimer = null;
		}

		if (visible) {
			chartsEl.hidden = false;
			// Force reflow so removing collapsed class animates from 0.
			void chartsEl.offsetHeight;
			chartsEl.classList.remove(COLLAPSED_CLASS);
			if (animate) {
				animTimer = setTimeout(() => {
					animTimer = null;
					afterVisible();
				}, TRANSITION_MS);
			} else {
				requestAnimationFrame(afterVisible);
			}
			return;
		}

		chartsEl.classList.add(COLLAPSED_CLASS);
		if (animate) {
			animTimer = setTimeout(() => {
				animTimer = null;
				chartsEl.hidden = true;
			}, TRANSITION_MS);
		} else {
			chartsEl.hidden = true;
		}
	};

	btn.addEventListener("click", () => {
		visible = !visible;
		apply({ animate: true });
	});

	actions.insertBefore(btn, actions.firstChild);
	apply({ animate: false });
	return btn;
}
