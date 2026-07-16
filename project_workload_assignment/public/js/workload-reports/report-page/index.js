function onPageLoad(_wrapper, page) {
	const { common } = project_workload_assignment.workloadReports;
	const main = page.main.get(0);

	// Desk may re-enter page; avoid stacking roots/tables.
	if (main._wrPage) {
		common.destroyTable?.(main._wrPage.zones?.table);
		common.destroyCharts?.(main._wrPage.zones?.charts);
		main.replaceChildren();
	}

	main.classList.add("workload-reports-page");
	main.replaceChildren();

	const root = document.createElement("div");
	main.appendChild(root);

	const zones = common.mountLayout(root);
	const pageSize = common.PAGE_SIZE || 20;

	const expand = common.createProjectsExpandHandler({
		getFilters: () => getArgs(),
		fetchUserProjects: (args) => common.getUserProjects(args),
	});

	const _projectsArgs = (extra = {}) => ({
		...getArgs(),
		mode: "user_totals",
		limit: pageSize,
		offset: 0,
		...extra,
	});

	const _reload = () => {
		const args = getArgs();
		const tableDone = common.loadTable(
			zones.table,
			() => common.getProjectsData(_projectsArgs()),
			{
				viewType: args.view_type,
				showFact: !!args.load_actual,
				onExpandRow: expand.onExpandRow,
				resetExpand: expand.reset,
				hydrateExpanded: expand.hydrateExpanded,
				onLoadMore: ({ offset, limit }) =>
					common.getProjectsData(_projectsArgs({ offset, limit })),
			}
		);
		const chartsDone = common.scheduleChartsReload(zones.charts);
		void Promise.all([tableDone, chartsDone]).then(() => {
			common.realignCharts?.(zones.charts);
		});
	};

	const getArgs = common.mountProjectsFilters(zones.filters, _reload);

	common.mountCharts(zones.charts, {
		surface: "report",
		getArgs: () => getArgs(),
		getTableApi: () => zones.table._wrTable?.table?.api ?? null,
	});
	common.mountChartVisibilityToggle(zones.filters, zones.charts);

	main._wrPage = { zones, reload: _reload };
	_reload();
}

frappe.provide("project_workload_assignment.workloadReports.report");

project_workload_assignment.workloadReports.report = { onPageLoad };
