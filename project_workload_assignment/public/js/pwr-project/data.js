/* ISS-2026-00002 Phase 3b: Project Workload tab — API fetch and table data load. */
(function () {
	const NS = project_workload_assignment.pwrProject;
	const WL_DEBUG = NS.WL_DEBUG;
	frappe.provide("project_workload_assignment.pwrApi");
	const PROJECT_TREE =
		project_workload_assignment.pwrApi.PROJECT_TREE ||
		"project_workload_assignment.project_workload_api.pwr_run_project_workload_tree";

	async function get_project_workload_data(frm, forceRefresh) {
		const timer = NS.startTimer("get_project_workload_data");
		if (WL_DEBUG) {
			console.log("=== START PROJECT WORKLOAD DATA LOADING ===");
		}

		try {
			NS.ensureDatesInitialized();
			const s = NS.state;
			const cacheKey = `project_workload_${frm.doc.name}_${s.currentViewType}_${s.displayDateFrom}_${s.displayDateTo}_${NS.getPwrLoadActualFlag()}`;

			const result = await NS.getCachedData(
				cacheKey,
				async () =>
					frappe.call({
						method: PROJECT_TREE,
						args: {
							project: frm.doc.name,
							view_type: s.currentViewType,
							date_from: s.displayDateFrom,
							date_to: s.displayDateTo,
							load_actual: NS.getPwrLoadActualFlag(),
							worker_wtype: window.pwrWorkerWtype || "",
						},
						freeze_message: __("Fetching project workload data..."),
					}),
				5,
				forceRefresh
			);

			NS.endTimer(timer);

			if (!result || !result.message) {
				throw new Error(__("Empty response from server"));
			}

			if (result.message.error) {
				throw new Error(__("Server error: {0}", [result.message.error]));
			}

			const { tree_data, periods, metadata, users_count, tasks_count, assignments_count } =
				result.message;

			if (WL_DEBUG) {
				console.log("Project workload data loaded:", {
					tree_data_length: tree_data ? tree_data.length : 0,
					periods_length: periods ? periods.length : 0,
					view_type: s.currentViewType,
					users_count,
					tasks_count,
					assignments_count,
					display_period: metadata?.display_dates,
				});
			}

			window.projectWorkloadMetadata = metadata || {};
			if (metadata) {
				NS.indexMetadata(metadata);
			} else {
				window.projectWorkloadIndexed = null;
			}

			if (metadata?.project_dates) {
				s.projectDates = metadata.project_dates;
			}

			return {
				tree_data: tree_data || [],
				periods: periods || [],
			};
		} catch (error) {
			NS.endTimer(timer);
			console.error("Error loading project workload data:", error);
			frappe.msgprint(__("Error loading data: {0}", [error.message]));
			return {
				tree_data: [],
				periods: [],
			};
		}
	}

	function debouncedLoadProjectWorkloadData(frm, immediate, forceRefresh) {
		const s = NS.state;
		if (s.loadTimeout) {
			clearTimeout(s.loadTimeout);
			s.loadTimeout = null;
		}

		if (immediate && !s.isLoading) {
			NS.load_project_workload_data(frm, forceRefresh);
			return;
		}

		s.loadTimeout = setTimeout(() => {
			if (!s.isLoading) {
				NS.load_project_workload_data(frm, forceRefresh);
			}
		}, 300);
	}

	async function load_project_workload_data(frm, forceRefresh) {
		if (WL_DEBUG) {
			console.log(">>> load_project_workload_data STARTED (3-level)", {
				isProjectWorkloadLoading: NS.state.isLoading,
				forceRefresh,
				hasDT: !!frm.project_workload_dt,
			});
		}

		if (NS.state.isLoading) {
			if (WL_DEBUG) {
				console.log("Project workload data is already loading, skipping duplicate call");
			}
			return;
		}

		const timer = NS.startTimer("load_project_workload_data");
		const wrapper = frm.get_field("custom_workload");
		const $wrapper = wrapper?.$wrapper;

		window._pw_cache = { availableHours: {} };

		try {
			NS.state.isLoading = true;
			if (WL_DEBUG) {
				console.log(
					"START loading project workload data with view type:",
					NS.state.currentViewType
				);
			}

			NS.ensureDatesInitialized();
			NS.syncGlobals();

			if (WL_DEBUG) {
				console.log(
					`Loading data for period: ${NS.state.displayDateFrom} to ${NS.state.displayDateTo}`
				);
			}

			if (frm.project_workload_dt) {
				frm.project_workload_dt.freeze();
			}

			const result = await get_project_workload_data(frm, forceRefresh);
			const table_data = result.tree_data;
			const server_periods = result.periods;

			NS.state.tableData = table_data;
			frm.project_workload_periods = server_periods || [];

			if (frm.project_workload_dt) {
				const periods = server_periods;
				if (WL_DEBUG) {
					console.log(`Using ${periods.length} periods for ${NS.state.currentViewType} view`);
					console.log(
						`Table data has ${table_data.length} rows with levels:`,
						table_data
							.map((r) => ({ level: r.level, name: r.participant }))
							.slice(0, 10)
					);
				}

				const columns = NS.get_project_workload_columns_definition(periods);

				$wrapper?.addClass("animate");
				frm.project_workload_dt.refresh(table_data, columns, {
					workloadPeriods: periods,
					workloadViewType: NS.state.currentViewType,
					rowHeight: NS.getPwrRowHeight(),
					showFact: NS.isPwrShowFactEnabled(),
				});

				if (frm.project_workload_dt.rowmanager) {
					frm.project_workload_dt.rowmanager.collapseAllNodes();
				}

				frm.project_workload_dt.unfreeze();
				NS.setupTaskDoubleClickHandler(frm);
				NS.requestProjectWorkloadChartReload(frm);
			}
		} catch (error) {
			console.error("Error loading project workload data:", error);
			if (frm.project_workload_dt) {
				frm.project_workload_dt.unfreeze();
			}
		} finally {
			NS.state.isLoading = false;
			NS.endTimer(timer);
			if (WL_DEBUG) {
				console.log("END loading project workload data");
			}

			const active_tab = frm.get_active_tab();
			const fieldname = active_tab?.df.fieldname;

			if (fieldname === "custom_загрузка") {
				setTimeout(() => {
					$wrapper?.removeClass("animate");
				}, 1000);
			}
		}
	}

	Object.assign(NS, {
		get_project_workload_data,
		debouncedLoadProjectWorkloadData,
		load_project_workload_data,
	});

	window.debouncedLoadProjectWorkloadData = debouncedLoadProjectWorkloadData;
})();
