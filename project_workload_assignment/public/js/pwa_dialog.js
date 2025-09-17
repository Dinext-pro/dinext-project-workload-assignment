const original_init = frappe.views.KanbanView.prototype.init;
frappe.views.KanbanView.prototype.init = function() {
	console.log('Kanban init bind');
    return original_init.call(this).then(() => {
        if (this.doctype === 'Issue' || this.doctype === 'Task') {
            const original_KanbanBoardColumn = frappe.views.KanbanBoardColumn;
            frappe.views.KanbanBoardColumn = function(column, wrapper, board_perms) {
                const self = original_KanbanBoardColumn.call(this, column, wrapper, board_perms);
                const original_make_cards = self.make_cards;
                self.make_cards = function() {
					console.log('make cards 1');
                    original_make_cards.call(this);
                    setupListViewAssignmentFilter(this.cur_list);
                };

                return self;
            };
        }
    });
};

// синхронная версия для get_query
function getProjectTeamUsersSync(project) {
    if (!project) return [];
    let users = [];
    frappe.call({
        method: "project_team_assign_filter",
        args: { project },
        async: false,
        callback: (r) => {
            users = r.message || [];
        }
    });
    return users;
}

// проверка ограничения назначений
async function isTeamRestrictionEnabled(project) {
    if (!project) return false;
    const res = await frappe.db.get_value("Project", project, "custom_restrict_assignment");
    return !!res.message?.custom_restrict_assignment;
}

// асинхронное получение команды проекта
async function getProjectTeamUsers(project) {
    if (!project) return [];
    const res = await frappe.call({
        method: "project_team_assign_filter",
        args: { project }
    });
    return res.message || [];
}

class CustomAssignmentDialog {
    constructor(opts) {
        this.frm = opts.frm;
        this.assignments = opts.assignments || [];
        this.assignment_details = opts.assignment_details || [];
        this.make();
    }

    make() {
        this.dialog = new frappe.ui.Dialog({
            title: __("Assignments"),
            size: "small",
            no_focus: true,
            fields: [
                {
                    label: __("Assign a user"),
                    fieldname: "user",
                    fieldtype: "Link",
                    options: "User",
                    get_query: () => {
                        if (this.frm.doc && this.frm.doc.project) {
                            return {
                                query: "frappe.core.doctype.user.user.user_query",
                                filters: {
                                    name: ["in", getProjectTeamUsersSync(this.frm.doc.project)]
                                }
                            };
                        }
                    },
                    change: () => {
                        let value = this.dialog.get_value("user");
                        if (value && !this.assigning) {
                            this.assigning = true;
                            this.dialog.set_df_property("user", "read_only", 1);
                            this.dialog.set_df_property("user", "description", __("Assigning..."));
                            this.add_assignment(value)
                                .then(() => this.dialog.set_value("user", null))
                                .finally(() => {
                                    this.dialog.set_df_property("user", "description", null);
                                    this.dialog.set_df_property("user", "read_only", 0);
                                    this.assigning = false;
                                });
                        }
                    }
                },
                {
                    fieldtype: "HTML",
                    fieldname: "assignment_list"
                }
            ]
        });

        this.assignment_list = $(this.dialog.get_field("assignment_list").wrapper);
        this.assignment_list.removeClass("frappe-control");

        this.assignments.forEach((assignment) => {
            this.update_assignment(assignment);
        });

        this.addAssignAllButton();
        this.dialog.show();
    }

    addAssignAllButton() {
        if (this.frm.doc && this.frm.doc.project) {
            const $button = $(`
                <div style="margin: 10px 0;">
                    <button class="btn btn-default btn-xs btn-assign-all-custom">
                        Назначить всю команду
                    </button>
                </div>
            `);
            this.dialog.$wrapper.find('.modal-body').append($button);
            $button.off('click').on('click', async () => {
                await this.assign_entire_team();
            });
        }
    }

