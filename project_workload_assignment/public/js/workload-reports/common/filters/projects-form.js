/**
 * Projects Workload Report Form filters:
 * reuse DocType Link fields (user / project / portfolio / user_group),
 * add toolbar extras (worker, fact, period, view) in the same row.
 */

import {
	VIEW_OPTIONS,
	PERIOD_OPTIONS,
	WORKER_OPTIONS,
	projectsDefaults,
	resetProjectsAnchor,
	shiftMonth,
} from "./periods.js";
import {
	mountRow,
	addSelect,
	addCheckbox,
	addPeriodNav,
	addButton,
} from "./controls.js";

const FORM_LINK_FIELDS = ["user", "project", "project_portfolio", "user_group"];

function _compactControl($wrapper) {
	if (!$wrapper?.length) return;
	$wrapper.find(".help-box, .clearfix, .control-label").hide();
	$wrapper.css({ marginBottom: 0, paddingBottom: 0 });
	$wrapper.find(".form-group, .control-input-wrapper, .control-input").css({
		marginBottom: 0,
		paddingBottom: 0,
	});
}

function _relocateFormField(frm, fieldname, parent) {
	const field = frm.fields_dict?.[fieldname];
	if (!field?.$wrapper?.length) return null;

	const wrap = document.createElement("div");
	wrap.className = "wr-filter-field wr-filter-form-link";
	wrap.dataset.fieldname = fieldname;
	parent.appendChild(wrap);

	const $host = $(wrap);
	field.$wrapper.appendTo($host);
	_compactControl(field.$wrapper);

	const $input = field.$wrapper.find("input").first();
	if ($input.length) {
		const label = field.df?.label || fieldname;
		$input.attr("placeholder", __(label));
	}
	return field;
}

const REPORT_FIELD = "projects_workload_report";

function _isReportHostSection(el) {
	if (!el) return false;
	return !!(
		el.querySelector?.(`[data-fieldname="${REPORT_FIELD}"]`)
		|| el.querySelector?.(".workload-reports-root")
	);
}

/**
 * Find DocType filters section body (Link fields), never the report HTML section.
 * @param {object} frm
 * @returns {JQuery}
 */
export function getFormFiltersSection(frm) {
	if (!frm?.wrapper) return $();
	const $root = $(frm.wrapper);

	// Prefer already-marked empty DocType section (links may already live in WR root).
	const $marked = $root
		.find(".projects-workload-filters-section")
		.filter((_, el) => !_isReportHostSection(el));
	if ($marked.length) {
		const $body = $marked.first().find(".section-body").first();
		return $body.length ? $body : $marked.first();
	}

	// user Link still in original place (not yet relocated into WR root).
	const $user = $root
		.find('[data-fieldname="user"]')
		.filter((_, el) => !el.closest(".workload-reports-root"));
	if (!$user.length) return $();
	const $section = $user.closest(".form-section");
	if (!$section.length || _isReportHostSection($section.get(0))) return $();
	const $body = $section.find(".section-body").first();
	return $body.length ? $body : $section;
}

/** Move DocType Link controls out of WR root before host.empty() on remount. */
export function parkFormLinkFields(frm) {
	if (!frm?.wrapper) return;
	let $park = getFormFiltersSection(frm);
	if (!$park.length) {
		// Fallback: any non-report form-section body.
		$park = $(frm.wrapper)
			.find(".form-section")
			.filter((_, el) => !_isReportHostSection(el))
			.find(".section-body")
			.first();
	}
	if (!$park.length) return;

	for (const fieldname of FORM_LINK_FIELDS) {
		const field = frm.fields_dict?.[fieldname];
		if (!field?.$wrapper?.length) continue;
		if (!field.$wrapper.closest(".workload-reports-root").length) continue;
		field.$wrapper.appendTo($park);
	}
}

/**
 * @param {object} frm
 * @param {HTMLElement} el — host for wr-filters-row (inside form filters section)
 * @param {Function} onChange
 * @returns {() => object} getArgs
 */
export function mountProjectsFiltersFromForm(frm, el, onChange) {
	const args = projectsDefaults();
	for (const key of FORM_LINK_FIELDS) {
		args[key] = frm.doc?.[key] || "";
	}

	const { flow, buttons } = mountRow(el);
	const _reload = () => onChange();

	for (const fieldname of FORM_LINK_FIELDS) {
		_relocateFormField(frm, fieldname, flow);
	}

	const workerSelect = addSelect(flow, {
		fieldname: "worker_wtype",
		options: WORKER_OPTIONS,
		value: args.worker_wtype,
		onChange: (v) => {
			args.worker_wtype = v;
			_reload();
		},
	});

	addCheckbox(flow, {
		label: __("Show fact"),
		checked: !!args.load_actual,
		onChange: (v) => {
			args.load_actual = v ? 1 : 0;
			_reload();
		},
	});

	addPeriodNav(flow, {
		onPrev: () => {
			args.period_anchor_date = shiftMonth(args.period_anchor_date, -1);
			_reload();
		},
		onNext: () => {
			args.period_anchor_date = shiftMonth(args.period_anchor_date, 1);
			_reload();
		},
	});

	addSelect(flow, {
		fieldname: "view_type",
		options: VIEW_OPTIONS,
		value: args.view_type,
		onChange: (v) => {
			args.view_type = v;
			resetProjectsAnchor(args);
			_reload();
		},
	});

	addSelect(flow, {
		fieldname: "period_range",
		options: PERIOD_OPTIONS,
		value: args.period_range,
		onChange: (v) => {
			args.period_range = v;
			resetProjectsAnchor(args);
			_reload();
		},
	});

	addButton(buttons, {
		title: __("Refresh Data"),
		text: "↻",
		onClick: _reload,
	});

	addButton(buttons, {
		title: __("Clear All Filters"),
		text: "✕",
		className: "wr-filters-clear-btn",
		onClick: () => {
			args.worker_wtype = "";
			workerSelect.set_value("");
			for (const key of FORM_LINK_FIELDS) {
				frm.set_value(key, "");
				args[key] = "";
			}
			_reload();
		},
	});

	return () => ({
		...args,
		user: frm.doc?.user || "",
		project: frm.doc?.project || "",
		project_portfolio: frm.doc?.project_portfolio || "",
		user_group: frm.doc?.user_group || "",
	});
}
