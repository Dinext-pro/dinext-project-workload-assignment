import {
	VIEW_OPTIONS,
	PERIOD_OPTIONS,
	WORKER_OPTIONS,
	projectsDefaults,
	resetProjectsAnchor,
	shiftMonth,
} from "./periods.js";
import {
	mountRow,
	addSelect,
	addCheckbox,
	addPeriodNav,
	addButton,
	addLink,
} from "./controls.js";

export function mountProjectsFilters(el, onChange) {
	const args = projectsDefaults();
	const { flow, buttons } = mountRow(el);
	const _reload = () => onChange();

	const links = {
		user: addLink(flow, {
			options: "User",
			fieldname: "user",
			placeholder: __("User"),
			onChange: (v) => {
				args.user = v;
				_reload();
			},
		}),
		project: addLink(flow, {
			options: "Project",
			fieldname: "project",
			placeholder: __("Project"),
			onChange: (v) => {
				args.project = v;
				_reload();
			},
		}),
		project_portfolio: addLink(flow, {
			options: "Project Portfolio",
			fieldname: "project_portfolio",
			placeholder: __("Project Portfolio"),
			onChange: (v) => {
				args.project_portfolio = v;
				_reload();
			},
		}),
		user_group: addLink(flow, {
			options: "User Group",
			fieldname: "user_group",
			placeholder: __("User Group"),
			onChange: (v) => {
				args.user_group = v;
				_reload();
			},
		}),
	};

	const workerSelect = addSelect(flow, {
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
			args.period_anchor_date = shiftMonth(args.period_anchor_date, -1);
			_reload();
		},
		onNext: () => {
			args.period_anchor_date = shiftMonth(args.period_anchor_date, 1);
			_reload();
		},
	});

	addSelect(flow, {
		fieldname: "view_type",
		options: VIEW_OPTIONS,
		value: args.view_type,
		onChange: (v) => {
			args.view_type = v;
			resetProjectsAnchor(args);
			_reload();
		},
	});

	addSelect(flow, {
		fieldname: "period_range",
		options: PERIOD_OPTIONS,
		value: args.period_range,
		onChange: (v) => {
			args.period_range = v;
			resetProjectsAnchor(args);
			_reload();
		},
	});

	addButton(buttons, {
		title: __("Refresh Data"),
		text: "↻",
		onClick: _reload,
	});

	addButton(buttons, {
		title: __("Clear All Filters"),
		text: "✕",
		className: "wr-filters-clear-btn",
		onClick: () => {
			args.user = "";
			args.project = "";
			args.project_portfolio = "";
			args.user_group = "";
			args.worker_wtype = "";
			for (const key of Object.keys(links)) {
				links[key].set_value("");
			}
			workerSelect.set_value("");
			_reload();
		},
	});

	return () => ({ ...args });
}