    async assign_entire_team() {
        const project = this.frm.doc?.project;
        if (!project) {
            frappe.msgprint(__("Document is not linked to a project."));
            return;
        }

        const restrict = await isTeamRestrictionEnabled(project);
        if (restrict) return;

        const users = await getProjectTeamUsers(project);
        if (!users || users.length === 0) {
            frappe.msgprint("Нет пользователей в команде проекта");
            return;
        }

        const assigned_users = await frappe.db.get_list("ToDo", {
            filters: {
                reference_type: this.frm.doctype,
                reference_name: this.frm.docname,
                status: "Open"
            },
            fields: ["allocated_to"],
            pluck: "allocated_to"
        });

        const users_to_assign = users.filter(u => !assigned_users.includes(u));
        if (users_to_assign.length === 0) {
            frappe.msgprint("Все пользователи команды уже назначены");
            return;
        }

		console.log(this);
		console.log(this.dialog);

		const dialog = this.dialog;

        frappe.confirm(
            __("Назначить задачу всей команде проекта?"),
            async () => {
                //dialog.set_message("Назначаем всем участникам...");
                try {
                    await frappe.call({
                        method: "frappe.desk.form.assign_to.add",
                        args: {
                            doctype: this.frm.doctype,
                            name: this.frm.docname,
                            assign_to: users_to_assign
                        }
                    });

                    users_to_assign.forEach(user => this.update_assignment(user));

                    if (this.frm.reload_doc) this.frm.reload_doc();
                    //dialog.set_message("Команда успешно назначена");
					frappe.toast({
						title: 'Добавление команды',
						message: 'Команда успешно добавлена!',
						indicator: 'green',
						duration: 5
					});
                } catch (error) {
					dialog.set_message("!Ошибка назначения команды");
                    frappe.msgprint({
						message: "" +error.message,
						title: "!Ошибка назначения команды",
						indicator: "red"
					});
                }
            }
        );
    }

    render(assignments) {
        if (this.frm?.assign_to?.render) this.frm.assign_to.render(assignments);
    }

    add_assignment(assignment) {
        return frappe.xcall("frappe.desk.form.assign_to.add", {
            doctype: this.frm.doctype,
            name: this.frm.docname,
            assign_to: [assignment]
        }).then((assignments) => {
            this.update_assignment(assignment);
            this.render(assignments);
            if (this.frm.reload_doc) this.frm.reload_doc();
            return assignments;
        });
    }

    remove_assignment(assignment) {
        return frappe.xcall("frappe.desk.form.assign_to.remove", {
            doctype: this.frm.doctype,
            name: this.frm.docname,
            assign_to: assignment
        }).then((assignments) => {
            if (this.frm.reload_doc) this.frm.reload_doc();
            return assignments;
        });
    }

    close_assignment(assignment) {
        return frappe.xcall("frappe.desk.form.assign_to.close", {
            doctype: this.frm.doctype,
            name: this.frm.docname,
            assign_to: assignment
        }).then((assignments) => {
            if (this.frm.reload_doc) this.frm.reload_doc();
            return assignments;
        });
    }

    update_assignment(assignment) {
		if (!this.assignment_list) {
			if (!this.fields_dict.assignment_list.$wrapper.find(`[data-user="${assignment}"]`).length) {
				this.fields_dict.assignment_list.$wrapper.append(this.get_assignment_row(assignment));
			}
		} else {
			if (!this.assignment_list.find(`[data-user="${assignment}"]`).length) {
				this.assignment_list.append(this.get_assignment_row(assignment));
			}
		}

    }

