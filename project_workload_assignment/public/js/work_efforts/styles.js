// we-styles.js — подключает we-table.css на форме Project (паттерн как PWR)
// ISS-2025-01239

const WE_TABLE_CSS = "/assets/project_workload_assignment/css/we-table.css";

function applyWorkEffortsStyles() {
	if (document.querySelector(`link[href^="${WE_TABLE_CSS}"]`)) return;

	const link = document.createElement("link");
	link.id = "work-efforts-styles";
	link.rel = "stylesheet";
	link.href = WE_TABLE_CSS;
	document.head.appendChild(link);
}

Object.assign(project_workload_assignment.work_efforts, { applyWorkEffortsStyles });

$(document).ready(() => project_workload_assignment.work_efforts.applyWorkEffortsStyles());

if (typeof frappe !== "undefined") {
	frappe.after_ajax(() => project_workload_assignment.work_efforts.applyWorkEffortsStyles())
}
