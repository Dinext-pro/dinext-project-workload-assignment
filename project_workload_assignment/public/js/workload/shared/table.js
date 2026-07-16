import { createOnExpandRow } from "./tree.js";
import { setupLoadMore, teardownLoadMore } from "./paging.js";
import { getParticipantColumn } from "./columns.js";
import {
	applyParticipantWidth,
	createParticipantWidthHandler,
	withParticipantWidth,
} from "./participant-width.js";

export {
	applyParticipantWidth,
	persistParticipantWidthFromEvent,
	createParticipantWidthHandler,
	withParticipantWidth,
} from "./participant-width.js";

export async function createTable({
	container,
	state,
	data,
	columns,
	onExpandRow,
	onCellDoubleClicked,
}) {
	if (!container) {
		throw new Error("workload.createTable: container required");
	}

	await frappe.require(["dinext-table.bundle.js"]);

	if (state?.table) {
		destroyTable(state);
	}

	const expandHandler =
		onExpandRow || (state ? createOnExpandRow(state) : undefined);

	const cols = withParticipantWidth(columns || [getParticipantColumn()], state);

	const createOpts = {
		container,
		data: data || [],
		columns: cols,
		edit: false,
		selection: { enabled: false },
		rowReorder: { enabled: false },
		onExpandRow: expandHandler,
		theme: {
			cellHorizontalPadding: 6,
		},
		gridOptions: {
			rowHeight: 28,
			headerHeight: 32,
			onColumnResized: state ? createParticipantWidthHandler(state) : undefined,
		},
	};
	if (typeof onCellDoubleClicked === "function") {
		createOpts.onCellDoubleClicked = onCellDoubleClicked;
	}

	const table = await DinextTable.create(createOpts);

	if (state) {
		state.table = table;
		setupLoadMore(state, table);
		applyParticipantWidth(state, table);
	}
	return table;
}

export function refreshTable(state, opts) {
	const table = state?.table;
	if (!table) return;

	const columns = opts?.columns
		? withParticipantWidth(opts.columns, state)
		: undefined;
	const rows = opts?.rows != null ? opts.rows : state.rows;

	if (opts?.collapseAll && typeof table.collapseAll === "function") {
		table.collapseAll();
	}

	if (columns && typeof table.setOption === "function") {
		table.setOption("columns", columns);
	}
	if (typeof table.refresh === "function") {
		table.refresh(rows || []);
	}
	applyParticipantWidth(state, table);
}

export function destroyTable(state) {
	if (!state) return;
	teardownLoadMore(state);
	const table = state.table;
	if (!table) {
		return;
	}
	if (typeof table.destroy === "function") {
		table.destroy();
	}
	state.table = null;
}
