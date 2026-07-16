function resolveCellCtx(params) {
	const field =
		params?.colDef?.field ||
		params?.column?.getColDef?.()?.field ||
		"";
	const colId =
		params?.column?.getColId?.() ||
		params?.colDef?.colId ||
		field ||
		"";
	const row = params?.data || null;
	return { field: String(field || ""), colId: String(colId || ""), row };
}

function handleProjectDoubleClick(row, state) {
	if (!row) return;

	const frm = state?.frm || window.cur_frm;
	const NS = frappe.provide("project_workload_assignment.pwrProject");

	if (row.kind === "user" && row.email) {
		sessionStorage.setItem("workload_report_filter_user", row.email);
		sessionStorage.setItem("workload_report_should_filter", "true");
		frappe.set_route(
			"Form",
			"Projects Workload Report",
			"Projects Workload Report"
		);
		return;
	}

	if (row.kind === "task" && row.task_id) {
		const taskData = {
			name: row.task_id,
			value: row.task_id,
			project: (frm && frm.doc && frm.doc.name) || "",
			subject: row.task_subject || row.label,
			exp_start_date: row.exp_start_date,
			exp_end_date: row.exp_end_date,
		};

		if (typeof start_pwa_dialog === "function") {
			start_pwa_dialog(() => {
				if (typeof NS.debouncedLoadProjectWorkloadData === "function" && frm) {
					NS.debouncedLoadProjectWorkloadData(frm, true, true);
				}
			}, taskData);
		} else {
			console.error("[workload.project] start_pwa_dialog not found");
			frappe.msgprint(__("Функция открытия диалога PWA не найдена"));
		}
	}
	// role / period absence: TODO if product asks
}

export function createOnCellDoubleClicked(state) {
	return (params) => {
		const { row } = resolveCellCtx(params);
		handleProjectDoubleClick(row, state);
	};
}

export function bindNavigation(_ctx) {
	/* wired at table create */
}