    get_assignment_row(assignment) {
        const row = $(`
            <div class="dialog-assignment-row" data-user="${assignment}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; ">
                <div class="assignee" style="display: flex; align-items: center;">
                    ${frappe.avatar(assignment)}
                    <span style="margin-left: 8px;">${frappe.user.full_name(assignment)}</span>
                </div>
                <div class="btn-group btn-group-sm" role="group" style="display: flex; gap: 4px;"></div>
            </div>
        `);

        const btn_group = row.find(".btn-group");
        const can_remove = assignment === frappe.session.user ||
                           (this.frm.perm?.[0]?.write);

        if (assignment === frappe.session.user) {
            btn_group.append(`
                <button type="button" class="btn btn-default complete-btn" title="${__("Done")}" style="padding: 2px 6px; font-size: 12px;">
                    ${frappe.utils.icon("tick", "xs")}
                </button>
            `);
            btn_group.find(".complete-btn").on("click", async () => {
                try {
                    const assignments = await this.close_assignment(assignment);
                    row.remove();
                    this.render(assignments);
                } catch (e) {
                    frappe.msgprint(__("Error closing assignment"));
                }
            });
        }

        if (can_remove) {
            btn_group.append(`
                <button type="button" class="btn btn-default remove-btn" title="${__("Cancel")}" style="padding: 2px 6px; font-size: 12px;">
                    ${frappe.utils.icon("close", "xs")}
                </button>
            `);
            btn_group.find(".remove-btn").on("click", async () => {
                try {
                    const assignments = await this.remove_assignment(assignment);
                    row.remove();
                    this.render(assignments);
                } catch (e) {
                    frappe.msgprint(__("Error removing assignment"));
                }
            });
        }

        return row;
    }
}

// form

frappe.ui.form.on("Task", {
    refresh: function(frm) {
		console.log('task assignment form onrefresh');
        setupAssignmentFilter(frm);
    }
});

frappe.ui.form.on("Issue", {
    refresh: function(frm) {
        console.log('issue assignment form onrefresh');
		setupAssignmentFilter(frm);
    }
});

function setupAssignmentFilter(frm) {
    if (!frm.doc.project) return;

    setTimeout(() => {
        const $assignBtns = frm.page.wrapper.find('.add-assignment-btn');
        $assignBtns.off('click').on('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openCustomAssignmentDialog(frm);
        });

        const $avatarFrames = frm.page.sidebar.find('div.assignments, ul.form-assignments .avatar-frame ');
        $avatarFrames.off('click').on('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openCustomAssignmentDialog(frm);
        });
    }, 1500);
}

function openCustomAssignmentDialog(frm) {
    const docinfo = frm.get_docinfo();
    const assignments = (docinfo.assignments || []).map(a => a.owner || a);
    new CustomAssignmentDialog({
        frm: frm,
        assignments: assignments,
        assignment_details: docinfo.assignments || []
    });
}

// listview
function extend_listview_event(doctype, event, callback) {
    if (!frappe.listview_settings[doctype]) {
        frappe.listview_settings[doctype] = {};
    }

    const old_event = frappe.listview_settings[doctype][event];
    frappe.listview_settings[doctype][event] = function(listview) {
        if (old_event) {
            old_event(listview);
        }
        callback(listview);
    };
}
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

["Task", "Issue"].forEach(doctype => {
	//setTimeout(() => {
		extend_listview_event(doctype, 'onload', function(listview) {
			console.log('extended onload');
			// перехватываем render, потому что альтернатива - таймауты.
			const original_render_list = listview.render_list.bind(listview);
			listview.render_list = function() {
				console.log(`render list bind onload ${doctype}`)
				original_render_list();
				setupListViewAssignmentFilter(listview);
				//setupClickInterceptor();
			};

			console.log('Show page:',listview.page);

			listview.get_actions_menu_items = function() {
                // Get the default actions
                const default_actions = frappe.views.ListView.prototype.get_actions_menu_items.call(this);

                // Filter out assignment-related actions
                return default_actions.filter(action =>
                    !["Assign To"].includes(action.label)
                );

                listview.page.add_action_item(__("Custom Assign"), function() {
                    // Your custom assignment logic here
                    const selected_items = listview.get_checked_items();
                    // Custom assignment implementation
                    console.log("selected items", selected_items);
                });
            }
		});
		//kanban has refresh only
		extend_listview_event(doctype, 'refresh', function(listview) {
			console.log(`List View ${doctype} - refresh`);
			const original_render_list = listview.render_list.bind(listview);
			listview.render_list = function() {
				console.log(`render list bind onload ${doctype}`)
				original_render_list();
				setupListViewAssignmentFilter(listview);
			};

			if (listview.view_name === 'Kanban') {
				console.log(`${listview.view_name}`);
				const original_render = listview.render.bind(listview);
				listview.render = function() {
					console.log(`kanban bind render`);
					original_render();
					setupListViewAssignmentFilter(listview);
				};
			}
		});


	//}, 1500);
});

