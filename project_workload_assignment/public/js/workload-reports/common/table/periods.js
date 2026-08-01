const _monthNames = () => [
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

const _dayNames = () => [
	__("Sun"),
	__("Mon"),
	__("Tue"),
	__("Wed"),
	__("Thu"),
	__("Fri"),
	__("Sat"),
];

const _fmtDayMonth = (date) => `${date.getDate()}.${date.getMonth() + 1}`;

/** Two-level header parts { top, bottom } — ignore wire period.label (often "a-b"). */
export const periodHeaderParts = (period, viewType) => {
	if (!period) return { top: "", bottom: "" };

	const vt = viewType || period.view_type;

	if (vt === "daily" || period.date) {
		const dateString = period.date || period.start_date;
		if (!dateString) return { top: period.key || "", bottom: "" };
		const dateObj = frappe.datetime.str_to_obj(dateString);
		const dayMonth = frappe.datetime.str_to_user(dateString).split("-").slice(0, 2).join(".");
		const weekday = _dayNames()[dateObj.getDay()] || "";
		return { top: dayMonth, bottom: weekday };
	}

	if (vt === "weekly" || period.week != null) {
		if (!period.start_date || !period.end_date) {
			return { top: period.key || "", bottom: "" };
		}
		const startDate = frappe.datetime.str_to_obj(period.start_date);
		const endDate = frappe.datetime.str_to_obj(period.end_date);
		return { top: _fmtDayMonth(startDate), bottom: _fmtDayMonth(endDate) };
	}

	if (vt === "monthly" || (period.month != null && period.year != null)) {
		const names = _monthNames();
		const name = names[period.month - 1] || String(period.month);
		return { top: name, bottom: String(period.year) };
	}

	if (period.start_date && period.end_date && period.start_date !== period.end_date) {
		const startDate = frappe.datetime.str_to_obj(period.start_date);
		const endDate = frappe.datetime.str_to_obj(period.end_date);
		return { top: _fmtDayMonth(startDate), bottom: _fmtDayMonth(endDate) };
	}

	if (period.start_date) {
		const dateObj = frappe.datetime.str_to_obj(period.start_date);
		const dayMonth = frappe.datetime.str_to_user(period.start_date).split("-").slice(0, 2).join(".");
		return { top: dayMonth, bottom: _dayNames()[dateObj.getDay()] || "" };
	}

	return { top: period.key || "", bottom: "" };
};

export const CURRENT_PERIOD_HEADER_CLASS = "wr-header--current";

export const resolveCurrentPeriodKey = (periods, viewType) => {
	if (!periods?.length || !frappe.datetime?.get_today || !frappe.datetime?.str_to_obj) {
		return null;
	}
	const todayStr = frappe.datetime.get_today();
	const today = frappe.datetime.str_to_obj(todayStr);

	for (const period of periods) {
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
};
