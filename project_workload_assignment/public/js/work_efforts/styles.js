// we-styles.js — подключает WE CSS на форме Project (паттерн как PWR).
// doctype_css для Project есть, но link-inject остаётся источником правды:
// при уже загруженном we-table.css раньше early-return глотал we-v2.css.

const WE_STYLESHEETS = [
	"/assets/project_workload_assignment/css/we-table.css",
	"/assets/project_workload_assignment/css/we-v2.css",
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