function setupListViewAssignmentFilter(listview) {
	console.log('setup assgn listview');
    const doctype = listview.doctype;
    const selector = '.list-row-container .avatar-frame, .list-row .avatar-frame, .level .avatar-frame, .kanban-assignments .avatar-frame.avatar-action, .kanban-assignments .avatar-frame';
    const existingAvatars = $(selector);
	console.log(existingAvatars);

    existingAvatars.each(function () {
        const $avatar = $(this);

        if (!$avatar.data('lv-assign-handler-set')) {
            $avatar.off('click.lv_assign_direct').on('click.lv_assign_direct', function (e) {
                e.preventDefault();
                e.stopPropagation();

                const $row = $avatar.closest('.list-row-container, .list-row, .level');
			    if ($row && $row.length) {
					console.log('a');
					console.log($row);
				} if ($row.length === 0) {
					const key = $(this).closest('.kanban-card').data('key');
					console.log(key);
				}

				const docname = $row.length === 0 ? ($(this).closest('.kanban-card').data('key')) : ($row.find('[data-name]').first().data('name') || $row.find('[data-name]').first().attr('data-name'));

                if (!docname) {
                    frappe.msgprint(__("Could not determine document name."));
                    return;
                }

                frappe.db.get_value(doctype, docname, 'project').then(r => {
                    const project = r.message?.project;
                    fetchAndOpenDialog(docname, project, listview);
                }).catch((error) => {
					console.error("Error fetching project for docname:", docname, error);
                    fetchAndOpenDialog(docname, null, listview);
                });
            });
            $avatar.data('lv-assign-handler-set', true);
        }
    });
}

function fetchAndOpenDialog(docname, project, listview) {
    frappe.db.get_list('ToDo', {
        filters: {
            reference_type: listview.doctype,
            reference_name: docname,
            status: 'Open'
        },
        fields: ['allocated_to']
    }).then(todo_list => {
        const assignments = todo_list.map(t => t.allocated_to);
        new CustomAssignmentDialog({
            frm: {
                doctype: listview.doctype,
                docname: docname,
                doc: { project: project },
                perm: (listview.meta?.permissions) || [{ write: true }],
                reload_doc: () => listview.refresh()
            },
            assignments: assignments,
            assignment_details: todo_list
        });
    }).catch(error => {
        console.error("Failed to load assignments:", error);
        new CustomAssignmentDialog({
            frm: {
                doctype: listview.doctype,
                docname: docname,
                doc: { project: project },
                perm: [{ write: true }],
                reload_doc: () => listview.refresh()
            },
            assignments: [],
            assignment_details: []
        });
    });
}

// treeview

window.createAssignmentDialog = function(element, node) {
    if (node.can_write) {
        element.off('click').on("click", node, async function(ev) {
            const doctype = "Task";
            const docname = ev.data.value;

            try {
                const res = await frappe.db.get_value(doctype, docname, "project");
                const project = res.message?.project;

                // создаём стандартный диалог
                let dialog = new frappe.ui.form.AssignmentDialog({
                    assignments: ev.data.assign ? JSON.parse(ev.data.assign) : [],
                    frm: {
                        doctype: doctype,
                        docname: docname,
                        perm: [{ write: true }],
                        assign_to: {
                            node: docname,
                            render: function(assignments_from_get) {
                                frappe.db.get_list('ToDo', {
                                    filters: {
                                        reference_type: doctype,
                                        reference_name: docname,
                                        status: 'Open'
                                    },
                                    fields: ['allocated_to']
                                }).then(todo_list => {
                                    const assigns_allocated_to = todo_list.map(todo => todo.allocated_to).filter(Boolean);
                                    let treeNode = cur_tree?.nodes?.[this.node];
                                    if (treeNode) {
                                        treeNode.data.assign = JSON.stringify(assigns_allocated_to);
                                        treeNode.$row.find(".details-cell.assign").html(createAssignmentAvatars(assigns_allocated_to));
                                        update_node_gantt(cur_tree, treeNode.data);
                                    }
                                });
                            }
                        }
                    }
                });

                // модифицируем диалог
                setTimeout(async function() {
                    if (!dialog.dialog || !dialog.dialog.fields_dict) return;

                    const applyCustomization = project && await isTeamRestrictionEnabled(project);
                    if (applyCustomization) {
                        const user_field = dialog.dialog.fields_dict.user;
                        if (user_field) {
                            user_field.get_query = function() {
                                return {
                                    query: "frappe.core.doctype.user.user.user_query",
                                    filters: {
                                        name: ["in", getProjectTeamUsersSync(project)]
                                    }
                                };
                            };
                            user_field.refresh();

                            const $button = $(`
                                <div style="margin: 10px 0;">
                                    <button class="btn btn-default btn-xs btn-assign-all-tree">
                                        Назначить всю команду проекта
                                    </button>
                                </div>
                            `);
                            dialog.dialog.$wrapper.find('.modal-body').append($button);
                            $button.off('click').on('click', async function() {
                                await assignEntireTeamInTreeView(dialog, doctype, docname, project, ev.data.assign ? JSON.parse(ev.data.assign) : []);
                            });
                        }
                    }
                }, 500);

            } catch (error) {
                console.error(`Error getting project for ${doctype} ${docname}:`, error);
            }
        });
    }
};

