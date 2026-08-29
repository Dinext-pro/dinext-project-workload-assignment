/**
 * Fetch MultiSelect options for PWR project-role filter.
 * @param {object} args — same shape as grid/chart args (+ optional project)
 * @param {string} [txt]
 * @returns {Promise<Array<{label:string,value:string,description:string}>>}
 */
export function fetchProjectRoleOptions(args = {}, txt = "") {
	return frappe
		.call({
			method: "project_workload_assignment.api.pwr_get_project_role_options",
			args: {
				project: args.project || "",
				user: args.user || "",
				project_portfolio: args.project_portfolio || "",
				user_group: args.user_group || "",
				view_type: args.view_type || "weekly",
				period_range: args.period_range || "quarter",
				period_anchor_date: args.period_anchor_date || frappe.datetime?.get_today?.() || "",
				worker_wtype: args.worker_wtype || "",
			},
		})
		.then((r) => {
			const options = r.message || [];
			if (!txt) {
				return options;
			}
			const q = String(txt).toLowerCase();
			return options.filter((option) =>
				(option.label || option.value || "").toLowerCase().includes(q)
			);
		});
}
