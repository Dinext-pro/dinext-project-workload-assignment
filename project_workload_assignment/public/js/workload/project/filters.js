/**
 * Own Project tab filters for workload v2.
 * Updates state.filters and calls onReload — does NOT use createProjectFilterRow
 * / patch of NS.load_project_workload_data.
 */

function pwrProjectNS() {
	return frappe.provide("project_workload_assignment.pwrProject");
}

function monthsForPeriodRange(periodRange) {
	switch (periodRange) {
		case "half_year":
			return 6;
		case "year":
			return 12;
		case "quarter":
		default:
			return 3;
	}
}

function computeDateTo(dateFrom, periodRange) {
	return frappe.datetime.add_months(dateFrom, monthsForPeriodRange(periodRange));
}

export function getDefaultProjectFilterArgs(overrides) {
	const dateFrom = frappe.datetime.get_today();
	const periodRange = "quarter";
	return {
		view_type: "daily",
		period_range: periodRange,
		date_from: dateFrom,
		date_to: computeDateTo(dateFrom, periodRange),
		load_actual: 0,
		worker_wtype: "",
		...(overrides || {}),
	};
}

/**
 * Soft-sync state.filters → NS.state for before_save (custom_workload_date_*).
 * NS.syncGlobals may mirror NS.state onto window.* for legacy helpers — v2 itself
 * reads only state.filters (no window.pwrShowFact / pwrWorkerWtype writes here).
 */
function syncFiltersToLegacyNS(state) {
	const f = state?.filters || {};
	const NS = pwrProjectNS();
	const s = NS.state;
	if (!s) return;
	if (f.view_type) s.currentViewType = f.view_type;
	if (f.period_range) s.currentPeriodRange = f.period_range;
	if (f.date_from) s.displayDateFrom = f.date_from;
	if (f.date_to) s.displayDateTo = f.date_to;
	if (typeof NS.syncGlobals === "function") {
		NS.syncGlobals();
	}
}

function ensureProjectFilters(state) {
	if (!state.filters || !Object.keys(state.filters).length) {
		state.filters = getDefaultProjectFilterArgs();
	} else {
		const f = state.filters;
		if (!f.date_from) f.date_from = frappe.datetime.get_today();
		if (!f.period_range) f.period_range = "quarter";
		if (!f.date_to) f.date_to = computeDateTo(f.date_from, f.period_range);
		if (!f.view_type) f.view_type = "daily";
	}
	syncFiltersToLegacyNS(state);
	return state.filters;
}

function appendSelect(row, labelText, options, current, className, onChange) {
	const label = document.createElement("label");
	label.className = "mr-2 mb-0";
	label.textContent = labelText;
	row.appendChild(label);

	const select = document.createElement("select");
	select.className = `form-control form-control-sm ${className}`;
	select.style.width = "auto";
	select.style.minWidth = "110px";

	options.forEach((opt) => {
		const o = document.createElement("option");
		o.value = opt.value;
		o.textContent = opt.label;
		select.appendChild(o);
	});

	select.value = current;
	select.addEventListener("change", () => onChange(select.value));
	row.appendChild(select);
	return select;
}

function updatePeriodLabel(el, state) {
	if (!el) return;
	const f = state.filters || {};
	if (f.date_from && f.date_to) {
		el.textContent = `${frappe.datetime.str_to_user(f.date_from)} — ${frappe.datetime.str_to_user(f.date_to)}`;
	} else {
		el.textContent = "";
	}
}

