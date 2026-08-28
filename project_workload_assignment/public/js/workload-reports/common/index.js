import {
	getProjectsData,
	getUserProjects,
	getProjectData,
	getTeamCharts,
	getProjectCharts,
} from "./api.js";
import {
	mountProjectFilters,
	mountProjectsFiltersFromForm,
	getFormFiltersSection,
	parkFormLinkFields,
	unveilFormLinkFields,
} from "./filters/index.js";
import { loadTable, destroyTable, createProjectsExpandHandler, PAGE_SIZE } from "./table/index.js";
import { consumeOpenWorkloadTab } from "./table/navigation.js";
import {
	mountCharts,
	scheduleChartsReload,
	realignCharts,
	reloadCharts,
	destroyCharts,
	mountChartVisibilityToggle,
	flushChartsWhenVisible,
} from "./charts/index.js";
import { wrDebug, wrFieldSnapshot } from "./debug.js";

/**
 * @param {HTMLElement} host
 * @param {{ includeFilters?: boolean }} [opts]
 *   Filters belong inside root so fullscreen shell covers filters + table.
 */
const _mountLayout = (host, opts = {}) => {
	const includeFilters = opts.includeFilters !== false;
	host.classList.add("workload-reports-root");
	host.replaceChildren();

	let filters = null;
	if (includeFilters) {
		filters = document.createElement("div");
		filters.className = "workload-reports-filters";
		filters.dataset.workloadZone = "filters";
	}

	const table = document.createElement("div");
	table.className = "workload-reports-table";
	table.dataset.workloadZone = "table";

	const charts = document.createElement("div");
	charts.className = "workload-reports-charts";
	charts.dataset.workloadZone = "charts";

	if (filters) {
		host.append(filters, charts, table);
	} else {
		host.append(charts, table);
	}
	return { root: host, filters, table, charts };
};

frappe.provide("project_workload_assignment.workloadReports.common");

project_workload_assignment.workloadReports.common = {
	mountLayout: _mountLayout,
	mountProjectFilters,
	mountProjectsFiltersFromForm,
	getFormFiltersSection,
	parkFormLinkFields,
	unveilFormLinkFields,
	getProjectsData,
	getUserProjects,
	getProjectData,
	getTeamCharts,
	getProjectCharts,
	loadTable,
	destroyTable,
	createProjectsExpandHandler,
	PAGE_SIZE,
	mountCharts,
	scheduleChartsReload,
	realignCharts,
	reloadCharts,
	destroyCharts,
	mountChartVisibilityToggle,
	flushChartsWhenVisible,
	consumeOpenWorkloadTab,
	wrDebug,
	wrFieldSnapshot,
};
