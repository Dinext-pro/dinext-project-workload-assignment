/**
 * Refetch work efforts scalars after WE mutations.
 * First paint of the Details bar is owned by project/dashboard.js.
 */

async function load_work_efforts_progress(frm) {
	if (!frm?.doc?.name || frm.doc.__islocal) return null;

	const project = frm.doc.name;
	if (frm._we_progress_project && frm._we_progress_project !== project) {
		frm.we_progress = null;
		frm.we_progress_chart = null;
	}

	try {
		const data = await frappe.xcall(
			"project_workload_assignment.api.get_work_efforts_progress",
			{ project }
		);
		if (!data || frm.doc?.name !== project) return null;
		frm.we_progress = data;
		frm._we_progress_project = project;
		frm._we_progress_inflight = null;
		if (typeof globalThis.render_work_efforts_percentage_chart === "function") {
			globalThis.render_work_efforts_percentage_chart(frm);
		}
		return data;
	} catch (e) {
		console.error("[WorkEfforts] get_work_efforts_progress failed", e);
		return null;
	}
}

Object.assign(project_workload_assignment.work_efforts, {
	load_work_efforts_progress,
});
