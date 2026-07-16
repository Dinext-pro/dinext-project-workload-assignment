// Row id separator — not `:` (tree path splits on colon).
export const ROW_ID_SEP = "\x1f";

export const SUMMARY_ROW_ID = "summary-total";

export const MERGE_GROUP = {
    idField: "merge_group_id",
    indexField: "merge_group_index",
    sizeField: "merge_group_size",
};

export const PERIOD_FIELD_RE = /^(plan|forecast|fact|actual|delta)_/;
