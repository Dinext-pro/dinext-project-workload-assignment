// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt
console.log("[PWR] eval projects_workload_report.js");
window.addEventListener("error", function (e) {
	window.__PWR_LAST_ERROR = (e.message || "") + " @ " + (e.filename || "") + ":" + e.lineno + ":" + e.colno;
	document.title = "PWRERR|" + window.__PWR_LAST_ERROR;
});
window.addEventListener("unhandledrejection", function (e) {
	window.__PWR_LAST_ERROR = "unhandledrejection: " + (e.reason && e.reason.message ? e.reason.message : String(e.reason));
	document.title = "PWRERR|" + window.__PWR_LAST_ERROR;
});
setTimeout(function () {
	if (!window.__PWR_LAST_ERROR) {
		var trace = (window.__PWR_BOOT_TRACE || []).map(function (t) { return t.step; }).join(",");
		document.title = "PWRTRACE|" + trace;
	}
}, 4000);

// frappe.ui.form.on("Projects Workload Report", {
// 	refresh(frm) {

// 	},
// });
