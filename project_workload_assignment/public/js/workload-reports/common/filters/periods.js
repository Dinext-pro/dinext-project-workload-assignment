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
	{ value: "", label: __("All") },
	{ value: "Employee", label: __("Employee") },
	{ value: "Supplier", label: __("Supplier") },
];

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
	view_type: "weekly",
	period_range: "quarter",
	period_anchor_date: _today(),
})

export const projectDefaults = () => {
	const date_from = _today();
	const period_range = "quarter";
	return {
		worker_wtype: "",
		project_role_filters: [],
		load_actual: 0,
		view_type: "daily",
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
