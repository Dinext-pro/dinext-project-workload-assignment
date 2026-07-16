// we-styles.js — подключает WE CSS на форме Project.
// W2: только work-efforts.css (shell + DinextTable); we-table.css снят.

const WE_STYLESHEETS = [
	"/assets/project_workload_assignment/css/work-efforts.css",
];

function ensureStylesheet(href) {
	if (document.querySelector(`link[href^="${href}"]`)) return;

	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.href = href;
	document.head.appendChild(link);
}

function applyWorkEffortsStyles() {
	for (const href of WE_STYLESHEETS) {
		ensureStylesheet(href);
	}
}

Object.assign(project_workload_assignment.work_efforts, { applyWorkEffortsStyles });

$(document).ready(() => project_workload_assignment.work_efforts.applyWorkEffortsStyles());

if (typeof frappe !== "undefined") {
	frappe.after_ajax(() => project_workload_assignment.work_efforts.applyWorkEffortsStyles());
}
