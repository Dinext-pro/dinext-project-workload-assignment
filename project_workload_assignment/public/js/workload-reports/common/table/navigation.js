const HOURS_PREFIX = "hours_";
/** Intent: Project.refresh opens Загрузка once (no scroll retries). */
export const OPEN_WORKLOAD_TAB_KEY = "pwr_open_workload_tab";

export const NAV_POINTER_CLASS = "wr-nav-pointer";
const FILTER_USER_KEY = "workload_report_filter_user";
const FILTER_FLAG_KEY = "workload_report_should_filter";

export function isNavigableProject(row) {
	return !!(row?.kind === "project" && row.project);
}

export function userRowEmail(row) {
	return String(row?.email || row?.user_data?.email || "").trim();
}

export function isNavigableUser(row) {
	return !!(row?.kind === "user" && userRowEmail(row));
}

export function openTeamReportForUser(userEmail) {
	if (!userEmail) return;
	try {
		sessionStorage.setItem(FILTER_USER_KEY, userEmail);
		sessionStorage.setItem(FILTER_FLAG_KEY, "true");
	} catch (_e) {
		/* ignore */
	}
	frappe.set_route("Form", "Projects Workload Report", "Projects Workload Report");
}

export function isNavigableAbsencePeriod(row) {
	return !!(row?.kind === "absence" && row.email);
}

function resolveCellCtx(params) {
	const field =
		params?.colDef?.field ||
		params?.column?.getColDef?.()?.field ||
		"";
	const colId =
		params?.column?.getColId?.() ||
		params?.colDef?.colId ||
		field ||
		"";
	const row = params?.data || null;
	return { field: String(field || ""), colId: String(colId || ""), row };
}

export function periodKeyFromCol(fieldOrColId) {
	const s = String(fieldOrColId || "");
	if (s.indexOf(HOURS_PREFIX) === 0) {
		return s.slice(HOURS_PREFIX.length);
	}
	return s;
}

export function resolveAbsenceDate(periodKey, periods) {
	const key = String(periodKey || "");
	const dateMatch = key.match(/(\d{4}-\d{2}-\d{2})/);
	if (dateMatch) {
		return dateMatch[1];
	}
	const list = periods || [];
	for (let i = 0; i < list.length; i++) {
		const p = list[i];
		if (p && p.key === key) {
			return p.date || p.start_date || null;
		}
	}
	return null;
}

/**
 * Open Project → tab Загрузка.
 * Sets a one-shot intent; Project form consumes it on refresh (see project-tab).
 */
export function openProjectWorkloadTab(projectName, fieldName) {
	if (!projectName) return;
	const field = fieldName || "custom_workload";

	try {
		sessionStorage.setItem(OPEN_WORKLOAD_TAB_KEY, projectName);
	} catch (_e) {
		/* ignore */
	}

	const frm = window.cur_frm;
	if (frm?.doctype === "Project" && frm.docname === projectName) {
		if (frm.get_field?.(field)) {
			frm.scroll_to_field(field);
			try {
				sessionStorage.removeItem(OPEN_WORKLOAD_TAB_KEY);
			} catch (_e) {
				/* ignore */
			}
		}
		return;
	}

	frappe.set_route("Form", "Project", projectName);
}

export function consumeOpenWorkloadTab(frm, fieldName) {
	const field = fieldName || "custom_workload";
	if (!frm || frm.doctype !== "Project" || !frm.docname) {
		return false;
	}
	let want = null;
	try {
		want = sessionStorage.getItem(OPEN_WORKLOAD_TAB_KEY);
	} catch (_e) {
		return false;
	}
	if (want !== frm.docname) {
		return false;
	}
	try {
		sessionStorage.removeItem(OPEN_WORKLOAD_TAB_KEY);
	} catch (_e) {
		/* ignore */
	}
	if (!frm.get_field?.(field)) {
		return false;
	}
	return !!frm.scroll_to_field(field);
}

export async function openUserAbsence(userEmail, dateStr) {
	if (!userEmail || !dateStr) {
		frappe.msgprint(
			__("User and date must be specified to open absence request")
		);
		return;
	}

	try {
		const absences = await frappe.db.get_list("Application For Leave", {
			fields: ["name", "alfrom_date", "alto_date"],
			filters: [
				["lauser", "=", userEmail],
				["status", "=", "Согласовано"],
				["alfrom_date", "<=", dateStr],
				["alto_date", ">=", dateStr],
			],
			limit: 1,
		});

		if (absences && absences.length > 0) {
			frappe.set_route("Form", "Application For Leave", absences[0].name);
			return;
		}

		frappe.msgprint(
			__("No absence request found for user {0} on date {1}", [
				userEmail,
				dateStr,
			])
		);
	} catch (err) {
		console.error("[workload-reports.navigation] openUserAbsence", err);
		frappe.msgprint(__("Error searching for absence request"));
	}
}

export async function handleDoubleClick(row, col, ctx) {
	if (!row) return;

	const field = col?.field || col?.colId || "";
	const colId = col?.colId || field;
	const isLabel = field === "label" || colId === "label";
	const periodKey = periodKeyFromCol(field || colId);
	const isPeriod =
		!isLabel &&
		(String(field).indexOf(HOURS_PREFIX) === 0 ||
			String(periodKey).indexOf("workload_") === 0);

	if (row.kind === "project" && row.project && (isLabel || isPeriod)) {
		openProjectWorkloadTab(row.project, "custom_workload");
		return;
	}

	if (isNavigableUser(row) && (isLabel || isPeriod)) {
		openTeamReportForUser(userRowEmail(row));
		return;
	}

	if (row.kind === "absence" && isPeriod && row.email) {
		const dateStr = resolveAbsenceDate(periodKey, ctx?.periods);
		if (!dateStr) {
			frappe.msgprint(
				__("Could not determine date for opening absence request")
			);
			return;
		}
		await openUserAbsence(row.email, dateStr);
	}
}

export function createOnCellDoubleClicked(state) {
	return (params) => {
		const { field, colId, row } = resolveCellCtx(params);
		void handleDoubleClick(
			row,
			{ field, colId },
			{ periods: state?.periods || [] }
		);
	};
}
