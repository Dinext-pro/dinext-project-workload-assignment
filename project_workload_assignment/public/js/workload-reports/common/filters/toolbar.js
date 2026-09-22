import { VIEW_OPTIONS, PERIOD_OPTIONS } from "./periods.js";
import { addSelect, addCheckbox, addPeriodNav, addButton } from "./controls.js";
import { mountChartToolbarControls, mountStackModeSelect } from "../charts/controls.js";

/**
 * Period / fact / chart chrome for DinextTable toolbar custom host.
 * Mount once — host is reused across toolbar rerenders.
 * @param {HTMLElement} host
 * @param {ReturnType<import("./session.js").createFilterSession>} session
 * @param {object} [chartOpts]
 */
export function mountPeriodToolbar(host, session, chartOpts) {
	if (!host || host.dataset.wrMounted === "1") return;
	host.dataset.wrMounted = "1";
	host.classList.add("wr-table-toolbar");

	addSelect(host, {
		fieldname: "view_type",
		options: VIEW_OPTIONS,
		value: session.args.view_type,
		onChange: (v) => {
			session.args.view_type = v;
			session.resetWindowAndReload();
		},
	});

	addSelect(host, {
		fieldname: "period_range",
		options: PERIOD_OPTIONS,
		value: session.args.period_range,
		onChange: (v) => {
			session.args.period_range = v;
			session.resetWindowAndReload();
		},
	});

	if (chartOpts) {
		mountStackModeSelect(host, chartOpts);
	}

	addCheckbox(host, {
		label: __("Fact"),
		checked: !!session.args.load_actual,
		onChange: (v) => {
			session.args.load_actual = v ? 1 : 0;
			session.reload();
		},
	});

	if (chartOpts) {
		mountChartToolbarControls(host, chartOpts);
	}
}

/**
 * Period arrows + refresh — right edge of custom toolbar zone (before fullscreen sep).
 * @param {HTMLElement} host
 * @param {ReturnType<import("./session.js").createFilterSession>} session
 */
export function mountPeriodNavToolbar(host, session) {
	if (!host || host.dataset.wrNavMounted === "1") return;
	host.dataset.wrNavMounted = "1";
	host.classList.add("wr-table-toolbar", "wr-table-toolbar--nav");

	addPeriodNav(host, {
		onPrev: () => session.shiftPeriod(-1),
		onNext: () => session.shiftPeriod(1),
	});

	addButton(host, {
		title: __("Refresh Data"),
		text: "↻",
		onClick: () => session.reload(),
	});
}

export function buildPeriodToolbarItems(session, chartOpts) {
	return [
		{
			id: "wr-period-toolbar",
			type: "custom",
			render: ({ host }) => {
				mountPeriodToolbar(host, session, chartOpts);
			},
		},
		{
			id: "wr-period-nav",
			type: "custom",
			render: ({ host }) => {
				mountPeriodNavToolbar(host, session);
			},
		},
	];
}

export function buildPeriodToolbar(session, persistKey, chartOpts) {
	return {
		persistKey,
		items: buildPeriodToolbarItems(session, chartOpts),
	};
}
