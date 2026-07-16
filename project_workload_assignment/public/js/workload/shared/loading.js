const LOADING_CLASS = "workload-report-table--loading";
const ATTR = "data-loading-message";

export function beginLoading(state, message) {
	if (!state) return;
	state._loadingDepth = (state._loadingDepth || 0) + 1;
	const el = state.container;
	if (!el) return;
	el.classList.add(LOADING_CLASS);
	el.setAttribute(ATTR, message || __("Loading data..."));
}

export function endLoading(state) {
	if (!state) return;
	state._loadingDepth = Math.max(0, (state._loadingDepth || 1) - 1);
	if (state._loadingDepth > 0) return;
	const el = state.container;
	if (!el) return;
	el.classList.remove(LOADING_CLASS);
	el.removeAttribute(ATTR);
}

export async function withLoading(state, fn, message) {
	beginLoading(state, message);
	try {
		return await fn();
	} finally {
		endLoading(state);
	}
}
