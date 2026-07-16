import { fetchUserProjects } from "../api/index.js";
import { withLoading } from "./loading.js";

export function resolveUserEmail(rowId, row, state) {
	if (row?.email) return String(row.email);
	if (row?.kind === "user" && row.id && String(row.id).startsWith("user:")) {
		return String(row.id).slice(5);
	}
	const id = String(rowId || "");
	if (id.startsWith("user:")) return id.slice(5);

	const rows = state?.rows || [];
	for (let i = 0; i < rows.length; i++) {
		const r = rows[i];
		if (r && String(r.id) === id) {
			return r.email || (String(r.id).startsWith("user:") ? String(r.id).slice(5) : "");
		}
	}
	return "";
}

export function isProjectDetailsLoaded(state, email) {
	if (!email || !state?.loadedProjectDetailsByUser) return false;
	return !!state.loadedProjectDetailsByUser[email];
}

export function markProjectDetailsLoaded(state, email) {
	if (!state || !email) return;
	if (!state.loadedProjectDetailsByUser) {
		state.loadedProjectDetailsByUser = Object.create(null);
	}
	state.loadedProjectDetailsByUser[email] = true;
}

export function createOnExpandRow(state) {
	return async ({ rowId, row, table }) => {
		const email = resolveUserEmail(rowId, row, state);
		if (!email || !table) return;

		const sourceRow = typeof table.findSourceRow === "function"
			? table.findSourceRow(rowId)
			: row;
		const existing = sourceRow?.children;

		// Already loaded: re-apply cached children (safe if expand path races)
		if (isProjectDetailsLoaded(state, email) && Array.isArray(existing) && existing.length) {
			table.setRowChildren(rowId, existing);
			return;
		}

		const filterArgs = { ...(state.filters || {}) };
		await withLoading(
			state,
			async () => {
				const grid = await fetchUserProjects({
					...filterArgs,
					detail_user: email,
					mode: "user_projects",
				});
				const children = grid.rows || [];
				table.setRowChildren(rowId, children);
				markProjectDetailsLoaded(state, email);

				// Keep state.rows in sync (same objects as sourceData after create)
				if (sourceRow && sourceRow !== row) {
					sourceRow.children = children;
				} else if (row) {
					row.children = children;
				}
			},
			__("Loading projects...")
		);
	};
}

export function setRowChildren(table, rowId, children) {
	if (table && typeof table.setRowChildren === "function") {
		table.setRowChildren(rowId, children);
	}
}

export function getExpandedIds(table) {
	if (!table?.expandedIds) return [];
	return [...table.expandedIds];
}
