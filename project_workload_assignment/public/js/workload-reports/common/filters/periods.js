export const VIEW_OPTIONS = [
	{ value: "daily", label: __("Daily") },
	{ value: "weekly", label: __("Weekly") },
	{ value: "monthly", label: __("Monthly") },
];

export const PERIOD_OPTIONS = [
	{ value: "quarter", label: __("Quarter") },
	{ value: "half_year", label: __("Half Year") },
	{ value: "year", label: __("Year") },
];

export const WORKER_OPTIONS = [
	{ value: "", label: __("All", null, "workload worker type") },
	{ value: "Employee", label: __("Employee") },
	{ value: "Supplier", label: __("Supplier") },
];

const VIEW_TYPE_VALUES = new Set(["daily", "weekly", "monthly"]);
const PERIOD_RANGE_VALUES = new Set(["quarter", "half_year", "year"]);

function _bootChoice(bootKey, allowed, fallback) {
	const raw = String(frappe?.boot?.[bootKey] || "").trim().toLowerCase();
	if (allowed.has(raw)) {
		return raw;
	}
	const fb = String(fallback || "").trim().toLowerCase();
	return allowed.has(fb) ? fb : [...allowed][0];
}

/** site_config client_config.workload_default_view_type, else surface fallback. */
export function getDefaultViewType(fallback = "weekly") {
	return _bootChoice("workload_default_view_type", VIEW_TYPE_VALUES, fallback);
}

/** site_config client_config.workload_default_period_range, else quarter. */
export function getDefaultPeriodRange(fallback = "quarter") {
	return _bootChoice("workload_default_period_range", PERIOD_RANGE_VALUES, fallback);
}

const PERIOD_MONTHS = { quarter: 3, half_year: 6, year: 12 };

const _today = () => frappe.datetime.get_today();

const _dateTo = (dateFrom, periodRange) => frappe.datetime.add_months(dateFrom, PERIOD_MONTHS[periodRange] || 3);

export const shiftMonth = (date, direction) => frappe.datetime.add_months(date, direction);

export const projectsDefaults = () => ({
	user: "",
	project: "",
	project_portfolio: "",
	user_group: "",
	worker_wtype: "",
	project_role_filters: [],
	load_actual: 0,
	view_type: getDefaultViewType("weekly"),
	period_range: getDefaultPeriodRange("quarter"),
	period_anchor_date: _today(),
})

export const projectDefaults = () => {
	const date_from = _today();
	const period_range = getDefaultPeriodRange("quarter");
	return {
		worker_wtype: "",
		project_role_filters: [],
		load_actual: 0,
		consider_limit: 1,
		consider_virtuals: 0,
		view_type: getDefaultViewType("daily"),
		period_range,
		date_from,
		date_to: _dateTo(date_from, period_range),
	};
};

export const resetProjectsAnchor = (args) => { args.period_anchor_date = _today() };

export const resetProjectWindow = (args) => {
	args.date_from = _today();
	args.date_to = _dateTo(args.date_from, args.period_range);
};
