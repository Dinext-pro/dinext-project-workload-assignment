/**
 * Lightweight work efforts progress for Project Details dashboard bar.
 * Calls get_work_efforts_progress (scalars only) — no consolidated/grid prefetch.
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
		if (typeof globalThis.render_work_efforts_percentage_chart === "function") {
			globalThis.render_work_efforts_percentage_chart(frm);
		}
		return data;
	} catch (e) {
		console.error("[WorkEfforts] get_work_efforts_progress failed", e);
		return null;
	}
}

frappe.ui.form.on("Project", {
	refresh(frm) {
		load_work_efforts_progress(frm);
	},
});

Object.assign(project_workload_assignment.work_efforts, {
	load_work_efforts_progress,
});

// Bundle loads async — refresh may have run before this module; catch up on open Project.
const _we_progress_frm = typeof cur_frm !== "undefined" ? cur_frm : null;
if (_we_progress_frm?.doctype === "Project" && !_we_progress_frm.doc?.__islocal) {
	load_work_efforts_progress(_we_progress_frm);
}
