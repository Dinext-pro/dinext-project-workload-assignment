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
	addMultiSelectList,
} from "./controls.js";
import { fetchProjectRoleOptions } from "./role-options.js";

/**
 * @param {HTMLElement} el
 * @param {Function} onChange
 * @param {{ getProject?: () => string }} [opts]
 */
export function mountProjectFilters(el, onChange, opts = {}) {
	const args = projectDefaults();
	const { flow, buttons } = mountRow(el);
	const _reload = () => onChange();
	const getProject = typeof opts.getProject === "function" ? opts.getProject : () => "";

	addSelect(flow, {
		fieldname: "worker_wtype",
		options: WORKER_OPTIONS,
		value: args.worker_wtype,
		onChange: (v) => {
			args.worker_wtype = v;
			_reload();
		},
	});

	addMultiSelectList(flow, {
		fieldname: "project_role_filters",
		placeholder: __("Project Roles"),
		value: args.project_role_filters,
		getData: (txt) =>
			fetchProjectRoleOptions({ project: getProject(), worker_wtype: args.worker_wtype }, txt),
		onChange: (values) => {
			args.project_role_filters = values || [];
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

	addPeriodNav(buttons, {
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

	return () => ({ ...args });
}
