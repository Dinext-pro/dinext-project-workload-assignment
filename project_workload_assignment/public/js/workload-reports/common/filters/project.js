import {
	WORKER_OPTIONS,
	projectDefaults,
	resetProjectWindow,
	shiftMonth,
} from "./periods.js";
import { mountRow, addSelect, addMultiSelectList } from "./controls.js";
import { fetchProjectRoleOptions } from "./role-options.js";
import { createFilterSession } from "./session.js";

/**
 * @param {HTMLElement} el
 * @param {Function} onChange
 * @param {{ getProject?: () => string }} [opts]
 */
export function mountProjectFilters(el, onChange, opts = {}) {
	const args = projectDefaults();
	const session = createFilterSession(args, {
		onReload: onChange,
		onShift: (next, dir) => {
			next.date_from = shiftMonth(next.date_from, dir);
			next.date_to = shiftMonth(next.date_to, dir);
		},
		onResetWindow: resetProjectWindow,
	});
	const { flow } = mountRow(el);
	const getProject = typeof opts.getProject === "function" ? opts.getProject : () => "";

	addSelect(flow, {
		fieldname: "worker_wtype",
		options: WORKER_OPTIONS,
		value: args.worker_wtype,
		onChange: (v) => {
			args.worker_wtype = v;
			session.reload();
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
			session.reload();
		},
	});

	return session;
}
