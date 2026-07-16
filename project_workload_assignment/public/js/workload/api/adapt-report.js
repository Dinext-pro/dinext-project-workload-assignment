import {
	adaptPeriods,
	copyPeriodScalars,
	copyRowMeta,
	rowIdForProject,
	rowIdForUser,
} from "./adapt-common.js";

function userLabel(legacyRow) {
	const ud = legacyRow.user_data || {};
	return ud.full_name || legacyRow._email || legacyRow.participant || "";
}

function projectLabel(legacyRow) {
	return (
		legacyRow.project ||
		legacyRow.project_name ||
		legacyRow._project ||
		legacyRow.participant ||
		""
	);
}

function adaptUserRow(legacyRow, periods) {
	const email = legacyRow._email || legacyRow.email || legacyRow.participant || "";
	const expandable = !!legacyRow.expandable;
	const periodKeys = periods.map((p) => p.key);

	const row = {
		id: rowIdForUser(email),
		kind: "user",
		label: userLabel(legacyRow),
		// List mode: children lazy — empty array + hasChildren
		hasChildren: expandable,
		children: [],
		...copyRowMeta(legacyRow),
		...copyPeriodScalars(legacyRow, periodKeys),
	};
	row.email = email;
	return row;
}

function adaptProjectRow(legacyRow, periods, parentUserEmail) {
	const email =
		parentUserEmail || legacyRow._email || legacyRow.email || legacyRow.participant || "";
	const projectName = legacyRow._project || legacyRow.project_name || legacyRow.project || "";
	const periodKeys = periods.map((p) => p.key);

	const row = {
		id: rowIdForProject(projectName, email),
		kind: "project",
		label: projectLabel(legacyRow),
		hasChildren: false,
		children: [],
		project: projectName,
		project_name: legacyRow.project_name || projectName,
		...copyRowMeta(legacyRow),
		...copyPeriodScalars(legacyRow, periodKeys),
	};
	row.email = email;
	return row;
}

function adaptPlaceholderRow(legacyRow) {
	const email = legacyRow._email || legacyRow.email || "";
	return {
		id: `placeholder:${email}`,
		kind: "placeholder",
		label: legacyRow.participant || "",
		hasChildren: false,
		children: [],
		email,
	};
}

export function adaptTeamGridResponse(message) {
	const msg = message && message.message && !message.tree_data ? message.message : message;
	if (!msg || typeof msg !== "object") {
		return { periods: [], rows: [], meta: {} };
	}

	const periods = adaptPeriods(msg.periods);
	const tree = Array.isArray(msg.tree_data) ? msg.tree_data : [];
	const rows = [];

	for (let i = 0; i < tree.length; i++) {
		const legacy = tree[i];
		if (!legacy) continue;

		// LEGACY WIRE: list mode roots are `_isUser`; ignore projects / placeholders here
		if (legacy._isUser) {
			rows.push(adaptUserRow(legacy, periods));
			continue;
		}
		if (legacy._isLazyPlaceholder) {
			// Should not appear as root in list mode; skip
			continue;
		}
		if (legacy._isProject) {
			// LEGACY WIRE: may appear if mode=full; skip — users are roots, projects lazy
			continue;
		}
	}

	const meta = {
		mode: msg.mode,
		limit: msg.limit,
		offset: msg.offset,
		next_offset: msg.next_offset != null ? msg.next_offset : null,
		has_more: !!msg.has_more,
		total_users: msg.total_users || 0,
		users_count: msg.users_count || 0,
		projects_count: msg.projects_count || 0,
		assignments_count: msg.assignments_count || 0,
		performance: msg.performance || undefined,
	};
	if (msg.error) meta.error = msg.error;

	return { periods, rows, meta };
}

export function adaptUserProjectsResponse(message, parentUserEmail) {
	const msg = message && message.message && !message.tree_data ? message.message : message;
	if (!msg || typeof msg !== "object") return [];

	const periods = adaptPeriods(msg.periods);
	const tree = Array.isArray(msg.tree_data) ? msg.tree_data : [];
	const email = parentUserEmail || "";
	const children = [];

	for (let i = 0; i < tree.length; i++) {
		const legacy = tree[i];
		if (!legacy) continue;

		if (legacy._isLazyPlaceholder) {
			children.push(adaptPlaceholderRow(legacy));
			continue;
		}
		if (legacy._isProject || legacy._project || legacy.project_name) {
			children.push(adaptProjectRow(legacy, periods, email || legacy._email));
			continue;
		}
		// LEGACY WIRE: user_projects should not return user rows; skip if present
	}

	return children;
}
