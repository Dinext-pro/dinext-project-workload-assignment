const _isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

/**
 * @returns {{ isAbsent: true, type: string } | null}
 */
export const getAbsence = (row, dateKey) => {
	if (!row || !_isIsoDate(dateKey)) return null;
	const absences = row.absences;
	if (!absences?.length) return null;

	for (const absence of absences) {
		if (!absence?.from_date || !absence?.to_date) continue;
		if (dateKey >= absence.from_date && dateKey <= absence.to_date) {
			return {
				isAbsent: true,
				type: absence.type || __("Absence"),
				alfrom_hours: absence.alfrom_hours,
				alto_hours: absence.alto_hours,
			};
		}
	}
	return null;
};

export const formatAbsenceText = () => __("Abs.");