// вспомогательная функция для Tree View
async function assignEntireTeamInTreeView(dialog, doctype, docname, project, already_assigned_users) {
    try {
        const users = await getProjectTeamUsers(project);
        if (!users || users.length === 0) {
            frappe.msgprint("Нет пользователей в команде проекта");
            return;
        }

        const users_to_assign = users.filter(u => !already_assigned_users.includes(u));
        if (users_to_assign.length === 0) {
            frappe.msgprint("Все пользователи команды уже назначены");
            return;
        }

        frappe.confirm(__("Назначить задачу всей команде проекта?"), async () => {
            //dialog.dialog.set_message("Назначаем всем участникам...");
            try {
                await frappe.call({
                    method: "frappe.desk.form.assign_to.add",
                    args: {
                        doctype: doctype,
                        name: docname,
                        assign_to: users_to_assign
                    }
                });

                // обновляем диалог
                if (dialog.frm?.assign_to?.render) {
                    const updated_assignments_res = await frappe.db.get_list('ToDo', {
                        filters: {
                            reference_type: doctype,
                            reference_name: docname,
                            status: 'Open'
                        },
                        fields: ['allocated_to']
                    });
                    const updatedAssignedUsers = updated_assignments_res.map(a => a.allocated_to);
                    dialog.frm.assign_to.render(updatedAssignedUsers.map(u => ({ owner: u })));
                }

                // обновляем узел дерева
                const treeNode = cur_tree?.nodes?.[docname];
                if (treeNode) {
                    const final_assignments_res = await frappe.db.get_list('ToDo', {
                        filters: {
                            reference_type: doctype,
                            reference_name: docname,
                            status: 'Open'
                        },
                        fields: ['allocated_to']
                    });
                    const updatedAssignedUsers = final_assignments_res.map(a => a.allocated_to);
                    treeNode.data.assign = JSON.stringify(updatedAssignedUsers);
                    if (typeof createAssignmentAvatars === 'function') {
                        treeNode.$row.find(".details-cell.assign").html(createAssignmentAvatars(updatedAssignedUsers));
                    }
                    if (typeof update_node_gantt === 'function') {
                        update_node_gantt(cur_tree, treeNode.data);
                    }
                }

                //dialog.dialog.set_message("Команда успешно назначена");
                frappe.toast({
                    title: 'Добавление команды',
                    message: 'Команда успешно добавлена!',
                    indicator: 'green',
                    duration: 5,
                    position: 'top-right'
                });
                //dialog.dialog.hide();
            } catch (error) {
                dialog.dialog.set_message("!Ошибка назначения команды");
                frappe.msgprint({
                    message: "" +error.message,
                    title: "!Ошибка назначения команды",
                    indicator: "red"
                });
            }
        });
    } catch (error) {
        frappe.msgprint("Ошибка при получении данных команды");
    }
}

// аватарки
window.createAssignmentAvatars = function(users) {
    if (!users || !Array.isArray(users)) return "";
    return users.map(user => frappe.avatar(user, "avatar-xs")).join("");
};


