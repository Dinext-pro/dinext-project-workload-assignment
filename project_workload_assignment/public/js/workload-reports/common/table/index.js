import { getColumns, getRowHeight } from "./columns.js";
import { toTableRows } from "./rows.js";
import { syncTableHeight, bindTableResize, unbindTableResize } from "./viewport.js";
import { bindLoadMore, unbindLoadMore } from "./paging.js";
import { createOnCellDoubleClicked } from "./navigation.js";
import { flushChartsWhenVisible } from "../charts/index.js";
import { createSpinner } from "../spinner.js";

export { createProjectsExpandHandler } from "./tree.js";
export { PAGE_SIZE } from "./paging.js";

const _ensureBundle = () => frappe.require(["dinext-table.bundle.js"]);

const _getState = (container) => container._wrTable ?? (container._wrTable = {});

const _destroyTable = (state) => {
	if (!state) return;
	// Unbind listeners while API still alive, then destroy grid.
	unbindLoadMore(state);
	unbindTableResize(state);
	const table = state.table;
	state.table = null;
	state.onLoadMore = null;
	state.isLoadingMore = false;
	if (table?.destroy) {
		try {
			table.destroy();
		} catch (_e) {
			/* ignore */
		}
	}
};

export const destroyTable = (container) => {
	if (!container) return;
	const state = container._wrTable;
	if (!state) return;
	_destroyTable(state);
	delete container._wrTable;
	_clearTableChrome(container);
	container.replaceChildren();
};

const TABLE_LOADING = "wr-table--loading";

const _clearTableChrome = (container) => {
	container.classList.remove("text-muted", TABLE_LOADING);
};

const _showLoading = (container, state) => {
	if (state.table) return;
	_clearTableChrome(container);
	container.classList.add(TABLE_LOADING);
	container.replaceChildren();
	container.appendChild(createSpinner());
};

const _showError = (container, err) => {
	_clearTableChrome(container);
	container.classList.add("text-muted");
	container.textContent = err?.message || String(err);
};

const _bindPaging = (container, state) => {
	if (state.onLoadMore) {
		bindLoadMore(container, state);
	} else {
		unbindLoadMore(state);
	}
};

const _snapshotExpandedIds = (table) => {
	if (!table?.expandedIds?.size) return [];
	return [...table.expandedIds];
};

/** Keep open ids that still exist in new source tree (path `id` / `parent:child`). */
const _pruneExpandedIds = (table, rows, expandedIds) => {
	if (!table?.expandedIds) return;
	const next = new Set();
	const find = (list, parts, depth) => {
		if (!list?.length || depth >= parts.length) return null;
		const row = list.find((item) => String(item?.id) === parts[depth]);
		if (!row) return null;
		if (depth === parts.length - 1) return row;
		return find(row.children || [], parts, depth + 1);
	};
	for (const rowId of expandedIds) {
		const parts = String(rowId).split(":");
		if (find(rows, parts, 0)) {
			next.add(String(rowId));
		}
	}
	table.expandedIds.clear();
	for (const id of next) {
		table.expandedIds.add(id);
	}
};

const FS_ROOT_CLASS = "workload-reports-root--fullscreen";

/** After FS layout settles: flex height + near-bottom page check. */
const _afterFullscreenLayout = (container) => {
	requestAnimationFrame(() => {
		syncTableHeight(container);
		container._wrTable?._checkLoadMoreNearBottom?.();
	});
};

const _flushChartsAfterFullscreen = (shell) => {
	const chartsEl = shell?.querySelector?.(".workload-reports-charts");
	if (!chartsEl) return;
	// Wait until :fullscreen / --fullscreen CSS (display:none) is gone and layout painted.
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			flushChartsWhenVisible(chartsEl);
		});
	});
};

/** Fullscreen shell = WR root (filters + table); charts hidden via CSS. */
const _resolveFullscreenOpts = (container) => {
	const shell = container?.closest?.(".workload-reports-root");
	if (!shell) return null;
	return {
		target: "shell",
		shell,
		onEnter: ({ element }) => {
			element?.classList.add(FS_ROOT_CLASS);
			_afterFullscreenLayout(container);
		},
		onExit: ({ element }) => {
			element?.classList.remove(FS_ROOT_CLASS);
			_afterFullscreenLayout(container);
			_flushChartsAfterFullscreen(element || shell);
		},
	};
};

