import {
	adaptPeriods,
	copyPeriodScalars,
	copyRowMeta,
	rowIdForRole,
	rowIdForTask,
	rowIdForUser,
} from "./adapt-common.js";

function rowEmail(legacyRow) {
	return legacyRow.email || legacyRow._email || (legacyRow.user_data && legacyRow.user_data.email) || "";
}

function adaptFlatRow(legacyRow, periods) {
	const email = rowEmail(legacyRow);
	const periodKeys = periods.map((p) => p.key);
	const scalars = copyPeriodScalars(legacyRow, periodKeys);
	const meta = copyRowMeta(legacyRow);

	// LEGACY WIRE: level / isUser / isRole / isTask (project tree)
	const level = legacyRow.level;
	const isUser = legacyRow.isUser || level === "user";
	const isRole = legacyRow.isRole || level === "role";
	const isTask = legacyRow.isTask || level === "task";

	if (isUser) {
		const ud = legacyRow.user_data || {};
		return {
			id: rowIdForUser(email),
			kind: "user",
			label: ud.full_name || email || legacyRow.participant || "",
			hasChildren: false,
			children: [],
			email,
			...meta,
			...scalars,
		};
	}

	if (isRole) {
		const role = legacyRow.roleName || legacyRow.role || "";
		return {
			id: rowIdForRole(email, role),
			kind: "role",
			label: role,
			hasChildren: false,
			children: [],
			email,
			role,
			...meta,
			...scalars,
		};
	}

	if (isTask) {
		const role = legacyRow.roleName || legacyRow.role || "";
		const taskId = legacyRow.task_id || "";
		const taskRow = {
			id: rowIdForTask(email, role, taskId),
			kind: "task",
			label: legacyRow.task_subject || taskId || "",
			hasChildren: false,
			children: [],
			email,
			role,
			task_id: taskId,
			...meta,
			...scalars,
		};
		// LEGACY WIRE: task dialog fields
		if (legacyRow.task_subject) taskRow.task_subject = legacyRow.task_subject;
		if (legacyRow.exp_start_date) taskRow.exp_start_date = legacyRow.exp_start_date;
		if (legacyRow.exp_end_date) taskRow.exp_end_date = legacyRow.exp_end_date;
		return taskRow;
	}

	return {
		id: `row:${legacyRow.participant || ""}`,
		kind: "user",
		label: String(legacyRow.participant || ""),
		hasChildren: false,
		children: [],
		...meta,
		...scalars,
	};
}

function nestByIndent(treeData, periods) {
	const roots = [];
	const stack = [];

	for (let i = 0; i < treeData.length; i++) {
		const legacy = treeData[i];
		if (!legacy) continue;
		const indent = typeof legacy.indent === "number" ? legacy.indent : 0;
		const row = adaptFlatRow(legacy, periods);
		row.children = [];
		row.hasChildren = !!legacy.expandable;

		while (stack.length && stack[stack.length - 1].indent >= indent) {
			stack.pop();
		}

		// Inherit email from parent when wire omits it on role/task
		if (!row.email && stack.length && stack[stack.length - 1].row.email) {
			row.email = stack[stack.length - 1].row.email;
		}

		if (!stack.length) {
			roots.push(row);
		} else {
			const parent = stack[stack.length - 1].row;
			parent.children.push(row);
			parent.hasChildren = true;
		}
		stack.push({ row, indent });
	}

	return roots;
}

export function adaptProjectTreeResponse(message) {
	const msg = message && message.message && !message.tree_data ? message.message : message;
	if (!msg || typeof msg !== "object") {
		return { periods: [], rows: [], meta: {} };
	}

	const periods = adaptPeriods(msg.periods);
	const tree = Array.isArray(msg.tree_data) ? msg.tree_data : [];
	const rows = nestByIndent(tree, periods);

	const meta = {
		users_count: msg.users_count || 0,
		tasks_count: msg.tasks_count || 0,
		assignments_count: msg.assignments_count || 0,
		metadata: msg.metadata || undefined,
		performance: msg.performance || undefined,
	};
	if (msg.error) meta.error = msg.error;

	return { periods, rows, meta };
}
