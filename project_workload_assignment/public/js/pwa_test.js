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