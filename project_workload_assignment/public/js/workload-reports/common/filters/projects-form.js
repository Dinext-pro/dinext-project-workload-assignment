/**
 * Projects Workload Report Form filters:
 * reuse DocType Link fields (user / project / portfolio / user_group),
 * add toolbar extras (worker, fact, period, view) in the same row.
 */

import {
	WORKER_OPTIONS,
	WORKLOAD_BASE_BY_PROJECT,
	getReportWorkloadBaseOptions,
	projectsDefaults,
	resetProjectsAnchor,
	shiftMonth,
} from "./periods.js";
import { mountRow, addSelect, addButton, addMultiSelectList } from "./controls.js";
import { fetchProjectRoleOptions } from "./role-options.js";
import { createFilterSession } from "./session.js";

const FORM_LINK_FIELDS = ["user", "project", "project_portfolio", "user_group"];

const FORM_LINK_PLACEHOLDERS = {
	user: "Participant",
	project: "Project",
	project_portfolio: "Portfolio",
	user_group: "Group",
};

function _compactControl($wrapper) {
	if (!$wrapper?.length) return;
	$wrapper.find(".help-box, .clearfix, .control-label").hide();
	$wrapper.css({ marginBottom: 0, paddingBottom: 0 });
	$wrapper.find(".form-group, .control-input-wrapper, .control-input").css({
		marginBottom: 0,
		paddingBottom: 0,
	});
}

/**
 * DocType keeps Link fields hidden:1 (no native flicker before WR mount).
 * After move into WR filter row — show as real controls.
 */
function _unveilFormLink(frm, field, fieldname) {
	if (!field?.$wrapper?.length) return;
	if (frm?.set_df_property && fieldname) {
		frm.set_df_property(fieldname, "hidden", 0);
	} else if (field.df) {
		field.df.hidden = 0;
	}
	const $control = field.$wrapper.hasClass("frappe-control")
		? field.$wrapper
		: field.$wrapper.closest(".frappe-control");
	$control.removeClass("hide-control").css("display", "");
	field.$wrapper.removeClass("hide-control").css("display", "");
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
	_unveilFormLink(frm, field, fieldname);
	_compactControl(field.$wrapper);

	const $input = field.$wrapper.find("input").first();
	if ($input.length) {
		const key = FORM_LINK_PLACEHOLDERS[fieldname] || field.df?.label || fieldname;
		$input.attr("placeholder", __(key));
	}
	return field;
}

/** Re-show Link filters already sitting in WR root (after form refresh). */
export function unveilFormLinkFields(frm) {
	if (!frm?.wrapper) return;
	for (const fieldname of FORM_LINK_FIELDS) {
		const field = frm.fields_dict?.[fieldname];
		if (!field?.$wrapper?.length) continue;
		if (!field.$wrapper.closest(".workload-reports-root").length) continue;
		_unveilFormLink(frm, field, fieldname);
	}
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
		// Back to DocType intent (hidden) while parked outside WR root.
		if (field.df) {
			field.df.hidden = 1;
		}
		field.$wrapper.addClass("hide-control");
	}
}

/**
 * @param {object} frm
 * @param {HTMLElement} el — host for wr-filters-row (inside form filters section)
 * @param {Function} onChange
 * @returns {ReturnType<createFilterSession>}
 */
export function mountProjectsFiltersFromForm(frm, el, onChange) {
	const args = projectsDefaults();
	for (const key of FORM_LINK_FIELDS) {
		args[key] = frm.doc?.[key] || "";
	}

	const session = createFilterSession(args, {
		onReload: onChange,
		onShift: (next, dir) => {
			next.period_anchor_date = shiftMonth(next.period_anchor_date, dir);
		},
		onResetWindow: resetProjectsAnchor,
	});
	session.getArgs = () => ({
		...args,
		user: frm.doc?.user || "",
		project: frm.doc?.project || "",
		project_portfolio: frm.doc?.project_portfolio || "",
		user_group: frm.doc?.user_group || "",
	});

	const { flow, buttons } = mountRow(el);

	for (const fieldname of FORM_LINK_FIELDS) {
		_relocateFormField(frm, fieldname, flow);
	}

	const workerSelect = addSelect(flow, {
		fieldname: "worker_wtype",
		options: WORKER_OPTIONS,
		value: args.worker_wtype,
		onChange: (v) => {
			args.worker_wtype = v;
			session.reload();
		},
	});

	const roleSelect = addMultiSelectList(flow, {
		fieldname: "project_role_filters",
		placeholder: __("Project Roles"),
		value: args.project_role_filters,
		getData: (txt) =>
			fetchProjectRoleOptions(
				{
					user: frm.doc?.user || args.user || "",
					project: frm.doc?.project || args.project || "",
					project_portfolio: frm.doc?.project_portfolio || args.project_portfolio || "",
					user_group: frm.doc?.user_group || args.user_group || "",
					view_type: args.view_type,
					period_range: args.period_range,
					period_anchor_date: args.period_anchor_date,
					worker_wtype: args.worker_wtype,
				},
				txt
			),
		onChange: (values) => {
			args.project_role_filters = values || [];
			session.reload();
		},
	});

	session._workloadBaseSelect = addSelect(flow, {
		fieldname: "workload_base",
		options: getReportWorkloadBaseOptions(),
		value: args.workload_base || WORKLOAD_BASE_BY_PROJECT,
		onChange: (v) => {
			args.workload_base = v || WORKLOAD_BASE_BY_PROJECT;
			session.reload();
		},
	});

	addButton(buttons, {
		title: __("Clear All Filters"),
		text: "✕",
		className: "wr-filters-clear-btn",
		onClick: () => {
			args.worker_wtype = "";
			workerSelect.set_value("");
			args.project_role_filters = [];
			roleSelect.set_value([]);
			roleSelect.values = [];
			roleSelect._selected_values = [];
			roleSelect.update_status?.();
			args.workload_base = WORKLOAD_BASE_BY_PROJECT;
			session._workloadBaseSelect?.set_value?.(WORKLOAD_BASE_BY_PROJECT);
			for (const key of FORM_LINK_FIELDS) {
				frm.set_value(key, "");
				args[key] = "";
			}
			session.reload();
		},
	});

	return session;
}
