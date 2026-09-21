const MIN_HEIGHT_PX = 420;
const PAGE_BOTTOM_GAP_PX = 16;
/** PWR: flush to window bottom. Extra gap here is the only height knob. */
const PWR_BOTTOM_GAP_PX = 30;
const PWR_MIN_HEIGHT_PX = 240;
const FS_ROOT_CLASS = "workload-reports-root--fullscreen";

const _isFullscreenRoot = (container) => {
	const root = container?.closest?.(".workload-reports-root");
	if (!root) return false;
	if (root.classList.contains(FS_ROOT_CLASS)) return true;
	if (typeof document !== "undefined" && document.fullscreenElement === root) {
		return true;
	}
	return false;
};

/**
 * Page mode: fill window below table top.
 * Fullscreen: clear inline height — CSS flex on root owns the size.
 */
export const syncTableHeight = (container) => {
	if (!container?.getBoundingClientRect) return;

	if (_isFullscreenRoot(container)) {
		container.style.height = "";
		container.style.minHeight = "";
		return;
	}

	const top = container.getBoundingClientRect().top;
	const isReport = !!container.closest(".workload-reports-form-host");
	const gap = isReport ? PWR_BOTTOM_GAP_PX : PAGE_BOTTOM_GAP_PX;
	const minH = isReport ? PWR_MIN_HEIGHT_PX : MIN_HEIGHT_PX;
	const height = Math.max(minH, Math.round(window.innerHeight - top - gap));
	const px = `${height}px`;
	container.style.height = px;
	container.style.minHeight = px;
};

export const bindTableResize = (container, state) => {
	if (!container || state._resizeBound) return;
	state._resizeBound = true;

	const onResize = frappe.utils.debounce(() => {
		syncTableHeight(container);
		state._checkLoadMoreNearBottom?.();
	}, 150);

	$(window).on("resize.workloadReportsTable", onResize);

	const root = container.closest(".workload-reports-root");
	const charts = root?.querySelector(".workload-reports-charts");
	let chartsRo = null;
	if (charts && typeof ResizeObserver === "function") {
		chartsRo = new ResizeObserver(() => {
			syncTableHeight(container);
			state._checkLoadMoreNearBottom?.();
		});
		chartsRo.observe(charts);
	}

	state._resizeCleanup = () => {
		$(window).off("resize.workloadReportsTable", onResize);
		if (chartsRo) {
			chartsRo.disconnect();
			chartsRo = null;
		}
		state._resizeBound = false;
		state._resizeCleanup = null;
	};
};

export const unbindTableResize = (state) => {
	if (typeof state?._resizeCleanup === "function") {
		state._resizeCleanup();
	}
};
