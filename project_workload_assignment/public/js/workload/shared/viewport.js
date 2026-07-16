const MIN_GRID_HEIGHT_PX = 420;

function applyFallbackViewport(state) {
	const slot = state.container;
	if (!slot || typeof slot.getBoundingClientRect !== "function") {
		return;
	}
	const top = slot.getBoundingClientRect().top;
	const height = Math.max(MIN_GRID_HEIGHT_PX, window.innerHeight - top - 16);
	const px = `${height}px`;
	slot.style.setProperty("height", px, "important");
	slot.style.setProperty("min-height", px, "important");
	slot.style.setProperty("max-height", px, "important");
	slot.style.setProperty("flex", "1 1 auto");
	slot.style.setProperty("box-sizing", "border-box");
	slot.style.setProperty("min-width", "0");
}

export function syncReportViewport(state) {
	if (!state) return;
	applyFallbackViewport(state);
}

export function bindViewportResize(state) {
	if (!state || state._viewportResizeBound) return;
	state._viewportResizeBound = true;

	const onResize = frappe.utils.debounce(() => {
		syncReportViewport(state);
	}, 150);

	$(window).on("resize.workloadReportViewport", onResize);
	state._viewportResizeCleanup = () => {
		$(window).off("resize.workloadReportViewport", onResize);
		state._viewportResizeBound = false;
		state._viewportResizeCleanup = null;
	};
}
