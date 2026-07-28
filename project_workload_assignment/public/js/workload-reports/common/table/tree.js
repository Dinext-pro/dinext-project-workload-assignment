import { toTableRows } from "./rows.js";

const _resolveEmail = (rowId, row) => {
	if (row?.email) return String(row.email);
	const id = String(rowId || row?.id || "");
	if (id.startsWith("user|")) return id.slice(5);
	if (id.startsWith("user:")) return id.slice(5);
	return "";
};

const _findRowByPath = (rows, rowId) => {
	const parts = String(rowId || "").split(":");
	let list = rows || [];
	let row = null;
	for (let i = 0; i < parts.length; i++) {
		row = list.find((item) => String(item?.id) === parts[i]);
		if (!row) return null;
		if (i < parts.length - 1) {
			list = row.children || [];
		}
	}
	return row;
};

const _sortByDepth = (ids) =>
	[...ids].sort((a, b) => String(a).split(":").length - String(b).split(":").length);

/**
 * Lazy expand for projects page: user row → fetch user_projects → setRowChildren.
 * Project tab needs no handler — children already nested in getProjectData.
 */
export function createProjectsExpandHandler({ getFilters, fetchUserProjects }) {
	const loaded = Object.create(null);

	const reset = () => {
		for (const key of Object.keys(loaded)) {
			delete loaded[key];
		}
	};

	const _fetchUserChildren = async (email) => {
		const grid = await fetchUserProjects({
			...getFilters(),
			detail_user: email,
		});
		return toTableRows(grid.rows || []);
	};

	const onExpandRow = async ({ rowId, row, table }) => {
		const email = _resolveEmail(rowId, row);
		if (!email || !table) return;

		const sourceRow =
			typeof table.findSourceRow === "function" ? table.findSourceRow(rowId) : row;
		const existing = sourceRow?.children;

		if (loaded[email] && Array.isArray(existing) && existing.length) {
			table.setRowChildren(rowId, existing);
			return;
		}

		const children = await _fetchUserChildren(email);
		table.setRowChildren(rowId, children);
		loaded[email] = true;

		if (sourceRow) {
			sourceRow.children = children;
		} else if (row) {
			row.children = children;
		}
	};

	/**
	 * Prefetch lazy user children onto root `rows` before one table.refresh.
	 * Keeps expandedIds unchanged → no collapse/re-expand flash.
	 * Only root user ids (path depth 1) hit API; nested come with that payload.
	 */
	const hydrateExpanded = async (rows, expandedIds) => {
		const ids = _sortByDepth(expandedIds || []);
		for (const rowId of ids) {
			if (String(rowId).includes(":")) {
				continue;
			}
			const row = _findRowByPath(rows, rowId);
			if (!row) continue;
			const email = _resolveEmail(rowId, row);
			if (!email) continue;

			const children = await _fetchUserChildren(email);
			row.children = children;
			loaded[email] = true;
		}
		return rows;
	};

	return { onExpandRow, reset, hydrateExpanded };
}
