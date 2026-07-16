import { getDefaultFilterArgs } from "./data.js";

function appendSelect(row, labelText, options, current, className, onChange) {
	const label = document.createElement("label");
	label.className = "mr-2 mb-0";
	label.textContent = labelText;
	row.appendChild(label);

	const select = document.createElement("select");
	select.className = `form-control form-control-sm ${className}`;
	select.style.width = "auto";
	select.style.minWidth = "120px";

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

export function initFilters(ctx) {
	const { state, onReload } = ctx || {};
	if (!state?.filtersEl) {
		return;
	}

	const el = state.filtersEl;
	el.replaceChildren();

	if (!state.filters || !Object.keys(state.filters).length) {
		state.filters = getDefaultFilterArgs();
	}

	const row = document.createElement("div");
	row.className = "workload-report-filters-row d-flex align-items-center flex-wrap";

	const reload = () => {
		if (typeof onReload === "function") {
			void onReload();
		}
	};

	const viewTypeSelect = appendSelect(
		row,
		__("View"),
		[
			{ value: "daily", label: __("Daily") },
			{ value: "weekly", label: __("Weekly") },
			{ value: "monthly", label: __("Monthly") },
		],
		state.filters.view_type || "weekly",
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
			state.filters.period_anchor_date = frappe.datetime.get_today();
			reload();
		}
	);

	const btn = document.createElement("button");
	btn.type = "button";
	btn.className = "btn btn-default btn-sm ml-2";
	btn.textContent = __("Reload");
	btn.title = __("Refresh Data");
	btn.addEventListener("click", reload);
	row.appendChild(btn);

	el.appendChild(row);
	state.filterControls = {
		viewTypeSelect,
		periodRangeSelect,
		reloadBtn: btn,
	};
}
