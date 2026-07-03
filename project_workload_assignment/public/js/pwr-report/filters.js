/* ISS-2026-00002 Phase 3a: filter toolbar for Projects Workload Report. */
frappe.provide("project_workload_assignment.pwrReport");

(function () {
	const NS = project_workload_assignment.pwrReport;
	const S = () => NS.state;
	const FILTER_REQUIRED_FIELDS = ["user", "project", "project_portfolio", "user_group"];
	const FILTER_INIT_MAX_ATTEMPTS = 60;
	const FILTER_INIT_DELAY_MS = 50;

	function areProjectsWorkloadFilterFieldsReady(frm) {
		if (!frm || !frm.fields_dict) {
			return false;
		}
		return FILTER_REQUIRED_FIELDS.every((name) => frm.fields_dict[name]);
	}

	function compactPwrFilterControl($wrapper) {
		const shared = NS.pwrShared();
		if (shared.compactPwrFilterControl) {
			shared.compactPwrFilterControl($wrapper);
			return;
		}
		if (!$wrapper || !$wrapper.length) {
			return;
		}
		$wrapper.find(".help-box, .clearfix, .control-label").hide();
		$wrapper.css({ marginBottom: 0, paddingBottom: 0 });
		$wrapper.find(".form-group, .control-input-wrapper, .control-input").css({
			marginBottom: 0,
			paddingBottom: 0,
		});
	}

	function createFormFilter(frm, fieldname, label, container) {
		const field = frm.fields_dict[fieldname];
		if (!field) return;

		const filterWrapper = $(`
			<div class="form-filter-wrapper">
				<div class="filter-control"></div>
			</div>
		`).appendTo(container);

		const $originalControl = field.$wrapper;
		$originalControl.appendTo(filterWrapper.find(".filter-control"));

		if ($originalControl.find("input").length) {
			$originalControl.find("input").attr("placeholder", label);
		}

		if ($originalControl.find(".control-label").length) {
			$originalControl.find(".control-label").hide();
		}

		$originalControl.find(".help-box, .clearfix").hide();
		$originalControl.css({ marginBottom: 0, paddingBottom: 0 });
		$originalControl.find(".form-group, .control-input-wrapper, .control-input").css({
			marginBottom: 0,
			paddingBottom: 0,
		});

		return filterWrapper;
	}

	function normalizeProjectsWorkloadFiltersRow(frm) {
		if (!frm || !frm.wrapper) {
			return;
		}
		const $row = $(frm.wrapper).find(
			".projects-workload-filters-section .unified-filters-row"
		);
		if (!$row.length) {
			return;
		}
		$row.find(".help-box, .clearfix, .control-label").hide();
		$row.find(".form-filter-wrapper .frappe-control").each(function () {
			compactPwrFilterControl($(this));
		});
		$row.find(".pwr-filters-flow .frappe-control").each(function () {
			compactPwrFilterControl($(this));
		});
	}

	function applyProjectsWorkloadGridViewportHeight(frm) {
		const charts = (window.project_workload_assignment || {}).charts;
		if (charts && typeof charts.syncGridViewportHeight === "function") {
			charts.syncGridViewportHeight(frm);
			return;
		}

		if (!frm || !frm.wrapper) return;

		const $root = $(frm.wrapper);
		const $gridRoot = $root.find(".projects_workload_report").first();
		const $gridSlot = $gridRoot.find(".projects-workload-table").first();
		if (!$gridRoot.length || !$gridSlot.length) return;

		$gridRoot.css({
			display: "flex",
			flexDirection: "column",
			boxSizing: "border-box",
			height: "auto",
			minHeight: 0,
			maxHeight: "none",
		});

		const gridTop = $gridSlot[0].getBoundingClientRect().top;
		const gridHeight = Math.max(720, window.innerHeight - gridTop - 16);

		$gridSlot.css({
			height: gridHeight,
			minHeight: gridHeight,
			maxHeight: gridHeight,
			flex: "1 1 auto",
			minWidth: 0,
			boxSizing: "border-box",
		});
		$gridRoot.find(".projects-workload-ag-grid").css({
			height: gridHeight,
			minHeight: gridHeight,
			maxHeight: gridHeight,
			margin: 0,
			flex: "1 1 auto",
			boxSizing: "border-box",
		});
	}

	function applyProjectsWorkloadSectionLayout(frm) {
		if (!frm || !frm.wrapper) return;

		const $root = $(frm.wrapper);
		const zeroBox = {
			padding: 0,
			margin: 0,
			width: "100%",
			maxWidth: "100%",
			boxSizing: "border-box",
		};

		const $tableSection = $root.find('[data-fieldname="section_break_nyf1"]');
		if ($tableSection.length) {
			$tableSection.css({
				padding: 0,
				marginLeft: 0,
				marginRight: 0,
				width: "100%",
				maxWidth: "100%",
				boxSizing: "border-box",
			});
			$tableSection.find(".section-head").hide();
			$tableSection.find(".section-body").css(zeroBox);
			$tableSection.find('.form-column, [class*="col-sm-"], [class*="col-md-"]').css({
				...zeroBox,
				flex: "0 0 100%",
			});

			const $field = $tableSection.find('[data-fieldname="projects_workload_report"]');
			$field.css(zeroBox);
			$field.find(".control-label").hide();
			$field.find(".frappe-control, .control-input-wrapper, .control-input, .form-group").css(
				zeroBox
			);
		}

		applyProjectsWorkloadGridViewportHeight(frm);

		if (!frm._pwrViewportResizeAttached) {
			frm._pwrViewportResizeAttached = true;
			$(window).on(
				"resize.projectsWorkloadReport",
				frappe.utils.debounce(() => {
					if (cur_frm && cur_frm.doctype === "Projects Workload Report") {
						applyProjectsWorkloadGridViewportHeight(cur_frm);
					}
				}, 150)
			);
		}

		$root
			.find(".projects-workload-filters-section .projects-workload-controls.unified-filters-row")
			.css({
				paddingTop: 0,
				paddingBottom: 0,
				paddingLeft: 8,
				paddingRight: 8,
				margin: 0,
				border: "none",
				background: "transparent",
			});
		normalizeProjectsWorkloadFiltersRow(frm);
	}

	function getProjectsWorkloadFiltersSection(frm) {
		if (!frm || !frm.wrapper) return $();
		const $wrapper = $(frm.wrapper);
		const $userField = $wrapper.find('[data-fieldname="user"]');
		if (!$userField.length) return $();
		const $section = $userField.closest(".form-section");
		if (!$section.length) return $();
		const $body = $section.find(".section-body").first();
		return $body.length ? $body : $section;
	}

	function createPeriodRangeDropdown(container) {
		const control = frappe.ui.form.make_control({
			parent: container[0],
			df: {
				fieldtype: "Select",
				fieldname: "period_range",
				options: [
					{ value: "quarter", label: __("Quarter") },
					{ value: "half_year", label: __("Half Year") },
					{ value: "year", label: __("Year") },
				],
				default: S().periodRange,
				change: function () {
					if (this.value && this.value !== S().periodRange) {
						S().periodRange = this.value;
						window.currentPeriodRange = S().periodRange;
						NS.resetPwrPeriodAnchorForFilters();
						console.log(`🔄 Period range changed to: ${S().periodRange}`);
						if (cur_frm) {
							NS.debouncedLoadProjectsWorkloadData(cur_frm, true);
						}
					}
				},
			},
			render_input: true,
		});

		control.set_value(S().periodRange);

		if (control.$label) {
			control.$label.hide();
		}
		compactPwrFilterControl(control.$wrapper);

		return control;
	}

	function createViewTypeDropdown(container) {
		const control = frappe.ui.form.make_control({
			parent: container[0],
			df: {
				fieldtype: "Select",
				fieldname: "view_type",
				options: [
					{ value: "daily", label: __("Daily") },
					{ value: "weekly", label: __("Weekly") },
					{ value: "monthly", label: __("Monthly") },
				],
				default: S().viewType,
				change: function () {
					if (this.value && this.value !== S().viewType) {
						S().viewType = this.value;
						window.currentViewType = S().viewType;
						window.pwrViewType = S().viewType;
						NS.resetPwrPeriodAnchorForFilters();
						console.log(`🔄 View type changed to: ${S().viewType}`);
						if (cur_frm) {
							NS.debouncedLoadProjectsWorkloadData(cur_frm, true);
						}
					}
				},
			},
			render_input: true,
		});

		control.set_value(S().viewType);

		if (control.$label) {
			control.$label.hide();
		}
		compactPwrFilterControl(control.$wrapper);

		return control;
	}

	function createUnifiedFilterRow(frm, $wrapper) {
		let controls, $flow, buttonsContainer;
		const shared = NS.pwrShared();
		if (shared.createPwrFilterRowShell) {
			({ controls, $flow, buttonsContainer } = shared.createPwrFilterRowShell($wrapper, {
				extraRowClass: "pb-1",
			}));
		} else {
			controls = $(
				'<div class="projects-workload-controls unified-filters-row d-flex flex-nowrap align-items-start w-100 pb-1"></div>'
			).appendTo($wrapper);
			$flow = $(
				'<div class="pwr-filters-flow d-flex flex-wrap align-items-center"></div>'
			).appendTo(controls);
			buttonsContainer = $(
				'<div class="pwr-filters-group pwr-filters-group--right filter-buttons d-flex flex-shrink-0 align-items-center justify-content-end"></div>'
			).appendTo(controls);
		}

		createFormFilter(frm, "user", __("User"), $flow);
		createFormFilter(frm, "project", __("Project"), $flow);
		createFormFilter(frm, "project_portfolio", __("Project Portfolio"), $flow);
		createFormFilter(frm, "user_group", __("User Group"), $flow);
		NS.createPwrWorkerTypeFilter($flow);
		NS.createPwrShowFactFilter($flow);
		NS.createPwrPeriodNavFilter($flow, frm);
		createViewTypeDropdown($flow);
		createPeriodRangeDropdown($flow);

		const filterBtnClass =
			shared.PWR_FILTER_BTN_CLASS || "btn btn-default btn-sm";

		const refreshBtn = $(`
			<button class="${filterBtnClass}" title="${__("Refresh Data")}">
				↻
			</button>
		`).appendTo(buttonsContainer);

		refreshBtn.on("click", function () {
			console.log("🔄 Manual refresh triggered");
			NS.resetCache();
			NS.debouncedLoadProjectsWorkloadData(frm, true);
		});

		const clearBtn = $(`
			<button class="${filterBtnClass}" title="${__("Clear All Filters")}">
				☒
			</button>
		`).appendTo(buttonsContainer);

		clearBtn.on("click", function () {
			console.log("🔄 Clear all filters triggered");
			frm.set_value("user", "");
			frm.set_value("project", "");
			frm.set_value("project_portfolio", "");
			frm.set_value("user_group", "");
			window.pwrWorkerWtype = "";
			$(".pwr-filter-worker-wtype-select").val("");

			frm.filters_changed = true;
			NS.debouncedLoadProjectsWorkloadData(frm, true);
		});

		return controls;
	}

	function clearProjectsWorkloadFilterRows($section) {
		if (!$section || !$section.length) {
			return;
		}
		$section.find(".projects-workload-controls, .unified-filters-row").remove();
	}

	function ensureProjectsWorkloadFiltersSection(frm) {
		const boot = project_workload_assignment.pwrBoot;
		const $section = getProjectsWorkloadFiltersSection(frm);
		if (!$section.length) {
			boot?.log?.("filters section", "user section not found");
			return false;
		}

		if (!areProjectsWorkloadFilterFieldsReady(frm)) {
			boot?.log?.("filters section", "form fields not ready");
			return false;
		}

		$section.closest(".form-section").addClass("projects-workload-filters-section");

		if (frm._pwrFiltersRowInitialized && $section.find(".unified-filters-row").length) {
			boot?.log?.("filters section", "already initialized");
			normalizeProjectsWorkloadFiltersRow(frm);
			applyProjectsWorkloadSectionLayout(frm);
			return true;
		}

		clearProjectsWorkloadFilterRows($section);
		createUnifiedFilterRow(frm, $section);
		normalizeProjectsWorkloadFiltersRow(frm);
		$section.find(".form-column").each(function () {
			if (!$(this).find(".frappe-control").length) {
				$(this).hide();
			}
		});
		frm._pwrFiltersRowInitialized = true;
		applyProjectsWorkloadSectionLayout(frm);
		project_workload_assignment.pwrBoot?.log?.("filters section", "initialized");
		return true;
	}

	function scheduleProjectsWorkloadFiltersInit(frm) {
		if (!frm || frm.doctype !== "Projects Workload Report") {
			return Promise.resolve(false);
		}
		if (ensureProjectsWorkloadFiltersSection(frm)) {
			return Promise.resolve(true);
		}
		if (frm._pwrFiltersInitPromise) {
			return frm._pwrFiltersInitPromise;
		}

		const boot = project_workload_assignment.pwrBoot;
		frm._pwrFiltersInitGen = (frm._pwrFiltersInitGen || 0) + 1;
		const initGen = frm._pwrFiltersInitGen;
		frm._pwrFiltersInitPromise = new Promise((resolve) => {
			let attempts = 0;
			const tick = () => {
				if (
					frm !== window.cur_frm ||
					frm.doctype !== "Projects Workload Report" ||
					frm._pwrFiltersInitGen !== initGen
				) {
					if (frm._pwrFiltersInitGen === initGen) {
						frm._pwrFiltersInitPromise = null;
					}
					resolve(false);
					return;
				}
				if (ensureProjectsWorkloadFiltersSection(frm)) {
					frm._pwrFiltersInitPromise = null;
					resolve(true);
					return;
				}
				attempts += 1;
				if (attempts >= FILTER_INIT_MAX_ATTEMPTS) {
					boot?.log?.(
						"filters section",
						`init timed out after ${FILTER_INIT_MAX_ATTEMPTS} attempts`
					);
					frm._pwrFiltersInitPromise = null;
					resolve(false);
					return;
				}
				setTimeout(tick, FILTER_INIT_DELAY_MS);
			};
			tick();
		});
		return frm._pwrFiltersInitPromise;
	}

	Object.assign(NS, {
		compactPwrFilterControl,
		createFormFilter,
		clearProjectsWorkloadFilterRows,
		normalizeProjectsWorkloadFiltersRow,
		applyProjectsWorkloadGridViewportHeight,
		applyProjectsWorkloadSectionLayout,
		getProjectsWorkloadFiltersSection,
		createPeriodRangeDropdown,
		createViewTypeDropdown,
		createUnifiedFilterRow,
		ensureProjectsWorkloadFiltersSection,
		scheduleProjectsWorkloadFiltersInit,
	});
	project_workload_assignment.pwrBoot?.log?.("pwr-report/filters.js");
})();
