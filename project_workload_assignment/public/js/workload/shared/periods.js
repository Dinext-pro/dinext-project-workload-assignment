const MONTH_NAMES = () => [
	__("Jan"),
	__("Feb"),
	__("Mar"),
	__("Apr"),
	__("May"),
	__("Jun"),
	__("Jul"),
	__("Aug"),
	__("Sep"),
	__("Oct"),
	__("Nov"),
	__("Dec"),
];

const DAY_NAMES = () => [
	__("Sun"),
	__("Mon"),
	__("Tue"),
	__("Wed"),
	__("Thu"),
	__("Fri"),
	__("Sat"),
];

export function formatMonthHeader(year, month) {
	if (!year || !month) return "";
	const names = MONTH_NAMES();
	const name = names[month - 1] || String(month);
	return `${name} ${year}`;
}

export function formatWeekHeader(period) {
	if (!period?.start_date || !period?.end_date) return "";
	const startDate = frappe.datetime.str_to_obj(period.start_date);
	const endDate = frappe.datetime.str_to_obj(period.end_date);
	const fmt = (date) => `${date.getDate()}.${date.getMonth() + 1}`;
	return `${fmt(startDate)} – ${fmt(endDate)}`;
}

export function formatDateHeader(dateString) {
	if (!dateString) return "";
	const dateObj = frappe.datetime.str_to_obj(dateString);
	const dayMonth = frappe.datetime.str_to_user(dateString).split("-").slice(0, 2).join(".");
	const weekday = DAY_NAMES()[dateObj.getDay()] || "";
	return `${dayMonth} ${weekday}`.trim();
}

export function formatPeriodHeader(period, viewType) {
	if (!period) return "";
	if (period.label) return period.label;

	const vt = viewType || period.view_type;

	if (vt === "daily" || period.date) {
		return formatDateHeader(period.date || period.start_date);
	}
	if (vt === "weekly" || period.week != null) {
		return formatWeekHeader(period);
	}
	if (vt === "monthly" || (period.month != null && period.year != null)) {
		return formatMonthHeader(period.year, period.month);
	}

	// Fallback: week-style range if dates present
	if (period.start_date && period.end_date && period.start_date !== period.end_date) {
		return formatWeekHeader(period);
	}
	if (period.start_date) {
		return formatDateHeader(period.start_date);
	}
	return period.key || "";
}

export function resolveCurrentPeriodKey(periods, viewType) {
	if (!periods?.length || !frappe.datetime?.get_today || !frappe.datetime?.str_to_obj) {
		return null;
	}
	const todayStr = frappe.datetime.get_today();
	const today = frappe.datetime.str_to_obj(todayStr);

	for (let i = 0; i < periods.length; i++) {
		const period = periods[i];
		if (!period) continue;
		const vt = viewType || period.view_type;

		if (vt === "daily") {
			if ((period.date || period.start_date) === todayStr) {
				return period.key;
			}
			continue;
		}

		if (vt === "weekly") {
			if (!period.start_date || !period.end_date) continue;
			const start = frappe.datetime.str_to_obj(period.start_date);
			const end = frappe.datetime.str_to_obj(period.end_date);
			if (today >= start && today <= end) {
				return period.key;
			}
			continue;
		}

		// monthly (default when not daily/weekly)
		if (
			period.year === today.getFullYear() &&
			Number(period.month) === today.getMonth() + 1
		) {
			return period.key;
		}
		if (period.start_date && period.end_date && !period.month) {
			const start = frappe.datetime.str_to_obj(period.start_date);
			const end = frappe.datetime.str_to_obj(period.end_date);
			if (today >= start && today <= end) {
				return period.key;
			}
		}
	}
	return null;
}

export const CURRENT_PERIOD_HEADER_CLASS = "workload-header--current";
