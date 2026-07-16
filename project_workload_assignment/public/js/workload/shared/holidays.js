/** Holidays from adapter row fields (userHolidays / projectHolidays). */

function isIsoDateKey(periodKey) {
	return /^\d{4}-\d{2}-\d{2}$/.test(String(periodKey || ""));
}

export function getHolidaysForRow(row) {
	if (!row) return [];

	const userHolidays = row.userHolidays || [];
	const projectHolidays = row.projectHolidays || [];

	if (row.kind === "user" || row.kind === "absence") {
		return userHolidays;
	}

	if (row.kind === "project") {
		if (!userHolidays.length) return projectHolidays;
		if (!projectHolidays.length) return userHolidays;
		return projectHolidays.concat(userHolidays);
	}

	if (userHolidays.length || projectHolidays.length) {
		return projectHolidays.concat(userHolidays);
	}
	return [];
}

export function isNonWorkingDay(dateStr, holidays) {
	if (!dateStr || !holidays || !holidays.length) return false;
	for (let i = 0; i < holidays.length; i++) {
		const holiday = holidays[i];
		if (holiday && holiday.date === dateStr) return true;
	}
	return false;
}

/** True when daily period key is a non-working day for this row. */
export function isHoliday(row, periodKey) {
	if (!row || !isIsoDateKey(periodKey)) return false;
	return isNonWorkingDay(periodKey, getHolidaysForRow(row));
}
