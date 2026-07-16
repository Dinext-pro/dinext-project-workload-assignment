/* ISS-2026-00002 Phase 3b: Project Workload tab — form hooks and table render. */
(function () {
	const NS = project_workload_assignment.pwrProject;
	const WL_DEBUG = NS.WL_DEBUG;

	/** Kill-switch: localStorage.pwr_workload_legacy=1 → legacy AG Grid path. */
	function useLegacyWorkload() {
		try {
			return localStorage.getItem("pwr_workload_legacy") === "1";
		} catch (_err) {
			return false;
		}
	}

	async function render_project_workload_table(frm) {
		if (WL_DEBUG) {
			console.log("render_project_workload_table CALLED");
			console.log("Table initialized flag:", frm.project_workload_table_initialized);
		}

		const timer = NS.startTimer("render_project_workload_table");
		const wrapper = frm.get_field("custom_workload");
		if (!wrapper) {
			if (WL_DEBUG) {
				console.log("Wrapper not found!");
			}
			NS.endTimer(timer);
			return;
		}

		const $wrapper = wrapper.$wrapper;
		if (!$wrapper || !$wrapper.length) {
			if (WL_DEBUG) {
				console.log("$wrapper not found or empty!");
			}
			NS.endTimer(timer);
			return;
		}

		$wrapper.addClass("project_workload_container d-flex flex-column");

		if (frm.project_workload_table_initialized) {
			NS.applyProjectWorkloadSectionLayout(frm);
			NS.requestProjectWorkloadChartReload(frm);
			if (WL_DEBUG) {
				console.log("Table already initialized - skipping creation");
			}
			NS.endTimer(timer);
			return;
		}

		if (WL_DEBUG) {
			console.log("CREATING NEW TABLE...");
		}

		// Phase 7: in-place DinextTable (default). Rollback: pwr_workload_legacy=1
		if (!useLegacyWorkload()) {
			try {
				await frappe.require(["dinext-table.bundle.js", "workload.bundle.js"]);
				const wl = project_workload_assignment.workload;
				if (wl && wl.project && typeof wl.project.mount === "function") {
					await wl.project.mount({ frm, wrapper: $wrapper });
					NS.endTimer(timer);
					return;
				}
				console.warn(
					"[pwr-project] workload.project.mount missing; falling back to legacy AG Grid"
				);
			} catch (error) {
				console.error("Error loading workload DinextTable path:", error);
				frappe.msgprint(
					__("Не удалось загрузить новую таблицу загрузки: {0}", [error.message])
				);
				NS.endTimer(timer);
				return;
			}
		}

		try {
			await NS.ensureProjectWorkloadAgGrid();
		} catch (error) {
			console.error("Error loading ProjectsWorkloadAgGrid:", error);
			frappe.msgprint(__("Не удалось загрузить компонент таблицы: {0}", [error.message]));
			NS.endTimer(timer);
			return;
		}

		$wrapper.empty();
		NS.createProjectFilterRow(frm, $wrapper);

		const table_container = $('<div class="project-workload-table"></div>').appendTo($wrapper);

		if (WL_DEBUG) {
			console.log("Initializing ProjectsWorkloadAgGrid...");
		}

		frm.project_workload_dt = new ProjectsWorkloadAgGrid.Table(table_container[0], {
			columns: [],
			data: [],
			rowHeight: NS.getPwrRowHeight(),
			headerHeight: 70,
			participantWidth: 250,
			indentSize: 18,
			extraClass: "project-workload-ag-grid",
			freezeMessage: __("Идет загрузка данных..."),
			isRowExpandable: function (row) {
				if (!row || row.expandable !== true) {
					return false;
				}
				return this.rowHasTreeChildren(row);
			},
			onCellDoubleClick: NS.handleProjectWorkloadCellDoubleClick,
		});

		if (WL_DEBUG) {
			console.log("ProjectsWorkloadAgGrid created");
		}

		NS.applyProjectWorkloadSectionLayout(frm);
		setTimeout(() => NS.applyProjectWorkloadSectionLayout(frm), 0);

		NS.ensureDatesInitialized();
		NS.updateDateControls();

		if (WL_DEBUG) {
			console.log("Loading initial data...");
		}

		NS.load_project_workload_data(frm, false)
			.then(() => {
				window.lastLoadedProject = frm.doc.name;
				window.lastLoadedTime = new Date();
				frm.project_workload_table_initialized = true;
				if (WL_DEBUG) {
					console.log("Table initialized flag set to TRUE after successful load");
				}
				NS.requestProjectWorkloadChartReload(frm);
				NS.endTimer(timer);
				if (WL_DEBUG) {
					console.log("Initial data loaded successfully");
				}
			})
			.catch((error) => {
				console.error("Initial data load failed:", error);
				NS.endTimer(timer);
			});

		if (NS.state.tabChangeHandler) {
			$(".nav-link[data-toggle='tab']").off("shown.bs.tab", NS.state.tabChangeHandler);
			NS.state.tabChangeHandler = null;
		}

		NS.state.tabChangeHandler = function (e) {
			const tab_fieldname = $(e.target).attr("data-fieldname");
			if (WL_DEBUG) {
				console.log("Переключено на вкладку:", tab_fieldname);
			}

			if (tab_fieldname === "custom_загрузка") {
				NS.applyProjectWorkloadSectionLayout(frm);
				NS.requestProjectWorkloadChartReload(frm);
				setTimeout(() => {
					$wrapper?.removeClass("animate");
				}, 1000);
			} else {
				setTimeout(() => {
					$wrapper?.addClass("animate");
				}, 1000);
			}
		};

		$(".nav-link[data-toggle='tab']").on("shown.bs.tab", NS.state.tabChangeHandler);
	}

	frappe.ui.form.on("Project", {
		onload(frm) {
			if (WL_DEBUG) {
				console.log("Project Workload: onload");
			}

			NS.resetStateOnLoad();
			window.isRedrawingGantt = false;

			frm.project_workload_table_initialized = false;
			if (frm.project_workload_dt) {
				frm.project_workload_dt = null;
			}
			frm._pwrWorkloadV2 = false;
			frm._pwrWorkloadState = null;

			if (WL_DEBUG) {
				console.log("Dates will be initialized when needed, table flag reset to false");
			}

			if (typeof applyProjectWorkloadStyle === "function") {
				applyProjectWorkloadStyle();
			}
		},

		refresh(frm) {
			if (WL_DEBUG) {
				console.log("Project Workload: refresh");
			}
			frm.project_workload_table_initialized = false;
			if (frm.project_workload_dt) {
				frm.project_workload_dt = null;
			}
			frm._pwrWorkloadV2 = false;
			frm._pwrWorkloadState = null;
			render_project_workload_table(frm);
		},

		before_save(frm) {
			const s = NS.state;
			if (s.displayDateFrom && s.displayDateTo) {
				frm.doc.custom_workload_date_from = s.displayDateFrom;
				frm.doc.custom_workload_date_to = s.displayDateTo;
			}
		},
	});

	$(document).on("pwr-workload-data-reload", function (_event, frm, meta) {
		if (!frm || frm.doctype !== "Project") {
			return;
		}
		if (meta && typeof meta.showFact === "boolean") {
			window.pwrShowFact = meta.showFact;
		}
		const s = NS.state;
		if (meta && meta.periodAnchor) {
			s.displayDateFrom = meta.periodAnchor;
			window.displayDateFrom = s.displayDateFrom;
		}
		if (meta && meta.periodAnchorTo) {
			s.displayDateTo = meta.periodAnchorTo;
			window.displayDateTo = s.displayDateTo;
		}
		NS.syncGlobals();
		NS.updateDateControls();
		if (frm._pwrUpdatePeriodNavLabel) {
			frm._pwrUpdatePeriodNavLabel();
		}
		NS.debouncedLoadProjectWorkloadData(frm, true, true);
	});

	Object.assign(NS, {
		render_project_workload_table,
	});
})();
