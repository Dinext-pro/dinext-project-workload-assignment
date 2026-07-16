import { applyParticipantWidth } from "./participant-width.js";
import { withLoading } from "./loading.js";

const NEAR_BOTTOM_PX = 160;

export function teardownLoadMore(state) {
	if (state && typeof state._loadMoreCleanup === "function") {
		state._loadMoreCleanup();
		state._loadMoreCleanup = null;
	}
}

export async function appendNextPage(state, table) {
	if (!state || !table) return [];
	if (!state.meta?.has_more || state.isLoadingMore) return [];

	const loadMorePage =
		typeof state.loadMorePage === "function" ? state.loadMorePage : null;
	if (!loadMorePage) return [];

	state.isLoadingMore = true;
	try {
		return await withLoading(
			state,
			async () => {
				const { rows: newRoots, meta } = await loadMorePage(state);
				if (!newRoots.length) {
					state.meta = {
						...(state.meta || {}),
						...(meta || {}),
						has_more: false,
					};
					return [];
				}

				state.rows = (state.rows || []).concat(newRoots);
				state.meta = { ...(state.meta || {}), ...(meta || {}) };

				if (typeof table.refresh === "function") {
					table.refresh(state.rows);
				}
				applyParticipantWidth(state, table);
				return newRoots;
			},
			__("Loading more...")
		);
	} finally {
		state.isLoadingMore = false;
	}
}

export function setupLoadMore(state, table) {
	teardownLoadMore(state);
	if (!state || !table) return;
	if (typeof state.loadMorePage !== "function") return;

	const root = table.container || state.container;
	if (!root || typeof root.querySelector !== "function") return;

	const viewport =
		root.querySelector(".ag-body-viewport") ||
		root.querySelector(".ag-center-cols-viewport");
	if (!viewport) return;

	const onScroll = () => {
		if (!state.meta?.has_more || state.isLoadingMore) return;
		const distanceToBottom =
			viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
		if (distanceToBottom <= NEAR_BOTTOM_PX) {
			void appendNextPage(state, table);
		}
	};

	viewport.addEventListener("scroll", onScroll, { passive: true });
	state._loadMoreCleanup = () => {
		viewport.removeEventListener("scroll", onScroll);
	};
}