//==================================================================================

/** 
// Client Script для DocType PWAtest
frappe.ui.form.on('PWAtest', {
    refresh: function(frm) {
        console.log('PWAtest client script refresh');
        //frm.set_df_property('pwa_date_start', 'read_only', frm.doc.pwa_default_duration ? 1 : 0);
        //frm.set_df_property('pwa_date_end', 'read_only', frm.doc.pwa_default_duration ? 1 : 0);
    },

    pwa_task_issue: function(frm) {
        console.log("pwa_task_issue changed to:", frm.doc.pwa_task_issue);
        if (frm.doc.pwa_task_issue) {
            const doctype = frm.doc.pwa_type;
            if (doctype) {
                // получаем project из выбранной задачи/тикета
                frappe.db.get_value(doctype, frm.doc.pwa_task_issue, 'project')
                    .then(response => {
                        const project = response.message?.project;
                        if (project) {
                            console.log(`Auto-setting project for ${doctype} ${frm.doc.pwa_task_issue}:`, project);
                            frm.set_value('pwa_project', project);
                        } else {
                            console.log(`No project found for ${doctype} ${frm.doc.pwa_task_issue}`);
                            // если проекта нет, очищаем поле project
                            if (frm.doc.pwa_project) {
                                frm.set_value('pwa_project', '');
                            }
                        }
                    })
                    .catch(error => {
                        console.error(`Error getting project for ${doctype} ${frm.doc.pwa_task_issue}:`, error);
                        if (frm.doc.pwa_project) {
                            frm.set_value('pwa_project', '');
                        }
                    });
            } else {
                console.warn("pwa_type is not set, cannot auto-fetch project.");
                if (frm.doc.pwa_project) {
                    frm.set_value('pwa_project', '');
                }
            }
        } else {
            // если pwa_task_issue очищен, очищаем и pwa_project
            if (frm.doc.pwa_project) {
                frm.set_value('pwa_project', '');
            }
        }
    },

    pwa_project: function(frm) {
        console.log("pwa_project changed to:", frm.doc.pwa_project);
        // set_query для pwa_task_issue будет обновлен автоматически при открытии списка
        // frm.refresh_field('pwa_task_issue'); // Можно попробовать обновить поле
    },
    pwa_type: function(frm) {
        console.log("pwa_type changed to:", frm.doc.pwa_type);
        // очищаем task/issue при смене типа
        frm.set_value('pwa_task_issue', '');
        //frm.set_value('pwa_project', '');
    },
    // pwa_worker_user_doc: function(frm) {
    //     // При смене ссылки на работника/пользователя очищаем роль
    //     // frm.set_value('pwa_worker_user_role', '');
    //     console.log("pwa_worker_user_doc changed, role filter will be updated on next open.");
    // },
    // pwa_worker_user_role обрабатывается ниже в set_query

    pwa_default_duration: async function(frm) {
        console.log("pwa_default_duration changed to:", frm.doc.pwa_default_duration);
        if (frm.doc.pwa_default_duration) {
            console.log("pwa_default_duration checked, fetching dates...");
            const doctype = frm.doc.pwa_type;
            const docname = frm.doc.pwa_task_issue;
            if (!doctype || !docname) {
                frappe.msgprint(__("Please select Document Type and Document first."));
                // frm.set_value('pwa_default_duration', false); // Снимаем галочку, если данные не полные
                return;
            }
            try {
                let start_date_field = '';
                let end_date_field = '';
                if (doctype === 'Issue') {
                    start_date_field = 'opening_date';
                    end_date_field = 'resolution_date';
                } else if (doctype === 'Task') {
                    start_date_field = 'exp_start_date';
                    end_date_field = 'exp_end_date';
                } else {
                    frappe.msgprint(__("Unsupported Document Type for auto-dates."));
                    // frm.set_value('pwa_default_duration', false);
                    return;
                }
				//даты
                const res = await frappe.db.get_value(doctype, docname, [start_date_field, end_date_field]);
                const dates = res.message;
                if (dates && (dates[start_date_field] || dates[end_date_field])) {
                    console.log(`Fetched dates for ${doctype} ${docname}:`, dates);
                    let update_dict = {};
                    if (dates[start_date_field]) {
                        update_dict.pwa_date_start = dates[start_date_field];
                    }
                    if (dates[end_date_field]) {
                        update_dict.pwa_date_end = dates[end_date_field];
                    }
                    frm.set_value(update_dict);
                } else {
                    frappe.msgprint(__("Selected document does not have the required dates."));
                    frm.set_value('pwa_default_duration', false);
                }
            } catch (error) {
                console.error(`Error fetching dates for ${doctype} ${docname}:`, error);
                frappe.msgprint(__("Failed to fetch dates from the document."));
                // frm.set_value('pwa_default_duration', false);
            }
        } else {
            console.log("pwa_default_duration unchecked, not auto-fetching dates.");
            // frm.set_value({
            //     pwa_date_start: '',
            //     pwa_date_end: ''
            // });
        }
        frm.set_df_property('pwa_date_start', 'read_only', frm.doc.pwa_default_duration ? 1 : 0);
        frm.set_df_property('pwa_date_end', 'read_only', frm.doc.pwa_default_duration ? 1 : 0);
    },
    // очитка значений трз при смене типа
    pwa_workload_type: function(frm) {
        console.log("pwa_workload_type changed to:", frm.doc.pwa_workload_type);
        frm.set_value('pwa_workload_hours', 0);
        frm.set_value('pwa_workload_percent', 0);
    }
});

// установка get_query для полей
frappe.ui.form.on('PWAtest', 'setup', function(frm) {
    console.log('Setting up get_query for PWAtest fields...');

    frm.set_query('pwa_task_issue', function() {
        const project = frm.doc.pwa_project;
        const doctype = frm.doc.pwa_type;
        console.log("Setting query for pwa_task_issue:", project, doctype);

        let filters = {};
        if (project) {
            filters.project = project;
        }
        // добавляем фильтр по статусу
        // filters.status = ['!=', 'Closed'];

        if (doctype) {
            return {
                query: "frappe.core.doctype.dynamic_link.dynamic_link.query",
                filters: filters
            };
        } else {
            // если тип не выбран, возвращаем пустой фильтр
            return {
                filters: {
                    name: ['in', []]
                }
            };
        }
    });

    //get_query для pwa_worker_user_role
    frm.set_query('pwa_worker_user_role', function() {
        const worker_user_doc = frm.doc.pwa_worker_user_doc; // Это User.email
        console.log("Setting query for pwa_worker_user_role:", worker_user_doc);

        if (!worker_user_doc) {
            frappe.msgprint(__("Please select Worker/User first."));
            return {
                filters: {
                    name: ['in', []]
                }
            };
        }

        const user_email = worker_user_doc;
        console.log("Determined user email for role filtering:", user_email);

        const project = frm.doc.pwa_project;
        if (!project) {
            frappe.msgprint(__("Project is not set. Cannot filter roles."));
            return {
                filters: {
                    name: ['in', []]
                }
            };
        }

        // получаем разрешенные роли для пользователя
        let allowed_roles = [];
        frappe.call({
            method: "pwa_user_role_list",
            args: { project: project, user: user_email },
            async: false,
            callback: function(r) {
                allowed_roles = r.message || [];
            }
        });

        console.log("Allowed roles for user in project:", allowed_roles);

        if (!allowed_roles.length) {
            // frappe.msgprint(__("User {0} has no roles defined in Project {1}.", [user_email, project]));
            // Можно не показывать сообщение, если это нормальная ситуация
            return {
                filters: {
                    name: ['in', []]
                }
            };
        }

        return {
            filters: {
                name: ['in', allowed_roles]
            }
        };
    });
});

// вызов setup
frappe.ui.form.on('PWAtest', {
    onload: function(frm) {
        console.log('PWAtest onload - calling setup');
        frappe.ui.form.trigger('PWAtest', 'setup', frm);
    },
    refresh: function(frm) {
        console.log('PWAtest refresh - calling setup');
        frappe.ui.form.trigger('PWAtest', 'setup', frm);
    }
}); /* */