const _createOpts = (container, state, rows, columns, onExpandRow, onReady, toolbar) => {
	const opts = {
		container,
		data: rows,
		columns,
		edit: false,
		selection: { enabled: false },
		rowReorder: { enabled: false },
		theme: {
			columnBorder: false,
			headerColumnBorder: false,
			rowBorder: false,
			headerRowBorder: false,
			pinnedColumnBorder: false,
		},
		gridOptions: {
			rowHeight: getRowHeight(),
			headerHeight: 22,
			groupHeaderHeight: 22,
			enableBrowserTooltips: true,
			tooltipShowDelay: 400,
		},
		onCellDoubleClicked: createOnCellDoubleClicked(state),
		onReady,
	};
	const fullscreen = _resolveFullscreenOpts(container);
	if (fullscreen) {
		opts.fullscreen = fullscreen;
	}
	if (toolbar) {
		opts.toolbar = toolbar;
	}
	if (typeof onExpandRow === "function") {
		opts.onExpandRow = onExpandRow;
	}
	return opts;
};

/**
 * Load / refresh grid into container.
 * Soft reload: hydrate children onto new rows, keep expandedIds, one refresh
 * (no collapse → expand flash).
 * opts: { viewType, showFact, onExpandRow, resetExpand, hydrateExpanded, onLoadMore, preserveExpand, toolbar }
 */
export async function loadTable(container, fetchFn, opts = {}) {
	if (!container) {
		throw new Error("loadTable: container required");
	}

	await _ensureBundle();

	const state = _getState(container);
	const gen = (state.loadGen = (state.loadGen || 0) + 1);
	const showFact = !!opts.showFact;
	const preserveExpand = opts.preserveExpand !== false;

	_showLoading(container, state);
	syncTableHeight(container);

	const expandedIds = preserveExpand ? _snapshotExpandedIds(state.table) : [];
	opts.resetExpand?.();
	state.isLoadingMore = false;

	try {
		const grid = await fetchFn();
		if (gen !== state.loadGen) {
			return;
		}

		const columns = getColumns(grid.periods, {
			viewType: opts.viewType,
			showFact,
			applyLimit: !!opts.applyLimit,
		});
		let rows = toTableRows(grid.rows || []);

		if (
			preserveExpand
			&& expandedIds.length
			&& typeof opts.hydrateExpanded === "function"
		) {
			await opts.hydrateExpanded(rows, expandedIds);
			if (gen !== state.loadGen) {
				return;
			}
		}

		state.rows = rows;
		state.periods = grid.periods || [];
		state.meta = grid.meta || {};
		state.onLoadMore =
			typeof opts.onLoadMore === "function" ? opts.onLoadMore : null;

		if (state.table) {
			if (preserveExpand) {
				_pruneExpandedIds(state.table, rows, expandedIds);
			} else if (state.table.expandedIds) {
				state.table.expandedIds.clear();
			}

			if (typeof state.table.setOption === "function") {
				state.table.setOption("columns", columns);
			}
			if (typeof state.table.setGridOption === "function") {
				state.table.setGridOption("rowHeight", getRowHeight());
			}
			if (typeof state.table.refresh === "function") {
				state.table.refresh(rows);
			}
			state.table.api?.redrawRows?.();
			state.table.api?.refreshCells?.({ force: true });
			_bindPaging(container, state);
		} else {
			_clearTableChrome(container);
			container.replaceChildren();
			syncTableHeight(container);
			const createOpts = _createOpts(
				container,
				state,
				rows,
				columns,
				opts.onExpandRow,
				() => {
					if (gen !== state.loadGen) return;
					syncTableHeight(container);
					_bindPaging(container, state);
				},
				opts.toolbar
			);
			if (preserveExpand && expandedIds.length) {
				createOpts.expandedIds = expandedIds;
			}
			state.table = await DinextTable.create(createOpts);
			if (gen !== state.loadGen) {
				_destroyTable(state);
				return;
			}
			bindTableResize(container, state);
			_bindPaging(container, state);
		}

		requestAnimationFrame(() => {
			if (gen !== state.loadGen) return;
			syncTableHeight(container);
			_bindPaging(container, state);
		});
		return grid;
	} catch (err) {
		if (gen !== state.loadGen) return;
		_destroyTable(state);
		delete container._wrTable;
		_showError(container, err);
		console.error("[workload-reports] loadTable failed", err);
	}
}
