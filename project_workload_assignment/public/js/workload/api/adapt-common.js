// Period scalars (canonical ← legacy wire):
//   hours_<key> ← row[key]; fact_hours_<key> ← row[key+"_actual"]; pct_* — UI later
function inferViewType(p) {
	if (!p || typeof p !== "object") return undefined;
	if (p.view_type) return p.view_type;
	// LEGACY WIRE: daily periods have `date`; week/month have start_date/end_date
	if (p.date && !p.start_date) return "daily";
	if (p.week != null) return "weekly";
	if (p.month != null && p.start_date) return "monthly";
	return undefined;
}

export function periodFromWire(p) {
	if (!p || typeof p !== "object" || !p.key) return null;

	const view_type = inferViewType(p);
	let start_date = p.start_date || "";
	let end_date = p.end_date || "";

	// LEGACY WIRE daily: only `date`, no start/end
	if ((!start_date || !end_date) && p.date) {
		start_date = p.date;
		end_date = p.date;
	}

	const out = {
		key: String(p.key),
		start_date,
		end_date,
	};
	if (view_type) out.view_type = view_type;
	if (p.label) out.label = p.label;
	if (p.date) out.date = p.date;
	if (p.year != null) out.year = p.year;
	if (p.month != null) out.month = p.month;
	if (p.week != null) out.week = p.week;
	if (p.day != null) out.day = p.day;
	if (p.weekday != null) out.weekday = p.weekday;
	return out;
}

export function adaptPeriods(raw) {
	if (!Array.isArray(raw)) return [];
	const out = [];
	for (let i = 0; i < raw.length; i++) {
		const p = periodFromWire(raw[i]);
		if (p) out.push(p);
	}
	return out;
}

export function rowIdForUser(email) {
	return `user:${email || ""}`;
}

export function rowIdForProject(project, email) {
	if (email) return `project:${email}:${project || ""}`;
	return `project:${project || ""}`;
}

export function rowIdForRole(email, role) {
	return `role:${email || "user"}:${role || ""}`;
}

export function rowIdForTask(email, role, taskId) {
	return `task:${email || "user"}:${role || "role"}:${taskId || ""}`;
}

export function makeRowId(kind, key) {
	return `${kind}:${key}`;
}

function toNumberOrNull(value) {
	if (value == null || value === "") return null;
	const n = typeof value === "number" ? value : parseFloat(String(value));
	return Number.isFinite(n) ? n : null;
}

export function copyPeriodScalars(legacyRow, periodKeys) {
	const out = {};
	if (!legacyRow || !periodKeys || !periodKeys.length) return out;

	for (let i = 0; i < periodKeys.length; i++) {
		const item = periodKeys[i];
		const key = typeof item === "string" ? item : item && item.key;
		if (!key) continue;

		// LEGACY WIRE: plan hours under bare period key
		const hours = toNumberOrNull(legacyRow[key]);
		if (hours != null) {
			out[`hours_${key}`] = hours;
		}

		// LEGACY WIRE: fact under `${key}_actual` (not fact_hours_* / fact_*)
		const actual = toNumberOrNull(legacyRow[`${key}_actual`]);
		if (actual != null) {
			out[`fact_hours_${key}`] = actual;
		}

		// LEGACY WIRE: pct_* absent — do not invent here
	}
	return out;
}

export function copyRowMeta(legacyRow) {
	if (!legacyRow) return {};
	const meta = {};

	const email = legacyRow._email || legacyRow.email || null;
	if (email) meta.email = email;

	if (legacyRow.user_data) meta.user_data = legacyRow.user_data;

	// LEGACY WIRE: _absences / _workingHours / holiday lists (plain data, not HTML)
	if (legacyRow._absences) meta.absences = legacyRow._absences;
	else if (legacyRow.absences) meta.absences = legacyRow.absences;

	if (legacyRow._workingHours) meta.workingHours = legacyRow._workingHours;
	else if (legacyRow.workingHours) meta.workingHours = legacyRow.workingHours;

	if (legacyRow._userHolidays) meta.userHolidays = legacyRow._userHolidays;
	if (legacyRow._projectHolidays) meta.projectHolidays = legacyRow._projectHolidays;

	if (legacyRow.workload_total != null) meta.workload_total = legacyRow.workload_total;
	if (legacyRow.actual_total != null) meta.actual_total = legacyRow.actual_total;

	if (legacyRow.expandable != null) meta.expandable = !!legacyRow.expandable;

	return meta;
}
