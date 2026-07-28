import { toTableRows } from "./rows.js";

const NEAR_BOTTOM_PX = 160;
export const PAGE_SIZE = 20;

export const unbindLoadMore = (state) => {
	if (typeof state?._loadMoreCleanup === "function") {
		state._loadMoreCleanup();
	}
	state._loadMoreCleanup = null;
	state._checkLoadMoreNearBottom = null;
};

const _findViewport = (root) => {
	if (!root?.querySelector) return null;
	return (
		root.querySelector(".ag-body-viewport") ||
		root.querySelector(".ag-center-cols-viewport")
	);
};

const _appendNextPage = async (state) => {
	if (!state?.table || !state.onLoadMore) return;
	if (!state.meta?.has_more || state.isLoadingMore) return;

	state.isLoadingMore = true;
	try {
		const limit = state.meta.limit || PAGE_SIZE;
		const offset = state.meta.next_offset != null ? state.meta.next_offset : 0;
		const grid = await state.onLoadMore({ offset, limit });
		const nextRows = toTableRows(grid?.rows || []);
		const meta = grid?.meta || {};

		if (!nextRows.length) {
			state.meta = { ...(state.meta || {}), ...meta, has_more: false };
			return;
		}

		state.rows = (state.rows || []).concat(nextRows);
		state.meta = { ...(state.meta || {}), ...meta };

		if (typeof state.table.refresh === "function") {
			state.table.refresh(state.rows);
		}

		// Still near bottom after append (tall FS / short page) → keep going.
		requestAnimationFrame(() => state._checkLoadMoreNearBottom?.());
	} catch (err) {
		console.error("[workload-reports] load more failed", err);
	} finally {
		state.isLoadingMore = false;
	}
};

/**
 * Near-bottom paging via AG Grid `bodyScroll` API (survives viewport DOM recreate
 * on fullscreen / resize). Distance still read from live viewport node.
 */
export const bindLoadMore = (container, state) => {
	unbindLoadMore(state);
	if (!state?.onLoadMore || !state.table) return;
	if (!state.meta?.has_more) return;

	const api = state.table.api;
	if (!api || typeof api.addEventListener !== "function") return;

	const root = state.table.container || container;

	const checkNearBottom = () => {
		if (!state.meta?.has_more || state.isLoadingMore) return;
		const viewport = _findViewport(root);
		if (!viewport) return;
		const distance =
			viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
		if (distance <= NEAR_BOTTOM_PX) {
			void _appendNextPage(state);
		}
	};

	state._checkLoadMoreNearBottom = checkNearBottom;
	api.addEventListener("bodyScroll", checkNearBottom);
	state._loadMoreCleanup = () => {
		try {
			if (api && typeof api.isDestroyed === "function" && api.isDestroyed()) {
				/* grid already gone */
			} else {
				api.removeEventListener?.("bodyScroll", checkNearBottom);
			}
		} catch (_e) {
			/* ignore destroy races */
		}
		state._checkLoadMoreNearBottom = null;
		state._loadMoreCleanup = null;
	};

	// Content shorter than viewport — still try once so first page isn't stuck.
	checkNearBottom();
};
