const LABEL_COL_ID = "label";

export function persistParticipantWidthFromEvent(state, params) {
	if (!state || !params?.finished) return;
	const col = params.column;
	if (!col) return;
	const colId = typeof col.getColId === "function" ? col.getColId() : "";
	if (colId !== LABEL_COL_ID && colId !== "participant") return;
	const width = typeof col.getActualWidth === "function" ? col.getActualWidth() : 0;
	if (Number.isFinite(width) && width > 0) {
		state.participantWidth = width;
	}
}

export function createParticipantWidthHandler(state) {
	return (params) => persistParticipantWidthFromEvent(state, params);
}

export function applyParticipantWidth(state, table) {
	const t = table || state?.table;
	const width = Number(state?.participantWidth);
	if (!t?.api || !Number.isFinite(width) || width <= 0) return;

	if (typeof t.api.setColumnWidths === "function") {
		t.api.setColumnWidths([{ key: LABEL_COL_ID, newWidth: width }]);
		return;
	}
	if (typeof t.api.applyColumnState === "function") {
		t.api.applyColumnState({
			state: [{ colId: LABEL_COL_ID, width }],
			applyOrder: false,
		});
		return;
	}
	const col =
		typeof t.api.getColumn === "function" ? t.api.getColumn(LABEL_COL_ID) : null;
	if (col && typeof col.setActualWidth === "function") {
		col.setActualWidth(width);
	}
}

export function withParticipantWidth(columns, state) {
	const width = Number(state?.participantWidth);
	if (!Number.isFinite(width) || width <= 0 || !Array.isArray(columns)) {
		return columns || [];
	}
	return columns.map((col) => {
		if (!col || (col.field !== "label" && col.colId !== LABEL_COL_ID)) {
			return col;
		}
		const next = { ...col, width };
		delete next.flex;
		return next;
	});
}

export { LABEL_COL_ID };
