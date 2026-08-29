import {
	CHART_PLOT_HEIGHT,
	CHART_PLOT_HEIGHT_PX,
	DEFAULT_LABEL_GUTTER_PX,
	LEGEND_BAND_PX,
	UTILIZATION_ACTUAL_COLOR,
	UTILIZATION_FORECAST_COLOR,
	Y_AXIS_GUTTER_PX,
} from "./theme.js";
import { CELL_SIZE } from "../table/columns.js";

function isPeriodColumnId(columnId) {
	if (!columnId || columnId === "label") return false;
	const id = String(columnId);
	return id.startsWith("hours_") || id.startsWith("workload_");
}

function resolveTableApi(getTableApi) {
	if (typeof getTableApi !== "function") return null;
	return getTableApi() || null;
}

function findTableContainer(hostEl) {
	if (!hostEl) return null;
	const fromRoot = hostEl
		.closest(".workload-reports-root")
		?.querySelector(".workload-reports-table");
	if (fromRoot) return fromRoot;

	const sibling =
		hostEl.nextElementSibling?.classList?.contains("workload-reports-table")
			? hostEl.nextElementSibling
			: hostEl.previousElementSibling?.classList?.contains("workload-reports-table")
				? hostEl.previousElementSibling
				: null;
	return sibling || null;
}

function findAgGridElements(tableEl) {
	if (!tableEl) return null;
	const $grid = $(tableEl);
	if (!$grid.length) return null;
	const $pinnedHeader = $grid.find(".ag-pinned-left-header").first();
	const $centerViewport = $grid.find(".ag-center-cols-viewport").first();
	const $centerContainer = $grid.find(".ag-center-cols-container").first();
	return { $grid, $pinnedHeader, $centerViewport, $centerContainer };
}

function measureLabelGutterWidth(api, $grid) {
	if (api && typeof api.getColumn === "function") {
		const col = api.getColumn("label");
		if (col && typeof col.getActualWidth === "function") {
			const width = col.getActualWidth();
			if (Number.isFinite(width) && width > 0) {
				return Math.round(width);
			}
		}
	}
	if ($grid?.length) {
		const $pinnedHeader = $grid.find(".ag-pinned-left-header").first();
		if ($pinnedHeader.length) {
			const headerW = Math.round($pinnedHeader.outerWidth() || 0);
			if (headerW > 0) return headerW;
		}
	}
	return 0;
}

/**
 * Period track width must be N_chart × CELL_SIZE so ECharts category pitch
 * matches AG Grid column left offsets (i * 48). Prefer categoryCount over
 * table column count: during period-filter races the table may already have
 * new columns while the chart still has the previous xAxis (or vice versa).
 * Sizing by the larger/wrong table N stretches category slots and bars drift.
 */
function measurePeriodAreaWidth(api, $centerContainer, $centerViewport, categoryCount) {
	let periodCount = 0;

	if (api) {
		const getColumns = api.getAllGridColumns || api.getColumns || null;
		if (typeof getColumns === "function") {
			const columns = getColumns.call(api) || [];
			columns.forEach((column) => {
				const colId =
					typeof column.getColId === "function" ? column.getColId() : column.colId;
				if (!isPeriodColumnId(colId)) return;
				periodCount += 1;
			});
		}
	}

	const cats =
		Number.isFinite(categoryCount) && categoryCount > 0 ? categoryCount : 0;
	// Chart pitch is authoritative; fall back to table period cols if chart not ready.
	const n = cats || periodCount;
	if (n > 0) {
		return n * CELL_SIZE;
	}

	const containerEl = $centerContainer?.get?.(0);
	if (containerEl) {
		const containerW = Math.round(
			containerEl.scrollWidth ||
				containerEl.offsetWidth ||
				containerEl.getBoundingClientRect().width ||
				0
		);
		if (containerW > 0) return containerW;
	}

	const viewportEl = $centerViewport?.get?.(0);
	if (
		viewportEl &&
		viewportEl.scrollWidth > viewportEl.clientWidth &&
		viewportEl.scrollWidth > 0
	) {
		return Math.round(viewportEl.scrollWidth);
	}
	return 0;
}

function formatYAxisTick(value, compact) {
	const n = Number(value);
	if (!Number.isFinite(n)) return "";
	if (compact && Math.abs(n) >= 1000) {
		const k = n / 1000;
		if (Math.abs(k - Math.round(k)) < 0.05) return `${Math.round(k)}k`;
		return `${k.toFixed(1)}k`;
	}
	if (Math.abs(n) >= 100) return String(Math.round(n));
	if (Math.abs(n - Math.round(n)) < 0.05) return String(Math.round(n));
	return n.toFixed(1);
}

