import {
	CHART_PLOT_HEIGHT,
	CHART_PLOT_HEIGHT_PX,
	DEFAULT_LABEL_GUTTER_PX,
	LEGEND_BAND_PX,
	PWR_UTILIZATION_FORECAST_BORDER,
	PWR_UTILIZATION_FORECAST_COLOR,
	Y_AXIS_GUTTER_PX,
} from "./theme.js";

function isPeriodColumnId(columnId) {
	if (!columnId || columnId === "label" || columnId === "participant") {
		return false;
	}
	const id = String(columnId);
	return id.indexOf("hours_") === 0 || id.indexOf("workload_") === 0;
}

function measureLabelGutterWidth(api, $grid) {
	if (api && typeof api.getColumn === "function") {
		const col = api.getColumn("label") || api.getColumn("participant");
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

function measurePeriodAreaWidth($centerContainer, $centerViewport, api) {
	const containerEl = $centerContainer?.get?.(0);
	if (containerEl) {
		const containerW = Math.round(
			containerEl.getBoundingClientRect().width ||
				containerEl.offsetWidth ||
				containerEl.scrollWidth ||
				0
		);
		if (containerW > 0) return containerW;
	}

	if (api) {
		const getColumns = api.getAllGridColumns || api.getColumns || null;
		if (getColumns) {
			const columns = getColumns.call(api) || [];
			let total = 0;
			let count = 0;
			columns.forEach((column) => {
				const colId =
					typeof column.getColId === "function" ? column.getColId() : column.colId;
				if (!isPeriodColumnId(colId)) return;
				const width =
					typeof column.getActualWidth === "function" ? column.getActualWidth() : 0;
				if (Number.isFinite(width) && width > 0) {
					total += width;
					count += 1;
				}
			});
			if (count > 0) return Math.round(total);
		}
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
	const $gutterYaxis = panel.$gutterYaxis;
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

	let $name = $gutterYaxis.find(".pwr-chart-yaxis-name");
	if (!$name.length) {
		$name = $('<div class="pwr-chart-yaxis-name"></div>').prependTo($gutterYaxis);
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

	const $ticks = $('<div class="pwr-chart-yaxis-ticks"></div>');
	const plotMin = gridRect ? gridRect.y : 0;
	const plotMax = gridRect ? gridRect.y + gridRect.height : yaxisRect.height;
	(yAxisModel.axis.scale.getTicks() || []).forEach((tick) => {
		const py = chart.convertToPixel({ yAxisIndex: 0 }, tick.value);
		if (!Number.isFinite(py)) return;
		const top = chartRect.top - yaxisRect.top + py;
		if (top < plotMin || top > plotMax) return;
		$(
			`<span class="pwr-chart-yaxis-tick" style="top:${top}px">${frappe.utils.escape_html(
				formatYAxisTick(tick.value, true)
			)}</span>`
		).appendTo($ticks);
	});

	$gutterYaxis.find(".pwr-chart-yaxis-ticks").remove();
	$gutterYaxis.append($ticks);
}

function getSeriesLegendColor(series) {
	if (!series) return "#888";
	if (series.lineStyle?.color) return series.lineStyle.color;
	if (series.itemStyle?.color) return series.itemStyle.color;
	if (series.areaStyle?.color) return series.areaStyle.color;
	return "#888";
}

function resolveLegendSwatchColor(series) {
	if (series && (series.type === "scatter" || series.pwrUtilizationForecast)) {
		return PWR_UTILIZATION_FORECAST_COLOR;
	}
	return getSeriesLegendColor(series) || "#888";
}

function buildLegendSwatchStyle(series) {
	const color = resolveLegendSwatchColor(series);
	const style = {
		display: "inline-block",
		width: "14px",
		height: "10px",
		minWidth: "14px",
		minHeight: "10px",
		borderRadius: "2px",
		flexShrink: 0,
		boxSizing: "border-box",
		backgroundColor: color,
	};
	if (series?.type === "line") {
		style.height = "2px";
		style.minHeight = "2px";
		style.marginTop = "4px";
		style.marginBottom = "4px";
		style.borderRadius = "1px";
	}
	if (series && (series.type === "scatter" || series.pwrUtilizationForecast)) {
		style.width = "8px";
		style.height = "8px";
		style.minWidth = "8px";
		style.minHeight = "8px";
		style.borderRadius = "50%";
		style.border = `1px solid ${PWR_UTILIZATION_FORECAST_BORDER}`;
	}
	return style;
}

export function updateFixedChartLegend(panel, option) {
	if (!panel?.$viewport?.length || !option) return;
	let $bar = panel.$legendBar;
	if (!$bar?.length) {
		$bar = $(
			'<div class="pwr-chart-legend-bar d-flex align-items-center flex-wrap px-2"></div>'
		).css({
			gap: "8px 16px",
			height: `${LEGEND_BAND_PX}px`,
			minHeight: `${LEGEND_BAND_PX}px`,
			maxHeight: `${LEGEND_BAND_PX}px`,
			boxSizing: "border-box",
			overflow: "hidden",
			background: "var(--ag-background-color, var(--bg-color))",
			zIndex: 3,
		});
		panel.$viewport.prepend($bar);
		panel.$legendBar = $bar;
	}
	const items = (option.series || []).filter((series) => series && series.name);
	$bar.empty();
	items.forEach((series) => {
		const $item = $(
			'<span class="pwr-chart-legend-item d-inline-flex align-items-center flex-shrink-0 mr-3"></span>'
		).css({ gap: "6px", whiteSpace: "nowrap" });
		const $swatch = $('<span class="pwr-chart-legend-swatch"></span>').css(
			buildLegendSwatchStyle(series)
		);
		const $label = $('<span class="pwr-chart-legend-label"></span>')
			.text(series.name)
			.css({
				fontSize: "10px",
				lineHeight: "1.2",
				color: "var(--text-muted, #8d99a6)",
			});
		$item.append($swatch, $label);
		$bar.append($item);
	});
}

function findAgGridElements(tableEl) {
	const $grid = $(tableEl);
	if (!$grid.length) return null;
	let $pinned = $grid.find(".ag-pinned-left-cols-container").first();
	if (!$pinned.length) {
		$pinned = $grid.find(".ag-pinned-left-header").first();
	}
	const $centerViewport = $grid.find(".ag-center-cols-viewport").first();
	const $centerContainer = $grid.find(".ag-center-cols-container").first();
	return { $grid, $pinned, $centerViewport, $centerContainer };
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
 * Align chart gutter/track with AG Grid label col + center viewport scroll.
 * No legacy class names — uses state.table.container.
 */
export function bindChartAlign(state) {
	const charts = state?.charts;
	const panel = charts?.panel;
	const tableEl = state?.table?.container || state?.container;
	if (!panel || !tableEl) return;

	if (charts.layoutCleanup) {
		charts.layoutCleanup();
		charts.layoutCleanup = null;
	}

	const elements = findAgGridElements(tableEl);
	if (!elements?.$centerViewport?.length) return;

	const { $pinned, $centerViewport, $centerContainer, $grid } = elements;
	const api = state.table?.api || null;
	const $syncGrid = panel.$syncGrid;
	const $viewport = panel.$viewport;
	const $track = panel.$chartTrack;
	const $chartEl = panel.$chartEl;
	if (!$syncGrid || !$viewport || !$track || !$chartEl) return;

	let layoutTimer = null;
	const applyLayout = () => {
		let gutterW = measureLabelGutterWidth(api, $grid);
		if (!gutterW && charts._lastGutterWidth) gutterW = charts._lastGutterWidth;
		if (!gutterW) gutterW = DEFAULT_LABEL_GUTTER_PX;
		charts._lastGutterWidth = gutterW;

		const viewportW = Math.round($centerViewport.outerWidth() || 0);
		const scrollW = measurePeriodAreaWidth($centerContainer, $centerViewport, api);
		const scrollLeft = $centerViewport.scrollLeft() || 0;
		const filtersW = Math.max(0, gutterW - Y_AXIS_GUTTER_PX);

		$syncGrid.css({
			gridTemplateColumns: `${filtersW}px ${Y_AXIS_GUTTER_PX}px minmax(0, 1fr)`,
		});
		if (panel.$root?.length) {
			panel.$root.css("--pwr-yaxis-gutter-width", `${Y_AXIS_GUTTER_PX}px`);
			panel.$root.css("--pwr-filters-gutter-width", `${filtersW}px`);
		}
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
		if (!scrollW) return;

		const trackW = scrollW;
		$track.css({ width: trackW });
		$chartEl.css({ width: trackW, height: CHART_PLOT_HEIGHT });
		$track.css("transform", `translate3d(${-scrollLeft}px, 0, 0)`);

		if (charts.chart && !charts.chart.isDisposed() && trackW > 0) {
			charts.chart.resize({ width: trackW, height: CHART_PLOT_HEIGHT_PX });
			syncYAxisGutterLabels(charts.chart, panel, __("Hours"));
		}
	};

	const scheduleLayout = () => {
		clearTimeout(layoutTimer);
		layoutTimer = setTimeout(applyLayout, 16);
	};

	const onScroll = () => {
		const scrollLeft = $centerViewport.scrollLeft() || 0;
		$track.css("transform", `translate3d(${-scrollLeft}px, 0, 0)`);
	};

	const onChartWheel = (e) => {
		const viewportEl = $centerViewport.get(0);
		if (!viewportEl || viewportEl.scrollWidth <= viewportEl.clientWidth) return;
		let delta = e.deltaX;
		if (!delta && e.shiftKey) delta = e.deltaY;
		if (!delta && e.deltaY) delta = e.deltaY;
		if (!delta) return;
		viewportEl.scrollLeft += delta;
		e.preventDefault();
	};

	$centerViewport.on("scroll.workload-chart-align", onScroll);
	const wheelCleanup = attachWheelSync(
		collectChartWheelTargets(panel, charts.chart),
		onChartWheel
	);

	const gridListeners = [];
	if (api && typeof api.addEventListener === "function") {
		const onGridLayout = () => scheduleLayout();
		["firstDataRendered", "gridReady", "gridColumnsChanged", "columnResized", "modelUpdated"].forEach(
			(eventName) => {
				api.addEventListener(eventName, onGridLayout);
				gridListeners.push({ eventName, handler: onGridLayout });
			}
		);
	}

	const observers = [];
	if (window.ResizeObserver) {
		[$pinned.get(0), $centerViewport.get(0), $centerContainer.get(0)].forEach((el) => {
			if (!el) return;
			const ro = new ResizeObserver(scheduleLayout);
			ro.observe(el);
			observers.push(ro);
		});
	}

	applyLayout();
	requestAnimationFrame(applyLayout);

	charts.layoutCleanup = () => {
		clearTimeout(layoutTimer);
		$centerViewport.off("scroll.workload-chart-align");
		wheelCleanup();
		gridListeners.forEach(({ eventName, handler }) => {
			if (api && typeof api.removeEventListener === "function") {
				api.removeEventListener(eventName, handler);
			}
		});
		observers.forEach((ro) => ro.disconnect());
	};
}
