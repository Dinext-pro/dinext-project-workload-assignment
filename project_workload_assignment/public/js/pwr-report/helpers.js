/* ISS-2026-00002 Phase 3a: shared state and helpers for Projects Workload Report. */
frappe.provide("project_workload_assignment.pwrReport");

(function () {
	project_workload_assignment.pwrBoot?.log?.("pwr-report/helpers.js start");
	try {
	const NS = project_workload_assignment.pwrReport;

	function pwrShared() {
		return project_workload_assignment.pwrShared || {};
	}

	NS.state = {
		isLoading: false,
		loadTimeout: null,
		cache: {
			userData: {},
			taskCache: {},
			projectCache: {},
			assignmentCache: {},
			userAbsenceCache: {},
			workerCache: {},
			timesheetTemplateCache: {},
			workingHoursOverrideCache: {},
			userWorkingHoursCache: {},
			holidayCache: {},
			globalCache: {},
		},
		tableData: [],
		isRedrawing: false,
		viewType: "weekly",
		periodRange: "quarter",
		pendingReloadOptions: null,
		periods: [],
		paging: {
			limit: 20,
			offset: 0,
			nextOffset: 0,
			hasMore: false,
			totalUsers: 0,
			isLoadingMore: false,
		},
		loadedProjectDetailsByUser: {},
		cacheHits: 0,
		cacheMisses: 0,
		performanceLog: {},
	};

	window.currentViewType = NS.state.viewType;
	window.pwrViewType = NS.state.viewType;
	window.currentPeriodRange = NS.state.periodRange;
	window.pwrPeriodAnchorDate = window.pwrPeriodAnchorDate || frappe.datetime.get_today();
	window.pwrShowFact = !!window.pwrShowFact;
	window.pwrWorkerWtype = window.pwrWorkerWtype || "";

	if (!window._pwrViewTypePageShowBound) {
		window._pwrViewTypePageShowBound = true;
		window.addEventListener("pageshow", function (event) {
			if (!event.persisted) {
				return;
			}
			window.pwrViewType = NS.state.viewType;
			window.currentViewType = NS.state.viewType;
		});
	}

	function isPwrShowFactEnabled() {
		const shared = pwrShared();
		return shared.isPwrShowFactEnabled
			? shared.isPwrShowFactEnabled(window.cur_frm)
			: !!window.pwrShowFact;
	}

	function getPwrLoadActualFlag(options) {
		const shared = pwrShared();
		return shared.getPwrLoadActualFlag
			? shared.getPwrLoadActualFlag(options)
			: isPwrShowFactEnabled()
				? 1
				: 0;
	}

	function withPwrLoadActualOptions(options = {}) {
		if (options.loadActual != null) {
			return options;
		}
		return { ...options, loadActual: getPwrLoadActualFlag() };
	}

	function renderPwrPlanFactCell(options) {
		const shared = pwrShared();
		return shared.renderPwrPlanFactCell ? shared.renderPwrPlanFactCell(options) : null;
	}

	function resetPwrPeriodAnchorForFilters() {
		window.pwrPeriodAnchorDate = frappe.datetime.get_today();
		const charts = (window.project_workload_assignment || {}).charts;
		if (charts && typeof charts.resetTeamPeriodAnchorToToday === "function") {
			charts.resetTeamPeriodAnchorToToday();
		}
	}

	function getPwrPeriodAnchorLabel(frm) {
		const shared = pwrShared();
		return shared.getPwrPeriodAnchorLabel
			? shared.getPwrPeriodAnchorLabel(frm || cur_frm)
			: frappe.datetime.str_to_user(
					window.pwrPeriodAnchorDate || frappe.datetime.get_today()
				);
	}

	function triggerPwrWorkloadDataReload(frm) {
		const shared = pwrShared();
		if (shared.triggerPwrWorkloadDataReload) {
			shared.triggerPwrWorkloadDataReload(frm || cur_frm, {
				showFact: isPwrShowFactEnabled(),
				periodAnchor: window.pwrPeriodAnchorDate,
			});
		}
	}

	function createPwrPeriodNavFilter(container, frm) {
		const shared = pwrShared();
		return shared.createPwrPeriodNavFilter
			? shared.createPwrPeriodNavFilter(container, frm)
			: $();
	}

	function reloadProjectsWorkloadTableForWorkerFilter(frm) {
		const reloadFn =
			window.debouncedLoadProjectsWorkloadData ||
			project_workload_assignment.pwrReport.debouncedLoadProjectsWorkloadData;
		if (typeof reloadFn !== "function") {
			console.error("[PWR] debouncedLoadProjectsWorkloadData is not available");
			return;
		}
		reloadFn(frm, true, {
			workerWtype: window.pwrWorkerWtype || "",
			loadActual: getPwrLoadActualFlag(),
		});
	}

	function createPwrWorkerTypeFilter(container) {
		const shared = pwrShared();
		return shared.createPwrWorkerTypeFilter
			? shared.createPwrWorkerTypeFilter(container)
			: $();
	}

	function createPwrShowFactFilter(container) {
		const shared = pwrShared();
		return shared.createPwrShowFactFilter
			? shared.createPwrShowFactFilter(container)
			: $();
	}

	function ensureProjectsWorkloadAgGrid() {
		const boot = project_workload_assignment.pwrBoot;
		const shared = pwrShared();
		if (shared.ensureAgGrid) {
			boot?.log?.("ensureProjectsWorkloadAgGrid", "via pwrShared.ensureAgGrid");
			return shared.ensureAgGrid();
		}
		boot?.log?.("ensureProjectsWorkloadAgGrid", "fallback frappe.require ag-grid");
		return ensureProjectsWorkloadAgGridDirect();
	}

	function ensureProjectsWorkloadAgGridDirect() {
		if (
			window.ProjectsWorkloadAgGrid &&
			typeof window.ProjectsWorkloadAgGrid.ensure === "function"
		) {
			return Promise.resolve(window.ProjectsWorkloadAgGrid.ensure());
		}
		return new Promise((resolve, reject) => {
			frappe.require(["/assets/project_workload_assignment/js/charts/ag-grid.js"], () => {
				if (
					window.ProjectsWorkloadAgGrid &&
					typeof window.ProjectsWorkloadAgGrid.ensure === "function"
				) {
					resolve(window.ProjectsWorkloadAgGrid.ensure());
					return;
				}
				reject(new Error("ProjectsWorkloadAgGrid не загрузился"));
			});
		});
	}

	function hasProjectManagerRole() {
		return frappe.user.has_role("Dinext_User");
	}

	function startTimer(name) {
		const uniqueName = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
		NS.state.performanceLog[uniqueName] = {
			start: performance.now(),
			end: null,
			duration: null,
			originalName: name,
		};
		return uniqueName;
	}

	function endTimer(uniqueName) {
		const entry = NS.state.performanceLog[uniqueName];
		if (entry) {
			entry.end = performance.now();
			entry.duration = entry.end - entry.start;
			console.log(
				`⏱️ ${entry.originalName}: ${entry.duration.toFixed(2)}ms`
			);
		}
	}

	function printPerformanceSummary() {
		console.log("=== PERFORMANCE SUMMARY ===");
		Object.keys(NS.state.performanceLog).forEach((key) => {
			if (NS.state.performanceLog[key].duration !== null) {
				console.log(
					`${key}: ${NS.state.performanceLog[key].duration.toFixed(2)}ms`
				);
			}
		});
		console.log("=== END SUMMARY ===");
	}

	function getCachedData(cacheKey, fetchFunction, ttlMinutes = 10) {
		const now = Date.now();
		const cache = NS.state.cache;

		if (!cache.globalCache) {
			cache.globalCache = {};
		}

		const cached = cache.globalCache[cacheKey];

		if (cached && now - cached.timestamp < ttlMinutes * 60 * 1000) {
			NS.state.cacheHits++;
			console.log(`🔄 Cache HIT: ${cacheKey}`);
			return Promise.resolve(cached.data);
		}

		NS.state.cacheMisses++;
		console.log(`🔄 Cache MISS: ${cacheKey}`);

		return fetchFunction().then((result) => {
			cache.globalCache[cacheKey] = {
				data: result,
				timestamp: now,
			};
			return result;
		});
	}

	async function getUsersFromUserGroup(userGroupName) {
		if (!userGroupName) {
			return [];
		}

		const cacheKey = `user_group_${userGroupName}`;

		return getCachedData(
			cacheKey,
			async () => {
				try {
					console.log(`Fetching users from user group: ${userGroupName}`);

					const userGroupDoc = await frappe.db.get_doc("User Group", userGroupName);

					if (!userGroupDoc || !userGroupDoc.user_group_members) {
						console.log("No user group members found");
						return [];
					}

					const users = userGroupDoc.user_group_members
						.map((member) => member.user)
						.filter((user) => user);

					console.log(
						`Found ${users.length} users in group ${userGroupName}:`,
						users
					);
					return users;
				} catch (error) {
					console.error(`Error fetching user group ${userGroupName}:`, error);
					return [];
				}
			},
			10
		);
	}

	function getProjectsWorkloadRowDataFromElement(frm, rowElement) {
		if (!rowElement) return null;

		const rowIndex = parseInt(rowElement.getAttribute("data-row-index"));
		if (isNaN(rowIndex)) return null;

		const dt = frm && frm.projects_workload_dt;
		const datamanager = dt && dt.datamanager;

		if (datamanager && typeof datamanager.getRow === "function") {
			const dtRow = datamanager.getRow(rowIndex);
			if (dtRow && dtRow._isUser) return dtRow;

			const sourceIndex =
				dtRow && dtRow.meta ? parseInt(dtRow.meta.rowIndex) : rowIndex;
			if (
				!isNaN(sourceIndex) &&
				NS.state.tableData &&
				NS.state.tableData[sourceIndex]
			) {
				return NS.state.tableData[sourceIndex];
			}
		}

		if (datamanager && datamanager.data && datamanager.data[rowIndex]) {
			return datamanager.data[rowIndex];
		}

		return NS.state.tableData && NS.state.tableData[rowIndex]
			? NS.state.tableData[rowIndex]
			: null;
	}

	function setupProjectsWorkloadDoubleClick(frm) {
		if (!frm.projects_workload_dt) return;

		frm.projects_workload_dt.wrapper.addEventListener("dblclick", function (e) {
			const target = e.target;
			const cell = target.closest(".dt-cell");

			if (!cell) return;

			const rowElement = cell.closest(".dt-row");
			if (!rowElement) return;

			const rowData = getProjectsWorkloadRowDataFromElement(frm, rowElement);
			if (!rowData) {
				console.log("No row data found for clicked row element");
				return;
			}

			const columnIndex = parseInt(cell.getAttribute("data-col-index"));
			if (isNaN(columnIndex)) return;

			const columns = frm.projects_workload_dt.datamanager.columns;
			const column = columns[columnIndex];

			console.log("Double click - row data:", rowData);
			console.log("Double click - column:", column);

			NS.handleDoubleClick(rowData, column);
		});
	}

	function openProjectTab(projectName, fieldName) {
		if (!projectName) return;

		console.log("🔄 Opening project:", projectName);

		function _debounce(fn, ms) {
			let t = null;
			return function (...args) {
				clearTimeout(t);
				t = setTimeout(() => fn.apply(this, args), ms);
			};
		}

		function goToField() {
			cur_frm.scroll_to_field(fieldName);
		}

		frappe.set_route("Form", "Project", projectName).then(_debounce(goToField, 300));
	}

	async function handleDoubleClick(rowData, column) {
		console.log("Processing double click - rowData:", rowData);
		console.log("Processing double click - column id:", column.id);

		if (column.id === "participant" && rowData._isProject && rowData._project) {
			console.log("Opening workload for project:", rowData._project);
			openProjectTab(rowData._project, "custom_workload");
		} else if (
			column.id &&
			column.id.startsWith("workload_") &&
			rowData._isProject &&
			rowData._project
		) {
			console.log(
				"Opening workload project from workload cell for:",
				rowData._project
			);
			openProjectTab(rowData._project, "custom_workload");
		} else if (
			column.id &&
			column.id.startsWith("workload_") &&
			rowData._isAbsenceRow &&
			rowData._email
		) {
			console.log("Opening user absence for:", rowData._email);
			const dateMatch = column.id.match(/workload_(\d{4}-\d{2}-\d{2})/);
			if (dateMatch) {
				const dateStr = dateMatch[1];
				await NS.openUserAbsence(rowData._email, dateStr);
			} else {
				console.log("No date found in column id");
				frappe.msgprint(
					__("Could not determine date for opening absence request")
				);
			}
		} else {
			console.log(
				"Double click not handled - rowData._isProject:",
				rowData._isProject,
				"rowData._isUser:",
				rowData._isUser,
				"rowData._isAbsenceRow:",
				rowData._isAbsenceRow
			);
		}
	}

	function isNonWorkingDay(date, holidays) {
		if (!date || !holidays || holidays.length === 0) {
			return false;
		}

		const targetDateStr = date;

		for (let i = 0; i < holidays.length; i++) {
			const holiday = holidays[i];
			if (holiday.date === targetDateStr) {
				return true;
			}
		}

		return false;
	}

	function getHolidaysForRow(data, period) {
		if (!data) return [];

		const userHolidays = data._userHolidays || [];

		if (data._isUser || data._isAbsenceRow) {
			return userHolidays;
		}

		if (data._isProject) {
			const projectHolidays = data._projectHolidays || [];
			if (!userHolidays.length) {
				return projectHolidays;
			}
			if (!projectHolidays.length) {
				return userHolidays;
			}
			return projectHolidays.concat(userHolidays);
		}

		return [];
	}

	function getPwrWorkerWtype(options) {
		if (options && options.workerWtype != null) {
			return options.workerWtype || "";
		}
		return window.pwrWorkerWtype || "";
	}

	function getProjectsWorkloadRowHeight() {
		const shared = pwrShared();
		return shared.getPwrRowHeight
			? shared.getPwrRowHeight()
			: isPwrShowFactEnabled()
				? 54
				: 40;
	}

	function resetCache() {
		NS.state.cache = {
			userData: {},
			taskCache: {},
			projectCache: {},
			assignmentCache: {},
			userAbsenceCache: {},
			workerCache: {},
			timesheetTemplateCache: {},
			workingHoursOverrideCache: {},
			userWorkingHoursCache: {},
			holidayCache: {},
			globalCache: {},
		};
		NS.state.cacheHits = 0;
		NS.state.cacheMisses = 0;
	}

	Object.assign(NS, {
		pwrShared,
		isPwrShowFactEnabled,
		getPwrLoadActualFlag,
		withPwrLoadActualOptions,
		renderPwrPlanFactCell,
		resetPwrPeriodAnchorForFilters,
		getPwrPeriodAnchorLabel,
		triggerPwrWorkloadDataReload,
		createPwrPeriodNavFilter,
		reloadProjectsWorkloadTableForWorkerFilter,
		createPwrWorkerTypeFilter,
		createPwrShowFactFilter,
		ensureProjectsWorkloadAgGrid,
		hasProjectManagerRole,
		startTimer,
		endTimer,
		printPerformanceSummary,
		getCachedData,
		getUsersFromUserGroup,
		getProjectsWorkloadRowDataFromElement,
		setupProjectsWorkloadDoubleClick,
		openProjectTab,
		handleDoubleClick,
		isNonWorkingDay,
		getHolidaysForRow,
		getPwrWorkerWtype,
		getProjectsWorkloadRowHeight,
		resetCache,
	});

	window.handleDoubleClick = handleDoubleClick;
	project_workload_assignment.pwrBoot?.log?.("pwr-report/helpers.js");
	} catch (error) {
		project_workload_assignment.pwrBoot?.fail?.("pwr-report/helpers.js", error);
	}
})();
