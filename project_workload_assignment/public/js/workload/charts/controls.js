/**
 * Chart gutter controls — update state.filters + onReload (no document events).
 */
export function ensureChartControls(state, onReload) {
	const charts = state?.charts;
	const panel = charts?.panel;
	if (!panel?.$gutterFilters?.length) return;
	if (charts._controlsReady) return;

	panel.$gutterFilters.empty();
	if (panel.$gutterHead?.length) {
		panel.$gutterHead.remove();
	}

	const $filters = $('<div class="pwr-chart-filters"></div>').appendTo(
		panel.$gutterFilters
	);

	const showFact = !!(state.filters && Number(state.filters.load_actual));
	const factLabel = __("Show fact");
	const $fact = $(
		`<div class="pwr-chart-filter-field d-flex align-items-start flex-shrink-0 mt-1">
			<label class="d-flex align-items-center mb-0">
				<input type="checkbox" class="workload-chart-show-fact" />
				<span>${frappe.utils.escape_html(factLabel)}</span>
			</label>
		</div>`
	).appendTo($filters);

	$fact
		.find(".workload-chart-show-fact")
		.prop("checked", showFact)
		.on("change", function () {
			const checked = $(this).is(":checked");
			const f = state.filters || (state.filters = {});
			f.load_actual = checked ? 1 : 0;
			if (typeof onReload === "function") {
				void onReload();
			}
		});

	const utilLabel = __("Add utilization");
	const loadUtil = !!(state.filters && Number(state.filters.load_utilization));
	const $util = $(
		`<div class="pwr-chart-filter-field pwr-chart-utilization-field d-flex align-items-start flex-shrink-0 mt-1">
			<label class="d-flex align-items-center mb-0">
				<input type="checkbox" class="workload-chart-utilization" />
				<span>${frappe.utils.escape_html(utilLabel)}</span>
			</label>
		</div>`
	).appendTo($filters);

	$util
		.find(".workload-chart-utilization")
		.prop("checked", loadUtil)
		.on("change", function () {
			const checked = $(this).is(":checked");
			const f = state.filters || (state.filters = {});
			f.load_utilization = checked ? 1 : 0;
			if (typeof onReload === "function") {
				void onReload({ chartOnly: true });
			}
		});

	charts._controlsReady = true;
}
