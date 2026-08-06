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

/** Select / API view-option labels (EN source; ru.csv for RU UI). */
export const VIEW_OPTION_FORECAST_AND_FACT = "Forecast and Fact";
export const VIEW_OPTION_FORECAST_ONLY = "Forecast Only";
export const VIEW_OPTION_FACT_ONLY = "Fact Only";

/** Map UI label (any legacy lang) → API view_mode. */
export function normalizeViewMode(viewOptions) {
	const v = String(viewOptions || "").trim();
	if (
		v === "forecast_only"
		|| v === VIEW_OPTION_FORECAST_ONLY
		|| v === "Только прогноз"
	) {
		return "forecast_only";
	}
	if (
		v === "fact_only"
		|| v === VIEW_OPTION_FACT_ONLY
		|| v === "Actual Only"
		|| v === "Только факт"
	) {
		return "fact_only";
	}
	return "forecast_and_fact";
}
