import {
	WORKER_OPTIONS,
	getDefaultWorkloadBase,
	getWorkloadBaseOptions,
	projectDefaults,
	resetProjectWindow,
	shiftMonth,
} from "./periods.js";
import { mountRow, addSelect, addMultiSelectList } from "./controls.js";
import { fetchProjectRoleOptions } from "./role-options.js";
import { createFilterSession } from "./session.js";

/**
 * Report filter only — does not persist Project.custom_workload_base.
 * @param {HTMLElement} el
 * @param {Function} onChange
 * @param {{ getProject?: () => string, workload_base?: string }} [opts]
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
		value: args.workload_base || getDefaultWorkloadBase(),
		onChange: (v) => {
			const next = v || getDefaultWorkloadBase();
			// mount set_value may fire change — ignore no-op
			if (next === args.workload_base) {
				return;
			}
			args.workload_base = next;
			session.reload();
		},
	});

	session.setWorkloadBase = (value) => {
		const next = value || getDefaultWorkloadBase();
		args.workload_base = next;
		session._workloadBaseSelect?.set_value?.(next);
	};

	return session;
}
