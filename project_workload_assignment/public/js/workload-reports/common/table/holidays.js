const _isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

/** Prefer period.date / start_date for daily holiday lookup (keys may be non-ISO). */
export const periodDateKey = (period) => {
	if (!period) return "";
	if (_isIsoDate(period.date)) return period.date;
	if (_isIsoDate(period.start_date) && period.start_date === period.end_date) {
		return period.start_date;
	}
	if (_isIsoDate(period.key)) return period.key;
	return "";
};

export const getHolidaysForRow = (row) => {
	if (!row) return [];
	const userHolidays = row.userHolidays || [];
	const projectHolidays = row.projectHolidays || [];

	if (row.kind === "user" || row.kind === "absence") {
		return userHolidays;
	}
	if (row.kind === "project") {
		return projectHolidays;
	}
	if (userHolidays.length || projectHolidays.length) {
		return projectHolidays.concat(userHolidays);
	}
	return [];
};

const _isNonWorkingDay = (dateStr, holidays) => {
	if (!dateStr || !holidays?.length) return false;
	for (const holiday of holidays) {
		if (holiday?.date === dateStr) return true;
	}
	return false;
};

export const isHoliday = (row, dateKey) => {
	if (!row || !_isIsoDate(dateKey)) return false;
	return _isNonWorkingDay(dateKey, getHolidaysForRow(row));
};
