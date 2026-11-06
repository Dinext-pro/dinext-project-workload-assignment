import {
	WORKER_OPTIONS,
	WORKLOAD_BASE_PLAN,
	getWorkloadBaseOptions,
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
 * @param {{ getProject?: () => string, workload_base?: string, onWorkloadBaseChange?: (v: string) => void }} [opts]
 */
export function mountProjectFilters(el, onChange, opts = {}) {
	const args = projectDefaults();
	if (opts.workload_base) {
		args.workload_base = opts.workload_base;
	}
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

	session._workloadBaseSelect = addSelect(flow, {
		fieldname: "workload_base",
		options: getWorkloadBaseOptions(),
		value: args.workload_base || WORKLOAD_BASE_PLAN,
		onChange: (v) => {
			const next = v || WORKLOAD_BASE_PLAN;
			args.workload_base = next;
			opts.onWorkloadBaseChange?.(next);
			session.reload();
		},
	});

	return session;
}