export function initFilters(ctx) {
	const { state, $wrapper, onReload } = ctx || {};
	if (!state || !$wrapper || !$wrapper.length) {
		return;
	}

	ensureProjectFilters(state);

	let filtersEl = state.filtersEl;
	if (!filtersEl) {
		const host = document.createElement("div");
		host.className = "workload-project-filters";
		host.setAttribute("data-workload-filters", "1");
		$wrapper.prepend(host);
		filtersEl = host;
		state.filtersEl = filtersEl;
	}

	filtersEl.replaceChildren();

	const reload = () => {
		syncFiltersToLegacyNS(state);
		if (typeof onReload === "function") {
			void onReload();
		}
	};

	const row = document.createElement("div");
	row.className =
		"workload-project-filters-row unified-filters-row d-flex align-items-center flex-wrap pt-1 pb-1";

	const periodLabel = document.createElement("span");
	periodLabel.className = "workload-filter-period-label text-muted mx-2 small";
	updatePeriodLabel(periodLabel, state);

	const viewTypeSelect = appendSelect(
		row,
		__("View"),
		[
			{ value: "daily", label: __("Daily") },
			{ value: "weekly", label: __("Weekly") },
			{ value: "monthly", label: __("Monthly") },
		],
		state.filters.view_type || "daily",
		"workload-filter-view-type",
		(value) => {
			state.filters.view_type = value;
			reload();
		}
	);

	const periodRangeSelect = appendSelect(
		row,
		__("Period"),
		[
			{ value: "quarter", label: __("Quarter") },
			{ value: "half_year", label: __("Half Year") },
			{ value: "year", label: __("Year") },
		],
		state.filters.period_range || "quarter",
		"workload-filter-period-range",
		(value) => {
			state.filters.period_range = value;
			state.filters.date_from = frappe.datetime.get_today();
			state.filters.date_to = computeDateTo(
				state.filters.date_from,
				state.filters.period_range
			);
			updatePeriodLabel(periodLabel, state);
			reload();
		}
	);

	const workerSelect = appendSelect(
		row,
		__("Worker type"),
		[
			{ value: "", label: __("All") },
			{ value: "Employee", label: __("Employee") },
			{ value: "Supplier", label: __("Supplier") },
		],
		state.filters.worker_wtype || "",
		"workload-filter-worker-wtype",
		(value) => {
			state.filters.worker_wtype = value;
			reload();
		}
	);

	const periodNav = document.createElement("div");
	periodNav.className =
		"workload-filter-period-nav d-inline-flex align-items-center flex-shrink-0 ml-2";

	const prevBtn = document.createElement("button");
	prevBtn.type = "button";
	prevBtn.className = "btn btn-xs btn-default";
	prevBtn.textContent = "<";
	prevBtn.title = __("Previous month");

	const nextBtn = document.createElement("button");
	nextBtn.type = "button";
	nextBtn.className = "btn btn-xs btn-default";
	nextBtn.textContent = ">";
	nextBtn.title = __("Next month");

	const shiftPeriod = (direction) => {
		const f = state.filters;
		f.date_from = frappe.datetime.add_months(f.date_from, direction);
		f.date_to = frappe.datetime.add_months(f.date_to, direction);
		updatePeriodLabel(periodLabel, state);
		reload();
	};

	prevBtn.addEventListener("click", () => shiftPeriod(-1));
	nextBtn.addEventListener("click", () => shiftPeriod(1));

	periodNav.appendChild(prevBtn);
	periodNav.appendChild(periodLabel);
	periodNav.appendChild(nextBtn);
	row.appendChild(periodNav);

	const reloadBtn = document.createElement("button");
	reloadBtn.type = "button";
	reloadBtn.className = "btn btn-default btn-sm ml-2";
	reloadBtn.textContent = __("Reload");
	reloadBtn.title = __("Refresh Data");
	reloadBtn.addEventListener("click", reload);
	row.appendChild(reloadBtn);

	filtersEl.appendChild(row);
	state.filterControls = {
		viewTypeSelect,
		periodRangeSelect,
		workerSelect,
		prevBtn,
		nextBtn,
		periodLabel,
		reloadBtn,
	};
}

export function getFilterArgs(stateOrCtx) {
	const state = stateOrCtx?.filters != null ? stateOrCtx : stateOrCtx?.state;
	if (state?.filters && Object.keys(state.filters).length) {
		const f = state.filters;
		return {
			view_type: f.view_type || "daily",
			date_from: f.date_from || null,
			date_to: f.date_to || null,
			load_actual: f.load_actual != null ? f.load_actual : 0,
			worker_wtype: f.worker_wtype || "",
			period_range: f.period_range || "quarter",
		};
	}

	// Fallback before initFilters (should be rare) — NS.state only, no window.*
	const defaults = getDefaultProjectFilterArgs();
	const NS = pwrProjectNS();
	const s = NS.state || {};

	return {
		view_type: s.currentViewType || defaults.view_type,
		date_from: s.displayDateFrom || defaults.date_from,
		date_to: s.displayDateTo || defaults.date_to,
		load_actual: defaults.load_actual,
		worker_wtype: "",
		period_range: s.currentPeriodRange || defaults.period_range,
	};
}
