import { ReportSession } from "../session/report.js";
import { getSession } from "../session/base.js";

export function onPageLoad(wrapper, page) {
	const prev = getSession(wrapper);
	if (prev) {
		prev.destroy();
	}

	const main = page.main.get(0);
	main.classList.add("workload-report-page");

	const badge = document.createElement("div");
	badge.className = "workload-report-badge";
	badge.textContent = __("Projects Workload Report (v2) — preview");
	main.appendChild(badge);

	const filters = document.createElement("div");
	filters.className = "workload-report-filters";
	filters.setAttribute("data-workload-filters", "1");
	main.appendChild(filters);

	const gridShell = document.createElement("div");
	gridShell.className = "workload-report-grid-shell";
	main.appendChild(gridShell);

	const tableEl = document.createElement("div");
	tableEl.className = "workload-report-table workload-table";
	tableEl.setAttribute("data-workload-table", "1");
	gridShell.appendChild(tableEl);

	const session = new ReportSession({
		host: wrapper,
		container: tableEl,
		gridShellEl: gridShell,
		filtersEl: filters,
		page,
		wrapper,
	});

	void session.mount({ withFilters: true });
}
