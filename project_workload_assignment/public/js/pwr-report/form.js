/* ISS-2026-00002 Phase 3a: form entry for Projects Workload Report. */
(function () {
	project_workload_assignment.pwrBoot?.log?.("pwr-report/form.js start");
	try {
frappe.ui.form.on("Projects Workload Report", {
	onload: function (frm) {
		const NS = project_workload_assignment.pwrReport;
		const S = NS.state;

		frm.page.clear_indicator();

		const shouldFilter = sessionStorage.getItem("workload_report_should_filter");
		if (shouldFilter === "true") {
			const userEmail = sessionStorage.getItem("workload_report_filter_user");

			sessionStorage.removeItem("workload_report_should_filter");
			sessionStorage.removeItem("workload_report_filter_user");

			if (userEmail) {
				console.log("Setting filter from session in onload:", userEmail);
				frm.set_value("user", userEmail);
				frm.set_value("project", "");
				frm.set_value("project_portfolio", "");
				frm.set_value("user_group", "");
			}
		} else if (NS.hasProjectManagerRole()) {
			frm.set_value("user", "");
			frm.set_value("project", "");
			frm.set_value("project_portfolio", "");
			frm.set_value("user_group", "");
		}

		console.log("Projects Workload Report: onload");
		NS.resetCache();
		S.tableData = [];
		window.projectsWorkloadTableData = S.tableData;
		S.periods = [];
		NS.resetProjectsWorkloadPagingState();
		S.isRedrawing = false;
		S.isLoading = false;
		const $filterSection = NS.getProjectsWorkloadFiltersSection
			? NS.getProjectsWorkloadFiltersSection(frm)
			: $();
		if ($filterSection.length) {
			$filterSection.find(".projects-workload-controls, .unified-filters-row").remove();
		}
		frm._pwrFiltersRowInitialized = false;
		frm._pwrFiltersInitPromise = null;
		frm._pwrFiltersInitGen = (frm._pwrFiltersInitGen || 0) + 1;
		frm.projects_workload_table_initialized = false;
		frm._pwrRenderTablePromise = null;

		if (typeof applyProjectsWorkloadStyle === "function") {
			applyProjectsWorkloadStyle();
		}

		frm.filters_changed = false;
		frm.page.set_primary_action(null);
		frm.page.clear_menu();
	},

	refresh: function (frm) {
		const boot = project_workload_assignment.pwrBoot;
		boot?.log?.("form refresh start", frm?.doc?.name || "new");
		try {
			const NS = project_workload_assignment.pwrReport;
			if (!NS || typeof NS.render_projects_workload_table !== "function") {
				boot?.log?.("form refresh abort", "pwrReport.render_projects_workload_table missing");
				console.error("[PWR] pwrReport module not loaded", NS);
				return;
			}

			console.log("Projects Workload Report: refresh");
			frm.page.clear_indicator();

			const shouldFilter = sessionStorage.getItem("workload_report_should_filter");
			const userEmail = sessionStorage.getItem("workload_report_filter_user");

			sessionStorage.removeItem("workload_report_should_filter");
			sessionStorage.removeItem("workload_report_filter_user");

			if (shouldFilter === "true" && userEmail) {
				console.log("Setting filter from session in refresh:", userEmail);
				frm.set_value("project", "");
				frm.set_value("project_portfolio", "");
				frm.set_value("user_group", "");
				frm.set_value("user", userEmail);
			}

			frm.page.set_primary_action(null);
			frm.disable_save();
			NS.render_projects_workload_table(frm);
			boot?.log?.("form refresh dispatched render");
		} catch (error) {
			boot?.log?.("form refresh error", error.message || String(error));
			console.error("[PWR] refresh failed", error);
			frappe.msgprint(__("Projects Workload Report UI failed to load: {0}", [error.message]));
		}
	},

	user: function (frm) {
		console.log("User filter changed:", frm.doc.user);
		frm.filters_changed = true;
		project_workload_assignment.pwrReport.debouncedLoadProjectsWorkloadData(frm);
	},

	project: function (frm) {
		console.log("Project filter changed:", frm.doc.project);
		frm.filters_changed = true;
		project_workload_assignment.pwrReport.debouncedLoadProjectsWorkloadData(frm);
	},

	project_portfolio: function (frm) {
		console.log("Project Portfolio filter changed:", frm.doc.project_portfolio);
		frm.filters_changed = true;
		project_workload_assignment.pwrReport.debouncedLoadProjectsWorkloadData(frm);
	},

	user_group: function (frm) {
		console.log("User Group filter changed:", frm.doc.user_group);
		frm.filters_changed = true;
		project_workload_assignment.pwrReport.debouncedLoadProjectsWorkloadData(frm);
	},
});
project_workload_assignment.pwrBoot?.log?.("pwr-report/form.js registered");
	} catch (error) {
		project_workload_assignment.pwrBoot?.fail?.("pwr-report/form.js", error);
	}
})();
