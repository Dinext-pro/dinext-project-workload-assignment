/* ISS-2026-00002 Phase 3b: Project Workload tab — filter toolbar and layout. */
(function () {
	const NS = project_workload_assignment.pwrProject;
	const WL_DEBUG = NS.WL_DEBUG;
	const pwrShared = NS.pwrShared;

	function compactPwrFilterControl($wrapper) {
		const fn = pwrShared().compactPwrFilterControl;
		if (fn) {
			fn($wrapper);
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

	function normalizeProjectWorkloadFiltersRow(frm) {
		if (!frm || !frm.fields_dict.custom_workload) {
			return;
		}
		const $wrapper = frm.fields_dict.custom_workload.$wrapper;
		if (!$wrapper || !$wrapper.length) {
			return;
		}
		const $row = $wrapper.find(".unified-filters-row").first();
		if (!$row.length) {
			return;
		}
		$row.find(".help-box, .clearfix, .control-label").hide();
		$row.find(".frappe-control").each(function () {
			compactPwrFilterControl($(this));
		});
	}

	function createPwrPeriodNavFilter(container, frm) {
		const fn = pwrShared().createPwrPeriodNavFilter;
		if (!fn) {
			return $();
		}
		return fn(container, frm, {
			fallbackPeriodLabel: () => NS.getPwrPeriodAnchorLabel(frm),
			onShiftPeriod: (_activeFrm, direction) => {
				const charts = project_workload_assignment.charts;
				if (charts && typeof charts.shiftPeriod === "function") {
					charts.shiftPeriod(_activeFrm, direction);
					return;
				}
				NS.shiftProjectWorkloadPeriod(direction);
			},
		});
	}

	function createPwrWorkerTypeFilter(container) {
		const fn = pwrShared().createPwrWorkerTypeFilter;
		return fn ? fn(container) : $();
	}

	function createPwrShowFactFilter(container) {
		const fn = pwrShared().createPwrShowFactFilter;
		return fn ? fn(container) : $();
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
				default: NS.state.currentViewType,
				change: function () {
					if (this.value && this.value !== NS.state.currentViewType) {
						NS.state.currentViewType = this.value;
						NS.syncGlobals();
						NS.resetProjectWorkloadPeriodAnchor();
						if (WL_DEBUG) {
							console.log(`View type changed to: ${NS.state.currentViewType}`);
						}
						if (window.cur_frm && NS.debouncedLoadProjectWorkloadData) {
							NS.debouncedLoadProjectWorkloadData(window.cur_frm, true, true);
						}
					}
				},
			},
			render_input: true,
		});

		control.set_value(NS.state.currentViewType);
		if (control.$label) {
			control.$label.hide();
		}
		compactPwrFilterControl(control.$wrapper);
		return control;
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
				default: NS.state.currentPeriodRange,
				change: function () {
					if (this.value && this.value !== NS.state.currentPeriodRange) {
						NS.state.currentPeriodRange = this.value;
						NS.syncGlobals();
						if (WL_DEBUG) {
							console.log(`Period range changed to: ${NS.state.currentPeriodRange}`);
						}
						NS.resetProjectWorkloadPeriodAnchor();
						if (window.cur_frm && NS.debouncedLoadProjectWorkloadData) {
							NS.debouncedLoadProjectWorkloadData(window.cur_frm, true, true);
						}
					}
				},
			},
			render_input: true,
		});

		control.set_value(NS.state.currentPeriodRange);
		if (control.$label) {
			control.$label.hide();
		}
		compactPwrFilterControl(control.$wrapper);
		return control;
	}

	function applyProjectWorkloadSectionLayout(frm) {
		if (!frm || !frm.fields_dict.custom_workload) {
			return;
		}

		const zeroBox = {
			padding: 0,
			margin: 0,
			width: "100%",
			maxWidth: "100%",
			boxSizing: "border-box",
		};
		const wrapper = frm.fields_dict.custom_workload;
		const $wrapper = wrapper.$wrapper;
		if (!$wrapper || !$wrapper.length) {
			return;
		}

		$wrapper.css({ ...zeroBox, display: "flex", flexDirection: "column", maxWidth: "100%" });

		const $tabPane = $wrapper.closest(
			'#project-custom_загрузка, .tab-pane[data-fieldname="custom_загрузка"]'
		);
		if ($tabPane.length) {
			$tabPane.css({ ...zeroBox, paddingLeft: 0, paddingRight: 0 });
			$tabPane.find(".form-section.card-section, .form-section").css({
				padding: 0,
				margin: 0,
				border: "none",
				boxShadow: "none",
				background: "transparent",
				width: "100%",
				maxWidth: "100%",
			});
			$tabPane.find(".section-body, .form-column, [class*='col-sm-']").css(zeroBox);
		}

		const $field = $wrapper.closest('[data-fieldname="custom_workload"]');
		if ($field.length) {
			$field.css(zeroBox);
			$field.find(".control-label").hide();
			$field.find(".frappe-control, .control-input-wrapper, .control-input, .form-group").css(
				zeroBox
			);
		}

		const $section = $wrapper.closest(".form-section");
		if ($section.length) {
			$section.css({
				padding: 0,
				margin: 0,
				border: "none",
				boxShadow: "none",
				background: "transparent",
				width: "100%",
				maxWidth: "100%",
			});
			$section.find(".section-head").hide();
			$section.find(".section-body").css(zeroBox);
			$section.find(".form-column, [class*='col-sm-']").css(zeroBox);
		}

		$wrapper.find(".projects-workload-controls.unified-filters-row, .unified-filters-row").css({
			paddingTop: 8,
			paddingBottom: 0,
			paddingLeft: 8,
			paddingRight: 8,
			margin: 0,
			border: "none",
			background: "transparent",
		});

		normalizeProjectWorkloadFiltersRow(frm);

		$wrapper.find(".project-workload-table, .project-workload-ag-grid").css({
			...zeroBox,
			marginTop: 0,
		});
	}

	function createProjectFilterRow(frm, $wrapper) {
		let controls;
		let $flow;
		let buttonsContainer;
		const shellFn = pwrShared().createPwrFilterRowShell;

		if (shellFn) {
			({ controls, $flow, buttonsContainer } = shellFn($wrapper, {
				extraRowClass: "pt-1 pb-1",
			}));
		} else {
			controls = $(
				'<div class="projects-workload-controls unified-filters-row d-flex flex-nowrap align-items-start w-100 pt-1 pb-1"></div>'
			).appendTo($wrapper);
			$flow = $(
				'<div class="pwr-filters-flow d-flex flex-wrap align-items-center"></div>'
			).appendTo(controls);
			buttonsContainer = $(
				'<div class="pwr-filters-group pwr-filters-group--right filter-buttons d-flex flex-shrink-0 align-items-center justify-content-end"></div>'
			).appendTo(controls);
		}

		createPwrWorkerTypeFilter($flow);
		createPwrShowFactFilter($flow);
		NS.ensureDatesInitialized();
		createPwrPeriodNavFilter($flow, frm);
		createViewTypeDropdown($flow);
		createPeriodRangeDropdown($flow);

		const filterBtnClass = pwrShared().PWR_FILTER_BTN_CLASS || "btn btn-default btn-sm";
		const refreshBtn = $(
			`<button class="${filterBtnClass}" title="${__("Refresh Data")}">↻</button>`
		).appendTo(buttonsContainer);

		refreshBtn.on("click", function () {
			if (WL_DEBUG) {
				console.log("Manual refresh triggered");
			}
			NS.state.cache = { globalCache: {} };
			window.projectWorkloadMetadata = {};
			window.projectWorkloadIndexed = null;
			if (NS.debouncedLoadProjectWorkloadData) {
				NS.debouncedLoadProjectWorkloadData(frm, true, true);
			}
		});

		return controls;
	}

	Object.assign(NS, {
		compactPwrFilterControl,
		normalizeProjectWorkloadFiltersRow,
		createPwrPeriodNavFilter,
		createPwrWorkerTypeFilter,
		createPwrShowFactFilter,
		createViewTypeDropdown,
		createPeriodRangeDropdown,
		applyProjectWorkloadSectionLayout,
		createProjectFilterRow,
	});
})();
