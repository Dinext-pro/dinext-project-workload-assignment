// Row id separator — not `:` (tree path splits on colon).
export const ROW_ID_SEP = "\x1f";

/** Matches API `WE_V2_SUMMARY_ROW_ID` in work_efforts/summary.py */
export const SUMMARY_ROW_ID = "we-total";

export function isSummaryRow(row) {
	if (!row) {
		return true;
	}
	return (
		row.merge_group_id === SUMMARY_ROW_ID
		|| row.id === SUMMARY_ROW_ID
		|| row.task_id === SUMMARY_ROW_ID
	);
}

export const MERGE_GROUP = {
	idField: "merge_group_id",
	indexField: "merge_group_index",
	sizeField: "merge_group_size",
};

export const PERIOD_FIELD_RE = /^(plan|forecast|fact|actual|delta)_/;
