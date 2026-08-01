import {
	VIEW_OPTIONS,
	PERIOD_OPTIONS,
	WORKER_OPTIONS,
	projectDefaults,
	resetProjectWindow,
	shiftMonth,
} from "./periods.js";
import {
	mountRow,
	addSelect,
	addCheckbox,
	addPeriodNav,
	addButton,
} from "./controls.js";

export function mountProjectFilters(el, onChange) {
	const args = projectDefaults();
	const { flow, buttons } = mountRow(el);
	const _reload = () => onChange();

	addSelect(flow, {
		fieldname: "worker_wtype",
		options: WORKER_OPTIONS,
		value: args.worker_wtype,
		onChange: (v) => {
			args.worker_wtype = v;
			_reload();
		},
	});

	addCheckbox(flow, {
		label: __("Show fact"),
		checked: !!args.load_actual,
		onChange: (v) => {
			args.load_actual = v ? 1 : 0;
			_reload();
		},
	});

	addPeriodNav(flow, {
		onPrev: () => {
			args.date_from = shiftMonth(args.date_from, -1);
			args.date_to = shiftMonth(args.date_to, -1);
			_reload();
		},
		onNext: () => {
			args.date_from = shiftMonth(args.date_from, 1);
			args.date_to = shiftMonth(args.date_to, 1);
			_reload();
		},
	});

	addSelect(flow, {
		fieldname: "view_type",
		options: VIEW_OPTIONS,
		value: args.view_type,
		onChange: (v) => {
			args.view_type = v;
			resetProjectWindow(args);
			_reload();
		},
	});

	addSelect(flow, {
		fieldname: "period_range",
		options: PERIOD_OPTIONS,
		value: args.period_range,
		onChange: (v) => {
			args.period_range = v;
			resetProjectWindow(args);
			_reload();
		},
	});

	addButton(buttons, {
		title: __("Refresh Data"),
		text: "↻",
		onClick: _reload,
	});

	return () => ({ ...args });
}
