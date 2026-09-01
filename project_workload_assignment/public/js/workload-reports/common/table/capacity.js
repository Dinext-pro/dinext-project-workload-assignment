/**
 * Available hours + load % for a period cell.
 * Business rules from legacy PWR columns (daily / weekly / monthly).
 */
import { isHoliday } from "./holidays.js";

const DEFAULT_DAY_HOURS = 8;
const DEFAULT_WEEK_HOURS = 40;
const DEFAULT_MONTH_HOURS = 160;

const _num = (value) => {
	const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
	return Number.isFinite(n) ? n : 0;
};

/** Partial-day absence reduces base; full middle day → 0. */
export const getAvailableHoursOnDate = (row, dateStr, baseHours) => {
	const absences = row?.absences;
	if (!absences?.length) return baseHours;

	for (const absence of absences) {
		if (!absence?.from_date || !absence?.to_date) continue;
		if (dateStr < absence.from_date || dateStr > absence.to_date) continue;

		if (dateStr === absence.from_date && absence.alfrom_hours) {
			return Math.max(0, baseHours - _num(absence.alfrom_hours));
		}
		if (dateStr === absence.to_date && absence.alto_hours) {
			return Math.max(0, baseHours - _num(absence.alto_hours));
		}
		return 0;
	}
	return baseHours;
};

const _baseHoursOnDate = (row, dateStr) => {
	const map = row?.workingHours || {};
	const raw = map[dateStr];
	return raw !== undefined && raw !== null ? _num(raw) : DEFAULT_DAY_HOURS;
};

const _sumAvailableInRange = (row, startDate, endDate) => {
	if (!startDate || !endDate) return 0;
	let total = 0;
	let cur = startDate;
	while (cur <= endDate) {
		if (!isHoliday(row, cur)) {
			const base = _baseHoursOnDate(row, cur);
			total += getAvailableHoursOnDate(row, cur, base);
		}
		cur = frappe.datetime.add_days(cur, 1);
	}
	return total;
};

/**
 * @returns {{ availableHours: number, percentage: number, tooltip: string }}
 */
export const resolvePeriodLoad = (row, period, planHours, viewType) => {
	const hours = _num(planHours);
	const unit = __("h");
	let availableHours = 0;
	let tooltip = "";

	if (viewType === "daily") {
		const dateKey = period?.date || period?.start_date || "";
		const baseHours = _baseHoursOnDate(row, dateKey);
		availableHours = getAvailableHoursOnDate(row, dateKey, baseHours);
		const parts = [`${__("Base working hours")}: ${baseHours.toFixed(1)}${unit}`];
		if (availableHours !== baseHours) {
			parts.push(`${__("Absence hours")}: ${(baseHours - availableHours).toFixed(1)}${unit}`);
			parts.push(`${__("Available hours")}: ${availableHours.toFixed(1)}${unit}`);
		}
		const pct = availableHours > 0 ? Math.round((hours / availableHours) * 100) : 0;
		parts.push(`${__("Workload")}: ${hours.toFixed(1)}${unit} (${pct}%)`);
		tooltip = parts.join("\n");
		return { availableHours, percentage: pct, tooltip };
	}

	if (viewType === "weekly") {
		availableHours = DEFAULT_WEEK_HOURS;
		const calculated = _sumAvailableInRange(row, period?.start_date, period?.end_date);
		if (calculated > 0) availableHours = calculated;
		const pct = availableHours > 0 ? Math.round((hours / availableHours) * 100) : 0;
		tooltip = `${__("Weekly available hours")}: ${availableHours.toFixed(1)}${unit}\n${__("Workload")}: ${hours.toFixed(1)}${unit} (${pct}%)`;
		return { availableHours, percentage: pct, tooltip };
	}

	// monthly (default)
	availableHours = DEFAULT_MONTH_HOURS;
	const calculated = _sumAvailableInRange(row, period?.start_date, period?.end_date);
	if (calculated > 0) availableHours = calculated;
	const pct = availableHours > 0 ? Math.round((hours / availableHours) * 100) : 0;
	tooltip = `${__("Monthly available hours")}: ${availableHours.toFixed(1)}${unit}\n${__("Workload")}: ${hours.toFixed(1)}${unit} (${pct}%)`;
	return { availableHours, percentage: pct, tooltip };
};