export function syncYAxisGutterLabels(chart, panel, yAxisName) {
	const $gutterYaxis = panel?.$gutterYaxis;
	if (!chart || chart.isDisposed() || !$gutterYaxis?.length) return;

	const yAxisModel = chart.getModel().getComponent("yAxis", 0);
	if (!yAxisModel?.axis) return;

	const chartRect = panel.$chartEl[0].getBoundingClientRect();
	const yaxisRect = $gutterYaxis[0].getBoundingClientRect();
	const name = yAxisName || __("Hours");
	const gridModel = chart.getModel().getComponent("grid", 0);
	const gridRect =
		gridModel && gridModel.coordinateSystem
			? gridModel.coordinateSystem.getRect()
			: null;

	let $name = $gutterYaxis.find(".wr-chart-yaxis-name");
	if (!$name.length) {
		$name = $('<div class="wr-chart-yaxis-name"></div>').prependTo($gutterYaxis);
	}
	$name.text(name);
	if (gridRect) {
		const nameTop = chartRect.top - yaxisRect.top + gridRect.y + gridRect.height / 2;
		$name.css({
			top: `${nameTop}px`,
			left: "50%",
			transform: "translate(-50%, -50%) rotate(-90deg)",
		});
	}

	const $ticks = $('<div class="wr-chart-yaxis-ticks"></div>');
	const plotMin = gridRect ? gridRect.y : 0;
	const plotMax = gridRect ? gridRect.y + gridRect.height : yaxisRect.height;
	(yAxisModel.axis.scale.getTicks() || []).forEach((tick) => {
		const py = chart.convertToPixel({ yAxisIndex: 0 }, tick.value);
		if (!Number.isFinite(py)) return;
		const top = chartRect.top - yaxisRect.top + py;
		if (top < plotMin || top > plotMax) return;
		$(
			`<span class="wr-chart-yaxis-tick" style="top:${top}px">${frappe.utils.escape_html(
				formatYAxisTick(tick.value, true)
			)}</span>`
		).appendTo($ticks);
	});

	$gutterYaxis.find(".wr-chart-yaxis-ticks").remove();
	$gutterYaxis.append($ticks);
}

function getSeriesLegendColor(series) {
	if (!series) return "#888";
	if (series.lineStyle?.color) return series.lineStyle.color;
	if (series.itemStyle?.color) return series.itemStyle.color;
	if (series.areaStyle?.color) return series.areaStyle.color;
	return "#888";
}

function isUtilizationForecastSeries(series) {
	return !!(series && (series.type === "scatter" || series.utilizationForecast));
}

function isUtilizationActualSeries(series) {
	return !!(series && series.utilizationActual);
}

function resolveLegendSwatchColor(series) {
	if (isUtilizationActualSeries(series))   return UTILIZATION_ACTUAL_COLOR;
	if (isUtilizationForecastSeries(series)) return UTILIZATION_FORECAST_COLOR;
	return getSeriesLegendColor(series) || "#888";
}

function swatchModifierClass(series) {
	if (isUtilizationActualSeries(series)) return "wr-chart-legend-swatch--dot";
	if (isUtilizationForecastSeries(series)) return "wr-chart-legend-swatch--dot";
	if (series?.type === "line") return "wr-chart-legend-swatch--line";
	return "";
}

export function updateFixedChartLegend(panel, option, chart) {
	if (!panel?.$viewport?.length || !option) return;
	let $bar = panel.$legendBar;
	if (!$bar?.length) {
		$bar = $('<div class="wr-chart-legend-bar"></div>');
		panel.$viewport.prepend($bar);
		panel.$legendBar = $bar;
	}

	const items = (option.series || []).filter((series) => series && series.name);
	$bar.empty();
	items.forEach((series) => {
		const mod = swatchModifierClass(series);
		const $item = $(
			'<button type="button" class="wr-chart-legend-item">' +
				'<span class="wr-chart-legend-swatch"></span>' +
				'<span class="wr-chart-legend-label"></span>' +
			"</button>"
		);
		const $swatch = $item.find(".wr-chart-legend-swatch");
		if (mod) $swatch.addClass(mod);
		$swatch.css("backgroundColor", resolveLegendSwatchColor(series));
		$item.find(".wr-chart-legend-label").text(series.name);

		if (chart) {
			const name = series.name;
			$item
				.on("mouseenter", () => chart.dispatchAction({ type: "highlight", seriesName: name }))
				.on("mouseleave", () => chart.dispatchAction({ type: "downplay" }))
				.on("click", () => {
					chart.dispatchAction({ type: "legendToggleSelect", name });
					$item.toggleClass("is-hidden");
				});
		}

		$bar.append($item);
	});
}

