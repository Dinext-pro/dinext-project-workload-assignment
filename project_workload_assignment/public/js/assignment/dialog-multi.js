/**
 * Multi-task workload dialog (N>1). Does not replace start_pwa_dialog.
 * Open: unique union of PWA + Open ToDo across selected tasks.
 * Add → all selected. Remove → unassign on every selected task that has them.
 * Keep → update role/% where PWA exists; do not copy onto tasks that lack them.
 * No Work Efforts, no date columns — dates seed silently per task.
 */
(function () {
	const PWR_WORKLOAD_IN_WORKING_HOURS = "В рабочих часах";
	const PWR_WORKLOAD_PERCENT_FUND = "В % от фонда рабочих часов";
	const PWR_WORKLOAD_PERCENT_TASK = "В % от трудоемкости задачи";

	const PWA_FIELDS = [
		"name",
		"task",
		"role",
		"user",
		"user_full_name",
		"task_dates",
		"date_from",
		"date_to",
		"workload",
		"wl_value",
		"acc_separately",
	];

	let _starting = false;

	function maxToDate(date) {
		const today = frappe.datetime.now_date();
		if (!date) {
			return today;
		}
		return frappe.datetime.get_day_diff(today, date) > 0 ? today : date;
	}

	function getProjectTeamUsersSync(project) {
		if (!project) {
			return [];
		}
		let users = [];
		frappe.call({
			method: "project_team_assign_filter",
			args: { project },
			async: false,
			callback: (r) => {
				users = r.message || [];
			},
		});
		return users;
	}

	function getProjectUserRolesSync(project, user) {
		if (!project || !user) {
			return [];
		}
		let roles = [];
		frappe.call({
			method: "get_project_user_roles",
			args: { project, user },
			async: false,
			callback: (r) => {
				roles = r.message || [];
			},
		});
		return roles;
	}

	function activeRows(pwas) {
		return (pwas || []).filter((p) => p && !p.__isRemove && p.user);
	}

	function formatUserDisplay(val, _field, _options, doc) {
		const name = frappe.utils.escape_html(val || "");
		return frappe.avatar(doc.user, "", val) + " " + name;
	}

	function formatWLValue(val, _field, _options, doc) {
		return val + " " + (doc.workload == PWR_WORKLOAD_IN_WORKING_HOURS ? __("h") : "%");
	}

	function getGrid(me) {
		return me.grid || cur_dialog?.fields_dict?.pwa_rows?.grid;
	}

	function getChangedRow(grid, fieldname) {
		let result = null;
		(grid?.grid_rows || []).forEach((row) => {
			const field = row.on_grid_fields_dict?.[fieldname];
			if (field && field.last_value != field.get_value()) {
				result = row;
			}
		});
		return result;
	}

	async function ensureTaskDates(tasks) {
		await Promise.all(
			(tasks || []).map(async (task) => {
				if (task.exp_start_date && task.exp_end_date) {
					return;
				}
				const r = await frappe.db.get_value("Task", task.name, [
					"exp_start_date",
					"exp_end_date",
					"project",
					"subject",
				]);
				const msg = r?.message || {};
				if (!task.exp_start_date) {
					task.exp_start_date = msg.exp_start_date;
				}
				if (!task.exp_end_date) {
					task.exp_end_date = msg.exp_end_date;
				}
				if (!task.project && msg.project) {
					task.project = msg.project;
				}
				if (!task.subject && msg.subject) {
					task.subject = msg.subject;
				}
			})
		);
		return tasks;
	}

	function addUsers(project, pwas, userIds, grid, after) {
		const list = (userIds || []).filter(
			(uid) => !pwas.some((p) => !p.__isRemove && p.user == uid)
		);
		if (!list.length) {
			if (after) {
				after([]);
			}
			return;
		}
		frappe.db
			.get_list("User", {
				fields: ["name", "full_name"],
				filters: [["name", "in", list]],
				limit: list.length,
			})
			.then((results) => {
				const added = [];
				for (const user of results || []) {
					const roles = getProjectUserRolesSync(project, user.name);
					const row = {
						idx: pwas.length + 1,
						user: user.name,
						name: user.name,
						role: roles.length == 1 ? roles[0] : null,
						__islocal: true,
						user_full_name: user.full_name || user.name,
						workload: PWR_WORKLOAD_PERCENT_TASK,
						wl_value: 100,
					};
					pwas.push(row);
					added.push(user.name);
				}
				if (grid) {
					grid.df.data = activeRows(pwas);
					grid.refresh();
				}
				if (after) {
					after(added);
				}
			});
	}

	function payloadFields(row) {
		const out = {};
		for (const key of PWA_FIELDS) {
			if (row[key] !== undefined && row[key] !== null) {
				out[key] = row[key];
			}
		}
		if (row.__isRemove) {
			out.__isRemove = true;
		}
		if (row.__islocal) {
			out.__islocal = true;
			delete out.name;
		}
		return out;
	}

	function userSet(list) {
		return new Set((list || []).map(String).filter(Boolean));
	}

	async function loadAssignmentState(tasks, project) {
		const taskIds = tasks.map((t) => t.name);
		const assigneesByTask = new Map(taskIds.map((id) => [id, new Set()]));

		const existing =
			(await frappe.db.get_list("Project Workload Assignment", {
				fields: PWA_FIELDS,
				filters: { task: ["in", taskIds] },
				limit: 0,
			})) || [];

		const todos =
			(await frappe.db.get_list("ToDo", {
				fields: ["allocated_to", "reference_name"],
				filters: {
					status: "Open",
					reference_type: "Task",
					reference_name: ["in", taskIds],
				},
				limit: 0,
			})) || [];

		for (const pwa of existing) {
			if (pwa.task && pwa.user && assigneesByTask.has(pwa.task)) {
				assigneesByTask.get(pwa.task).add(pwa.user);
			}
		}
		for (const todo of todos) {
			const task = todo.reference_name;
			const user = todo.allocated_to;
			if (task && user && assigneesByTask.has(task)) {
				assigneesByTask.get(task).add(user);
			}
		}
		for (const task of tasks) {
			const extra = Array.isArray(task.assign) ? task.assign : [];
			const bucket = assigneesByTask.get(task.name);
			if (!bucket) {
				continue;
			}
			for (const user of extra) {
				if (user) {
					bucket.add(user);
				}
			}
		}

		const byUser = new Map();
		for (const pwa of existing) {
			if (!pwa.user || byUser.has(pwa.user)) {
				continue;
			}
			byUser.set(pwa.user, {
				idx: byUser.size + 1,
				user: pwa.user,
				name: pwa.user,
				role: pwa.role,
				__islocal: true,
				user_full_name: pwa.user_full_name || pwa.user,
				workload: pwa.workload || PWR_WORKLOAD_PERCENT_TASK,
				wl_value: pwa.wl_value == null ? 100 : pwa.wl_value,
			});
		}

		const missing = [];
		for (const users of assigneesByTask.values()) {
			for (const user of users) {
				if (!byUser.has(user)) {
					missing.push(user);
				}
			}
		}
		const uniqueMissing = [...new Set(missing)];
		if (uniqueMissing.length) {
			const users =
				(await frappe.db.get_list("User", {
					fields: ["name", "full_name"],
					filters: [["name", "in", uniqueMissing]],
					limit: uniqueMissing.length,
				})) || [];
			for (const user of users) {
				const roles = getProjectUserRolesSync(project, user.name);
				byUser.set(user.name, {
					idx: byUser.size + 1,
					user: user.name,
					name: user.name,
					role: roles.length == 1 ? roles[0] : null,
					__islocal: true,
					user_full_name: user.full_name || user.name,
					workload: PWR_WORKLOAD_PERCENT_TASK,
					wl_value: 100,
				});
			}
		}

		return {
			openedUsers: userSet([...byUser.keys()]),
			assigneesByTask,
			pwas: [...byUser.values()],
		};
	}

	function desiredUsersForTask(taskId, assigneesByTask, added, removed) {
		const current = new Set(assigneesByTask.get(taskId) || []);
		for (const user of removed) {
			current.delete(user);
		}
		for (const user of added) {
			current.add(user);
		}
		return current;
	}

	async function buildStampRows(tasks, stampPwas, openedUsers, assigneesByTask) {
		const stamps = activeRows(stampPwas);
		const stampByUser = new Map(stamps.map((p) => [p.user, p]));
		const stampUsers = userSet(stamps.map((p) => p.user));
		const added = [...stampUsers].filter((u) => !openedUsers.has(u));
		const removed = [...openedUsers].filter((u) => !stampUsers.has(u));
		const allRows = [];

		for (const task of tasks) {
			const existing =
				(await frappe.db.get_list("Project Workload Assignment", {
					fields: PWA_FIELDS,
					filters: { task: task.name },
					limit: 0,
				})) || [];
			const byUser = new Map(existing.map((p) => [p.user, p]));
			const desired = desiredUsersForTask(
				task.name,
				assigneesByTask,
				added,
				removed
			);
			let emitted = 0;

			for (const pwa of existing) {
				if (!desired.has(pwa.user)) {
					allRows.push(
						payloadFields({
							name: pwa.name,
							task: task.name,
							user: pwa.user,
							__isRemove: true,
						})
					);
					emitted += 1;
					continue;
				}
				const stamp = stampByUser.get(pwa.user);
				allRows.push(
					payloadFields({
						name: pwa.name,
						task: task.name,
						user: pwa.user,
						role: stamp?.role || pwa.role,
						user_full_name: stamp?.user_full_name || pwa.user_full_name,
						task_dates: pwa.task_dates,
						date_from: pwa.date_from,
						date_to: pwa.date_to,
						workload: stamp?.workload || pwa.workload,
						wl_value: stamp?.wl_value == null ? pwa.wl_value : stamp.wl_value,
						acc_separately: pwa.acc_separately,
					})
				);
				emitted += 1;
			}

			for (const user of desired) {
				if (byUser.has(user)) {
					continue;
				}
				const stamp = stampByUser.get(user);
				if (!stamp || !stamp.role) {
					continue;
				}
				allRows.push(
					payloadFields({
						__islocal: true,
						task: task.name,
						user,
						role: stamp.role,
						user_full_name: stamp.user_full_name,
						task_dates: 1,
						date_from: maxToDate(task.exp_start_date),
						date_to: maxToDate(task.exp_end_date),
						workload: stamp.workload,
						wl_value: stamp.wl_value,
						acc_separately: 1,
					})
				);
				emitted += 1;
			}

			if (!emitted) {
				allRows.push({
					task: task.name,
					user: "",
					__islocal: true,
					__isRemove: true,
				});
			}
		}
		return { rows: allRows, added, removed };
	}

	async function submitRows(rows) {
		await frappe.call({
			method: "project_workload_assignment.pwa_dates.bulk.bulk_process_pwa",
			args: { rows },
			freeze: true,
			freeze_message: __("Updating assignments…"),
		});
		frappe.show_alert({ message: __("Data saved"), indicator: "green" });
	}

	function getPwaFields(project) {
		return [
			{
				fieldname: "user_full_name",
				label: __("User"),
				fieldtype: "Read Only",
				in_list_view: 1,
				read_only: 1,
				columns: 3,
				formatter: formatUserDisplay,
			},
			{
				fieldname: "role",
				label: __("Role"),
				fieldtype: "Link",
				options: "Project Role",
				in_list_view: 1,
				columns: 2,
				reqd: 1,
				get_query: (doc) => {
					return {
						filters: [
							[
								"Project Role",
								"name",
								"in",
								getProjectUserRolesSync(project, doc.user),
							],
						],
					};
				},
			},
			{
				fieldname: "workload",
				label: __("Workload"),
				fieldtype: "Select",
				in_list_view: 1,
				columns: 3,
				reqd: 1,
				options:
					"\n" +
					PWR_WORKLOAD_IN_WORKING_HOURS +
					"\n" +
					PWR_WORKLOAD_PERCENT_FUND +
					"\n" +
					PWR_WORKLOAD_PERCENT_TASK,
				onchange: function () {
					const row = getChangedRow(getGrid(this), "workload");
					row?.refresh?.();
				},
			},
			{
				fieldname: "wl_value",
				label: __("Amount"),
				fieldtype: "Data",
				in_list_view: 1,
				columns: 2,
				formatter: formatWLValue,
				reqd: 1,
			},
		];
	}

	function makeDialog(cbfunc, tasks, project, pwas, openedUsers, assigneesByTask) {
		const project_users = getProjectTeamUsersSync(project);

		const d = new frappe.ui.Dialog({
			title: __("Bulk workload assignment"),
			size: "extra-large",
			fields: [
				{ fieldtype: "Section Break" },
				{
					label: __("User"),
					fieldname: "user_search",
					fieldtype: "Link",
					options: "User",
					filters: { name: ["in", project_users], ignore_user_type: true },
					change: () => {
						const uid = d.get_value("user_search");
						if (!uid) {
							return;
						}
						const found = pwas.find((rec) => !rec.__isRemove && rec.user == uid);
						const grid = d.fields_dict.pwa_rows.grid;
						if (found) {
							const row = grid.get_row(found.name);
							row.row.addClass("highlight");
							setTimeout(() => {
								row.row.removeClass("highlight");
								row.activate();
							}, 500);
							d.set_value("user_search", "");
						} else {
							addUsers(project, pwas, [uid], grid, () => {
								const row = grid.get_row(uid);
								row?.activate?.();
								d.set_value("user_search", "");
							});
						}
					},
				},
				{ fieldtype: "Column Break", fieldname: "user_all_column" },
				{
					fieldtype: "Button",
					fieldname: "user_all",
					label: " " + __("Assign entire team"),
					icon: "users",
					click: () => {
						const new_users = project_users.filter(
							(user) => !pwas.some((pwa) => !pwa.__isRemove && pwa.user == user)
						);
						if (!new_users.length) {
							frappe.show_alert(__("All possible assignees are already assigned"), 5);
							return;
						}
						const grid = d.fields_dict.pwa_rows.grid;
						addUsers(project, pwas, new_users, grid, (added) => {
							(added || []).forEach((user) => {
								const row = grid.get_row(user);
								if (!row) {
									return;
								}
								row.row.addClass("highlight");
								row.activate();
								row.toggle_editable_row(false);
								setTimeout(() => {
									row.row.removeClass("highlight");
								}, 500);
							});
						});
					},
					btn_size: "sm",
				},
				{ fieldtype: "Section Break", label: __("Workload") },
				{
					fieldname: "pwa_rows",
					fieldtype: "Table",
					cannot_add_rows: 1,
					cannot_delete_rows: 0,
					in_place_edit: true,
					fields: getPwaFields(project),
					data: pwas,
				},
			],
			primary_action_label: __("Save"),
			primary_action: async () => {
				const stamps = activeRows(pwas);
				const incomplete = stamps.filter((p) => !p.role);
				if (incomplete.length) {
					frappe.msgprint({
						title: __("Role required"),
						indicator: "orange",
						message: __(
							"Select a project role for every assignee before saving."
						),
					});
					return;
				}
				try {
					const { rows, added, removed } = await buildStampRows(
						tasks,
						pwas,
						openedUsers,
						assigneesByTask
					);
					await submitRows(rows);
					d.hide();
					if (cbfunc) {
						cbfunc({
							users: stamps.map((p) => p.user),
							added,
							removed,
						});
					}
				} catch (e) {
					frappe.msgprint({
						title: __("Error"),
						indicator: "red",
						message: e.message || __("Assign failed"),
					});
				}
			},
			secondary_action_label: __("Cancel without saving"),
			secondary_action: () => {
				d.hide();
			},
		});

		const grid = d.fields_dict.pwa_rows.grid;
		grid.wrapper.on("click", ".grid-remove-rows, .grid-remove-all-rows", function () {
			for (const removed of grid.get_selected()) {
				const found = pwas.find((rec) => rec.name == removed && !rec.__isRemove);
				if (found) {
					found.__isRemove = true;
				}
			}
		});
		(grid.grid_rows || []).forEach((row) => {
			row.activate();
			row.toggle_editable_row(false);
		});

		d.show();
		_starting = false;
	}

	function start_pwa_multi_dialog(cbfunc, tasks, opts) {
		if (_starting) {
			return;
		}
		const list = (tasks || []).filter((t) => t && t.name);
		if (list.length < 2) {
			frappe.msgprint(__("Select at least two tasks"));
			return;
		}
		const project = (opts && opts.project) || list[0].project;
		if (!project) {
			frappe.msgprint(__("Select a project"));
			return;
		}
		_starting = true;
		ensureTaskDates(list)
			.then(() => loadAssignmentState(list, project))
			.then((state) => {
				makeDialog(
					cbfunc,
					list,
					project,
					state.pwas,
					state.openedUsers,
					state.assigneesByTask
				);
			})
			.catch(() => {
				_starting = false;
			});
	}

	window.start_pwa_multi_dialog = start_pwa_multi_dialog;
})();
