/* ISS-2026-00002 Phase 3a: data loading and table lifecycle for Projects Workload Report. */
frappe.provide("project_workload_assignment.pwrReport");

(function () {
	const NS = project_workload_assignment.pwrReport;
	const S = () => NS.state;

	function getTeamGridMethod() {
		frappe.provide("project_workload_assignment.pwrApi");
		const api = project_workload_assignment.pwrApi;
		return (
			(api && api.TEAM_GRID) ||
			"project_workload_assignment.project_workload_api.pwr_run_team_workload_grid"
		);
	}

	function createLazyProjectPlaceholderRow(userRow) {
		return {
			participant: __("Loading project details..."),
			_isLazyPlaceholder: true,
			_email: userRow._email,
			_parent: userRow.participant,
			_treeDepth: 1,
			indent: 1,
			expandable: false,
		};
	}

	function addLazyProjectPlaceholdersToTableData(tableData) {
		if (!tableData || !tableData.length) return tableData;

		const result = [];
		for (let i = 0; i < tableData.length; i++) {
			const row = tableData[i];
			result.push(row);

			if (
				row &&
				row._isUser &&
				row._email &&
				row.expandable &&
				row._detailsLoaded === false
			) {
				const nextRow = tableData[i + 1];
				const hasChildRow = nextRow && nextRow.indent > row.indent;
				if (!hasChildRow) {
					result.push(createLazyProjectPlaceholderRow(row));
				}
			}
		}

		return result;
	}

	async function get_projects_workload_data(frm, options = {}) {
		const mode = options.mode || "user_totals";
		const limit = options.limit || S().paging.limit;
		const offset = options.offset || 0;
		const detailUser = options.detail_user || "";

		console.log("=== START PWR V4 DATA LOAD ===");
		console.log("Request parameters:", {
			mode,
			limit,
			offset,
			detailUser,
			worker_wtype: NS.getPwrWorkerWtype(options),
			view_type: S().viewType,
			period_range: S().periodRange,
		});
		console.time("get_projects_workload_data_v2");

		try {
			const result = await frappe.call({
				method: getTeamGridMethod(),
				args: {
					user: frm.doc.user || "",
					project: frm.doc.project || "",
					project_portfolio: frm.doc.project_portfolio || "",
					user_group: frm.doc.user_group || "",
					view_type: S().viewType,
					period_range: S().periodRange,
					period_anchor_date:
						window.pwrPeriodAnchorDate || frappe.datetime.get_today(),
					load_actual: NS.getPwrLoadActualFlag(options),
					worker_wtype: NS.getPwrWorkerWtype(options),
					mode: mode,
					limit: limit,
					offset: offset,
					detail_user: detailUser,
				},
				freeze: mode === "user_totals" && offset === 0,
				freeze_message: __("Fetching projects workload data..."),
			});

			console.timeEnd("get_projects_workload_data_v2");
			console.log("Full V2 server response:", result);

			if (!result) {
				throw new Error(__("No response from server"));
			}
			if (!result.message) {
				throw new Error(__("Empty response from server"));
			}
			if (result.message.error) {
				throw new Error(__("Server error: {0}", [result.message.error]));
			}

			const message = result.message;
			const tree_data = message.tree_data || [];
			const periods = message.periods || [];
			let finalTableData = tree_data;

			if (mode !== "user_projects" && tree_data.length > 0) {
				const userAbsencesFromServer = {};
				tree_data.forEach((row) => {
					if (row._isUser && row._email && row._absences && row._absences.length > 0) {
						userAbsencesFromServer[row._email] = row._absences;
					}
				});
				finalTableData = NS.addAbsenceRowsToTableData(
					tree_data,
					userAbsencesFromServer
				);
				finalTableData = addLazyProjectPlaceholdersToTableData(finalTableData);
			}

			return {
				tree_data: finalTableData,
				periods: periods,
				mode: message.mode || mode,
				limit: message.limit || limit,
				offset: message.offset || offset,
				next_offset: message.next_offset,
				has_more: !!message.has_more,
				total_users: message.total_users || 0,
				users_count: message.users_count || 0,
				projects_count: message.projects_count || 0,
				assignments_count: message.assignments_count || 0,
				performance: message.performance || {},
			};
		} catch (error) {
			console.error("Error loading projects workload data:", error);
			frappe.msgprint(__("Error loading data: {0}", [error.message]));
			return {
				tree_data: [],
				periods: [],
				mode: mode,
				has_more: false,
				total_users: 0,
			};
		}
	}

	function debouncedLoadProjectsWorkloadData(frm, immediate = false, options = {}) {
		options = NS.withPwrLoadActualOptions(options);
		if (S().loadTimeout) {
			clearTimeout(S().loadTimeout);
			S().loadTimeout = null;
		}

		if (S().isLoading) {
			S().pendingReloadOptions = {
				...(S().pendingReloadOptions || {}),
				...options,
			};
			if (options.loadActual != null) {
				S().pendingReloadOptions.loadActual = options.loadActual;
			}
			return;
		}

		if (immediate) {
			load_projects_workload_data(frm, options);
			return;
		}

		S().loadTimeout = setTimeout(() => {
			if (!S().isLoading) {
				load_projects_workload_data(frm, options);
			}
		}, 300);
	}

	function resetProjectsWorkloadPagingState() {
		S().paging.offset = 0;
		S().paging.nextOffset = 0;
		S().paging.hasMore = false;
		S().paging.totalUsers = 0;
		S().paging.isLoadingMore = false;
		S().loadedProjectDetailsByUser = {};
	}

	function setProjectsWorkloadLoadMoreState(frm, isLoading = false) {
		return;
	}

	function collapseProjectsWorkloadRows(frm) {
		if (!frm || !frm.projects_workload_dt || !frm.projects_workload_dt.rowmanager) return;

		const rowmanager = frm.projects_workload_dt.rowmanager;
		if (typeof rowmanager.collapseAllNodes === "function") {
			rowmanager.collapseAllNodes();
		}
	}

	function refreshProjectsWorkloadTable(frm, tableData, periods, collapseAll = true) {
		if (!frm.projects_workload_dt) return;

		S().periods = periods || S().periods || [];
		S().tableData = tableData || [];
		window.projectsWorkloadTableData = S().tableData;
		const columns = NS.get_projects_workload_columns_definition(S().periods);
		frm.projects_workload_dt.refresh(S().tableData, columns, {
			rowHeight: NS.getProjectsWorkloadRowHeight(),
			workloadPeriods: S().periods,
			workloadViewType: S().viewType,
			showFact: NS.isPwrShowFactEnabled(),
		});
		if (collapseAll) {
			collapseProjectsWorkloadRows(frm);
		}

		setTimeout(() => {
			NS.applyProjectsWorkloadGridViewportHeight(frm);
			if (collapseAll) {
				collapseProjectsWorkloadRows(frm);
			}
			NS.setupProjectsWorkloadDoubleClick(frm);
			setupProjectsWorkloadLazyProjectLoading(frm);
			setupProjectsWorkloadAutoLoadOnScroll(frm);
		}, 100);
	}

	function findInsertIndexForProjectRows(userEmail) {
		let userIndex = -1;
		for (let i = 0; i < S().tableData.length; i++) {
			const row = S().tableData[i];
			if (row && row._isUser && row._email === userEmail) {
				userIndex = i;
				break;
			}
		}
		if (userIndex < 0) return -1;

		let insertIndex = userIndex + 1;
		while (insertIndex < S().tableData.length) {
			const row = S().tableData[insertIndex];
			if (!row) break;
			if (row._isProject && row._email === userEmail) {
				insertIndex = insertIndex + 1;
				continue;
			}
			break;
		}
		return insertIndex;
	}

	function removeProjectRowsForUser(userEmail) {
		const filtered = [];
		for (let i = 0; i < S().tableData.length; i++) {
			const row = S().tableData[i];
			if (
				row &&
				row._email === userEmail &&
				(row._isProject || row._isLazyPlaceholder)
			) {
				continue;
			}
			filtered.push(row);
		}
		S().tableData = filtered;
		window.projectsWorkloadTableData = S().tableData;
	}

	function openProjectsWorkloadUserRow(frm, userEmail) {
		if (!frm || !frm.projects_workload_dt || !frm.projects_workload_dt.rowmanager) return;
		if (!userEmail) return;

		const rowmanager = frm.projects_workload_dt.rowmanager;
		if (typeof rowmanager.openSingleNode === "function") {
			rowmanager.openSingleNode(`user:${userEmail}`);
		}
	}

	async function loadProjectDetailsForUser(frm, userRow) {
		if (!userRow || !userRow._email) return;
		const userEmail = userRow._email;

		if (S().loadedProjectDetailsByUser[userEmail]) {
			return;
		}

		S().loadedProjectDetailsByUser[userEmail] = true;
		userRow._detailsLoaded = true;
		console.log("Loading project details for user:", userEmail);

		const result = await get_projects_workload_data(frm, {
			mode: "user_projects",
			detail_user: userEmail,
			limit: S().paging.limit,
			offset: 0,
			loadActual: NS.getPwrLoadActualFlag(),
			workerWtype: NS.getPwrWorkerWtype(),
		});

		const projectRows = result.tree_data || [];
		removeProjectRowsForUser(userEmail);
		const insertIndex = findInsertIndexForProjectRows(userEmail);
		if (insertIndex < 0) return;

		projectRows.forEach((row) => {
			if (row) {
				delete row._agRowId;
			}
		});
		S().tableData.splice(insertIndex, 0, ...projectRows);
		window.projectsWorkloadTableData = S().tableData;
		refreshProjectsWorkloadTable(frm, S().tableData, S().periods, false);
		openProjectsWorkloadUserRow(frm, userEmail);
	}

	function setupProjectsWorkloadLazyProjectLoading(frm) {
		if (!frm.projects_workload_dt || !frm.projects_workload_dt.wrapper) return;
		const wrapper = frm.projects_workload_dt.wrapper;

		if (wrapper._projectsWorkloadLazyListenerAttached) return;
		wrapper._projectsWorkloadLazyListenerAttached = true;

		wrapper.addEventListener(
			"click",
			function (e) {
				if (!e.target || !e.target.closest) return;

				const toggle = e.target.closest(".dt-tree-node__toggle");
				const cell = toggle ? toggle.closest(".dt-cell") : e.target.closest(".dt-cell");
				if (!cell) return;

				const columnIndex = parseInt(cell.getAttribute("data-col-index"));
				if (!toggle && columnIndex !== 0) return;

				const rowElement = cell.closest(".dt-row");
				if (!rowElement) return;

				const rowData = NS.getProjectsWorkloadRowDataFromElement(frm, rowElement);
				if (!rowData || !rowData._isUser || !rowData._email) return;

				loadProjectDetailsForUser(frm, rowData);
			},
			true
		);
	}

	function setupProjectsWorkloadAutoLoadOnScroll(frm) {
		if (!frm || !frm.projects_workload_dt || !frm.projects_workload_dt.wrapper) return;

		const wrapper = frm.projects_workload_dt.wrapper;
		const scrollable =
			wrapper.querySelector(".ag-body-viewport") ||
			wrapper.querySelector(".dt-scrollable") ||
			(frm.projects_workload_dt.bodyScrollable || null);
		if (!scrollable || scrollable._projectsWorkloadAutoLoadAttached) return;

		scrollable._projectsWorkloadAutoLoadAttached = true;
		scrollable.addEventListener("scroll", function () {
			if (
				!S().paging.hasMore ||
				S().paging.isLoadingMore ||
				S().isLoading
			) {
				return;
			}

			const distanceToBottom =
				scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
			if (distanceToBottom <= 160) {
				loadMoreProjectsWorkloadUsers(frm);
			}
		});
	}

	async function load_projects_workload_data(frm, options = {}) {
		if (S().isLoading) {
			S().pendingReloadOptions = {
				...(S().pendingReloadOptions || {}),
				...options,
			};
			if (options.loadActual != null) {
				S().pendingReloadOptions.loadActual = options.loadActual;
			}
			console.log("Projects workload data is already loading, queued reload");
			return;
		}

		try {
			S().isLoading = true;
			resetProjectsWorkloadPagingState();
			console.log(
				"START loading projects workload data, view type:",
				S().viewType,
				"period range:",
				S().periodRange
			);
			console.time("load_projects_workload_data");

			if (frm.projects_workload_dt) {
				frm.projects_workload_dt.freeze(__("Loading data..."));
			}

			const result = await get_projects_workload_data(frm, {
				mode: "user_totals",
				limit: S().paging.limit,
				offset: 0,
				...options,
			});

			S().paging.offset = 0;
			S().paging.nextOffset = result.next_offset;
			S().paging.hasMore = !!result.has_more;
			S().paging.totalUsers = result.total_users || 0;
			S().periods = result.periods || [];
			S().tableData = result.tree_data || [];
			window.projectsWorkloadTableData = S().tableData;

			console.log(
				"Projects workload data loaded, rows:",
				S().tableData.length,
				"total users:",
				S().paging.totalUsers
			);

			if (frm.projects_workload_dt) {
				frm.projects_workload_dt.unfreeze();
				refreshProjectsWorkloadTable(frm, S().tableData, S().periods, true);
			}
			setProjectsWorkloadLoadMoreState(frm, false);
		} catch (error) {
			console.error("Error loading projects workload data:", error);
			if (frm.projects_workload_dt) {
				frm.projects_workload_dt.unfreeze();
			}
			frappe.msgprint(__("Error loading data: {0}", [error.message]));
		} finally {
			S().isLoading = false;
			console.timeEnd("load_projects_workload_data");
			console.log("END loading projects workload data");
			if (S().pendingReloadOptions) {
				const pending = S().pendingReloadOptions;
				S().pendingReloadOptions = null;
				debouncedLoadProjectsWorkloadData(frm, true, pending);
			}
		}
	}

	async function loadMoreProjectsWorkloadUsers(frm) {
		if (S().paging.isLoadingMore || !S().paging.hasMore) {
			return;
		}

		try {
			S().paging.isLoadingMore = true;
			setProjectsWorkloadLoadMoreState(frm, true);

			const result = await get_projects_workload_data(frm, {
				mode: "user_totals",
				limit: S().paging.limit,
				offset: S().paging.nextOffset || 0,
				loadActual: NS.getPwrLoadActualFlag(),
				workerWtype: NS.getPwrWorkerWtype(),
			});

			const newRows = result.tree_data || [];
			S().tableData = S().tableData.concat(newRows);
			window.projectsWorkloadTableData = S().tableData;
			S().paging.nextOffset = result.next_offset;
			S().paging.hasMore = !!result.has_more;
			S().paging.totalUsers = result.total_users || S().paging.totalUsers;

			refreshProjectsWorkloadTable(frm, S().tableData, S().periods, false);
		} catch (error) {
			console.error("Error loading more users:", error);
			frappe.msgprint(__("Error loading more users: {0}", [error.message]));
		} finally {
			S().paging.isLoadingMore = false;
			setProjectsWorkloadLoadMoreState(frm, false);
		}
	}

	async function render_projects_workload_table(frm) {
		// Dead path while Form uses workload-reports; keep no-op until pwr-report deleted.
		if (frm?._wrForm?.zones) {
			return;
		}
		if (frm._pwrRenderTablePromise) {
			return frm._pwrRenderTablePromise;
		}
		frm._pwrRenderTablePromise = render_projects_workload_table_inner(frm).finally(() => {
			frm._pwrRenderTablePromise = null;
		});
		return frm._pwrRenderTablePromise;
	}

	async function render_projects_workload_table_inner(frm) {
		const boot = project_workload_assignment.pwrBoot;
		boot?.log?.("render_projects_workload_table start", frm?.doc?.name || "new");
		console.time("render_projects_workload_table");
		const wrapper = frm.get_field("projects_workload_report");
		if (!wrapper) {
			boot?.log?.("render abort", "projects_workload_report field missing");
			console.timeEnd("render_projects_workload_table");
			return;
		}

		const $wrapper = wrapper.$wrapper;
		if (!$wrapper || !$wrapper.length) {
			boot?.log?.("render abort", "projects_workload_report wrapper empty");
			console.timeEnd("render_projects_workload_table");
			return;
		}

		$wrapper.addClass("projects_workload_report");
		await NS.scheduleProjectsWorkloadFiltersInit(frm);
		boot?.log?.("render filters section", frm._pwrFiltersRowInitialized ? "ok" : "skipped");

		if (frm.projects_workload_table_initialized && frm.projects_workload_dt) {
			boot?.log?.("render reinit data", "table exists");
			console.log("🔄 Table already initialized, loading data...");
			NS.applyProjectsWorkloadSectionLayout(frm);
			debouncedLoadProjectsWorkloadData(frm, true, {
				loadActual: NS.getPwrLoadActualFlag(),
			});
			console.timeEnd("render_projects_workload_table");
			return;
		}

		try {
			boot?.log?.("render await AgGrid");
			await NS.ensureProjectsWorkloadAgGrid();
			boot?.log?.("render AgGrid ready");
		} catch (error) {
			console.error("Error loading ProjectsWorkloadAgGrid:", error);
			boot?.log?.("render AgGrid failed", error.message || String(error));
			frappe.msgprint(__("Could not load table component: {0}", [error.message]));
			console.timeEnd("render_projects_workload_table");
			return;
		}

		if (frm.projects_workload_table_initialized && frm.projects_workload_dt) {
			boot?.log?.("render reinit data", "table exists after AgGrid");
			NS.applyProjectsWorkloadSectionLayout(frm);
			debouncedLoadProjectsWorkloadData(frm, true, {
				loadActual: NS.getPwrLoadActualFlag(),
			});
			console.timeEnd("render_projects_workload_table");
			return;
		}

		$wrapper.empty();
		frm.projects_workload_table_initialized = true;

		const table_container = $('<div class="projects-workload-table"></div>').appendTo(
			$wrapper
		);

		function init_projects_workload_table() {
			const temp_columns = [
				{
					name: __("Participant / Project"),
					id: "participant",
					width: 220,
					sortable: true,
					editable: false,
					focusable: false,
					treeView: true,
					format: () => {
						return `<div class="projects-workload-cell">${__("Loading...")}</div>`;
					},
				},
			];

			if (frm.projects_workload_dt) {
				frm.projects_workload_dt.destroy();
			}

			frm.projects_workload_dt = new ProjectsWorkloadAgGrid.Table(table_container[0], {
				columns: temp_columns,
				data: [],
				freezeMessage: __("Loading data..."),
				isRowExpandable: (row) => !!(row && row.expandable),
			});

			boot?.log?.("render table created");
			debouncedLoadProjectsWorkloadData(frm, true);
		}

		init_projects_workload_table();
		NS.applyProjectsWorkloadSectionLayout(frm);
		setTimeout(() => NS.applyProjectsWorkloadSectionLayout(frm), 0);
		boot?.log?.("render_projects_workload_table done");
		console.timeEnd("render_projects_workload_table");
	}

	Object.assign(NS, {
		createLazyProjectPlaceholderRow,
		addLazyProjectPlaceholdersToTableData,
		get_projects_workload_data,
		debouncedLoadProjectsWorkloadData,
		resetProjectsWorkloadPagingState,
		setProjectsWorkloadLoadMoreState,
		collapseProjectsWorkloadRows,
		refreshProjectsWorkloadTable,
		findInsertIndexForProjectRows,
		removeProjectRowsForUser,
		openProjectsWorkloadUserRow,
		loadProjectDetailsForUser,
		setupProjectsWorkloadLazyProjectLoading,
		setupProjectsWorkloadAutoLoadOnScroll,
		load_projects_workload_data,
		loadMoreProjectsWorkloadUsers,
		render_projects_workload_table,
	});

	window.loadProjectDetailsForUser = loadProjectDetailsForUser;
	window.debouncedLoadProjectsWorkloadData = debouncedLoadProjectsWorkloadData;
	window.load_projects_workload_data = load_projects_workload_data;

	$(document).on("pwr-workload-data-reload", function (_event, frm, meta) {
		if (!frm || frm.doctype !== "Projects Workload Report") {
			return;
		}
		if (meta && meta.periodAnchor) {
			window.pwrPeriodAnchorDate = meta.periodAnchor;
		}
		if (meta && typeof meta.showFact === "boolean") {
			window.pwrShowFact = meta.showFact;
		}
		if (frm._pwrUpdatePeriodNavLabel) {
			frm._pwrUpdatePeriodNavLabel();
		}
		debouncedLoadProjectsWorkloadData(frm, true, {
			loadActual: NS.getPwrLoadActualFlag(),
			workerWtype: window.pwrWorkerWtype || "",
		});
	});
	project_workload_assignment.pwrBoot?.log?.("pwr-report/data.js");
})();