function attachWheelSync(targets, handler) {
	const opts = { passive: false, capture: true };
	const bound = [];
	(targets || []).forEach((target) => {
		const el = target?.jquery ? target.get(0) : target;
		if (!el) return;
		el.addEventListener("wheel", handler, opts);
		bound.push({ el, handler, opts });
	});
	return () => {
		bound.forEach(({ el, handler: fn, opts: listenerOpts }) => {
			el.removeEventListener("wheel", fn, listenerOpts);
		});
	};
}

function collectChartWheelTargets(panel, chart) {
	const targets = [
		panel.$viewport,
		panel.$chartTrack,
		panel.$chartEl,
		panel.$gutterYaxis,
		panel.$gutterChrome,
		panel.$gutterFilters,
	];
	if (chart && !chart.isDisposed() && typeof chart.getZr === "function") {
		const zr = chart.getZr();
		if (zr?.dom) targets.push($(zr.dom));
	}
	return targets;
}

/**
 * Align chart gutter/track with DinextTable label col + center viewport scroll.
 * Cleanup stored on hostEl._wrCharts.layoutCleanup. Safe to call again after table ready.
 */
export function bindChartAlign({ hostEl, panel, chart, getTableApi }) {
	if (!hostEl || !panel) return;

	const wr = hostEl._wrCharts || (hostEl._wrCharts = {});
	if (typeof wr.layoutCleanup === "function") {
		wr.layoutCleanup();
		wr.layoutCleanup = null;
	}

	const $syncGrid = panel.$syncGrid;
	const $viewport = panel.$viewport;
	const $track = panel.$chartTrack;
	const $chartEl = panel.$chartEl;
	if (!$syncGrid?.length || !$viewport?.length || !$track?.length || !$chartEl?.length) {
		return;
	}

	const getAg = () => findAgGridElements(findTableContainer(hostEl));

	let layoutTimer = null;
	let scrollBoundEl = null;
	const yAxisName = __("Hours");
	const gridListeners = [];
	let gridApiBound = null;

	const ensureScrollBound = ($centerViewport) => {
		const el = $centerViewport?.get?.(0);
		if (!el || el === scrollBoundEl) return;
		if (scrollBoundEl) {
			$(scrollBoundEl).off("scroll.wr-chart-align");
		}
		scrollBoundEl = el;
		$(el).on("scroll.wr-chart-align", () => syncFromTable());
	};

	const ensureGridListeners = (api) => {
		if (!api || typeof api.addEventListener !== "function" || api === gridApiBound) {
			return;
		}
		gridListeners.forEach(({ api: prev, eventName, handler }) => {
			prev.removeEventListener?.(eventName, handler);
		});
		gridListeners.length = 0;
		gridApiBound = api;
		const onGridLayout = () => scheduleLayout();
		["gridReady", "columnResized", "gridColumnsChanged", "firstDataRendered", "modelUpdated"].forEach(
			(eventName) => {
				api.addEventListener(eventName, onGridLayout);
				gridListeners.push({ api, eventName, handler: onGridLayout });
			}
		);
	};

	const syncFromTable = () => {
		const { $centerViewport } = getAg() || {};
		if (!$centerViewport?.length) return;
		ensureScrollBound($centerViewport);
		const scrollLeft = $centerViewport.scrollLeft() || 0;
		$track.css("transform", `translate3d(${-scrollLeft}px, 0, 0)`);
	};

	const applyLayout = () => {
		const api = resolveTableApi(getTableApi);
		ensureGridListeners(api);
		const ag = getAg() || {};
		const { $grid, $centerViewport, $centerContainer } = ag;
		const hasViewport = !!$centerViewport?.length;
		if (hasViewport) ensureScrollBound($centerViewport);

		let gutterW = measureLabelGutterWidth(api, $grid);
		if (!gutterW && wr._lastGutterWidth) gutterW = wr._lastGutterWidth;
		if (!gutterW) gutterW = DEFAULT_LABEL_GUTTER_PX;
		wr._lastGutterWidth = gutterW;

		const viewportW = hasViewport ? Math.round($centerViewport.outerWidth() || 0) : 0;
		let categoryCount = 0;
		if (chart && !chart.isDisposed() && typeof chart.getOption === "function") {
			const xAxis = chart.getOption()?.xAxis;
			const axis0 = Array.isArray(xAxis) ? xAxis[0] : xAxis;
			const data = axis0?.data;
			if (Array.isArray(data)) categoryCount = data.length;
		}
		const scrollW = hasViewport
			? measurePeriodAreaWidth(api, $centerContainer, $centerViewport, categoryCount)
			: 0;
		const scrollLeft = hasViewport ? $centerViewport.scrollLeft() || 0 : 0;
		const filtersW = Math.max(0, gutterW - Y_AXIS_GUTTER_PX);

		$syncGrid.css({
			gridTemplateColumns: `${filtersW}px ${Y_AXIS_GUTTER_PX}px minmax(0, 1fr)`,
		});
		const $root = panel.$root?.length ? panel.$root : $(hostEl);
		$root.css({
			"--wr-yaxis-gutter-width": `${Y_AXIS_GUTTER_PX}px`,
			"--wr-filters-gutter-width": `${filtersW}px`,
		});

		if (panel.$gutterChrome?.length) {
			panel.$gutterChrome.css({
				width: filtersW,
				maxWidth: filtersW,
				minWidth: filtersW,
			});
		}
		if (panel.$gutterFilters?.length) {
			panel.$gutterFilters.css({
				width: "100%",
				maxWidth: filtersW,
				minWidth: 0,
			});
		}
		if (viewportW > 0) {
			$viewport.css({ maxWidth: viewportW });
		}

		if (!scrollW) {
			syncFromTable();
			return;
		}

		$track.css({ width: scrollW });
		$chartEl.css({ width: scrollW, height: CHART_PLOT_HEIGHT });
		$track.css("transform", `translate3d(${-scrollLeft}px, 0, 0)`);

		if (chart && !chart.isDisposed() && scrollW > 0) {
			chart.resize({ width: scrollW, height: CHART_PLOT_HEIGHT_PX });
			syncYAxisGutterLabels(chart, panel, yAxisName);
			// DinextCharts.mount schedules a bare chart.resize() on rAF which can
			// collapse width to the clipped viewport — re-assert sized resize.
			requestAnimationFrame(() => {
				if (chart && !chart.isDisposed()) {
					chart.resize({ width: scrollW, height: CHART_PLOT_HEIGHT_PX });
					syncYAxisGutterLabels(chart, panel, yAxisName);
				}
			});
		}
	};

	const scheduleLayout = () => {
		clearTimeout(layoutTimer);
		layoutTimer = setTimeout(applyLayout, 16);
	};

	const onChartWheel = (e) => {
		const { $centerViewport } = getAg() || {};
		const viewportEl = $centerViewport?.get?.(0);
		if (!viewportEl || viewportEl.scrollWidth <= viewportEl.clientWidth) return;
		let delta = e.deltaX;
		if (!delta && e.shiftKey) delta = e.deltaY;
		if (!delta) return;
		viewportEl.scrollLeft += delta;
		e.preventDefault();
	};

	const cleanups = [];

	cleanups.push(() => {
		if (scrollBoundEl) {
			$(scrollBoundEl).off("scroll.wr-chart-align");
			scrollBoundEl = null;
		}
	});

	const wheelCleanup = attachWheelSync(collectChartWheelTargets(panel, chart), onChartWheel);
	cleanups.push(wheelCleanup);

	cleanups.push(() => {
		gridListeners.forEach(({ api: prev, eventName, handler }) => {
			prev.removeEventListener?.(eventName, handler);
		});
		gridListeners.length = 0;
		gridApiBound = null;
	});

	const observers = [];
	if (window.ResizeObserver) {
		const tableEl = findTableContainer(hostEl);
		const observeTargets = [hostEl];
		if (tableEl) observeTargets.push(tableEl);
		observeTargets.forEach((el) => {
			if (!el) return;
			const ro = new ResizeObserver(scheduleLayout);
			ro.observe(el);
			observers.push(ro);
		});
		cleanups.push(() => observers.forEach((ro) => ro.disconnect()));
	}

	const onFinished = () => {
		if (chart && !chart.isDisposed()) {
			syncYAxisGutterLabels(chart, panel, yAxisName);
		}
	};
	if (chart && !chart.isDisposed() && typeof chart.on === "function") {
		chart.on("finished", onFinished);
		cleanups.push(() => {
			if (chart && !chart.isDisposed() && typeof chart.off === "function") {
				chart.off("finished", onFinished);
			}
		});
	}

	syncFromTable();
	applyLayout();
	requestAnimationFrame(applyLayout);

	wr.layoutCleanup = () => {
		clearTimeout(layoutTimer);
		cleanups.forEach((fn) => fn());
	};
}
