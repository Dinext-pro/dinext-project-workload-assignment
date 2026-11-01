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

/** ISS-2026-03483: база % от трудоёмкости. */
export const WORKLOAD_BASE_PLAN = "От плана";
export const WORKLOAD_BASE_FORECAST = "От прогноза";
export const WORKLOAD_BASE_BY_PROJECT = "По проекту";

/** Вкладка Project: только план / прогноз. */
export function getWorkloadBaseOptions() {
	return [
		{ value: WORKLOAD_BASE_PLAN, label: __(WORKLOAD_BASE_PLAN) },
		{ value: WORKLOAD_BASE_FORECAST, label: __(WORKLOAD_BASE_FORECAST) },
	];
}

/** Сводный отчёт: + «По проекту» (default). */
export function getReportWorkloadBaseOptions() {
	return [
		{ value: WORKLOAD_BASE_BY_PROJECT, label: __(WORKLOAD_BASE_BY_PROJECT) },
		{ value: WORKLOAD_BASE_PLAN, label: __(WORKLOAD_BASE_PLAN) },
		{ value: WORKLOAD_BASE_FORECAST, label: __(WORKLOAD_BASE_FORECAST) },
	];
}

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

/**
 * Project setting / filter init: boot.workload_default_base, else «От плана».
 * Accepts Russian options or plan/forecast aliases from client_config.
 */
export function getDefaultWorkloadBase(fallback = WORKLOAD_BASE_PLAN) {
	const raw = String(frappe?.boot?.workload_default_base || "").trim();
	if (raw === WORKLOAD_BASE_PLAN || raw === WORKLOAD_BASE_FORECAST) {
		return raw;
	}
	const key = raw.toLowerCase();
	if (key === "plan" || key === "from plan" || key === "от плана") {
		return WORKLOAD_BASE_PLAN;
	}
	if (key === "forecast" || key === "from forecast" || key === "от прогноза") {
		return WORKLOAD_BASE_FORECAST;
	}
	return fallback === WORKLOAD_BASE_FORECAST ? WORKLOAD_BASE_FORECAST : WORKLOAD_BASE_PLAN;
}

/** Resolve Project.custom_workload_base (empty → site default). */
export function resolveProjectWorkloadBase(docValue) {
	const raw = String(docValue || "").trim();
	if (raw === WORKLOAD_BASE_PLAN || raw === WORKLOAD_BASE_FORECAST) {
		return raw;
	}
	return getDefaultWorkloadBase();
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
	workload_base: WORKLOAD_BASE_BY_PROJECT,
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
		workload_base: getDefaultWorkloadBase(),
		view_type: getDefaultViewType("weekly"),
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
