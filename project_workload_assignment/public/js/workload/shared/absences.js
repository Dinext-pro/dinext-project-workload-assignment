/** Absences from adapter row.absences (legacy _absences wire). */

function isIsoDateKey(periodKey) {
	return /^\d{4}-\d{2}-\d{2}$/.test(String(periodKey || ""));
}

/**
 * @returns {{ isAbsent: true, type: string, alfrom_hours?: *, alto_hours?: * } | null}
 */
export function getAbsence(row, periodKey) {
	if (!row || !isIsoDateKey(periodKey)) return null;

	const absences = row.absences;
	if (!absences || !absences.length) return null;

	for (let i = 0; i < absences.length; i++) {
		const absence = absences[i];
		if (!absence || !absence.from_date || !absence.to_date) continue;
		if (periodKey >= absence.from_date && periodKey <= absence.to_date) {
			return {
				isAbsent: true,
				type: absence.type || __("Absence"),
				alfrom_hours: absence.alfrom_hours,
				alto_hours: absence.alto_hours,
			};
		}
	}
	return null;
}

export function formatAbsenceText(_absenceType) {
	return __("Abs.");
}
