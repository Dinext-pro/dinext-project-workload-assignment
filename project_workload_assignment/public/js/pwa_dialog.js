# test
let _pwa_starting = false;

function start_pwa_dialog(cbfunc, task) {
    if ( _pwa_starting ) { return; }
    _pwa_starting = true;

    frappe.db.get_list('Project Workload Assignment', {
        fields: ['name', 'task', 'role', 'user', 'user_full_name', 'task_dates', 'date_from', 'date_to', 'workload', 'wl_value', 'acc_separately'],
        filters: {
            task: task.name
        },
        limit: 0
    }).then(pwas => {
        frappe.call({
            method: 'calculate_timesheet_limits',
            args: {
                timesheet_name: "",
                positions: [ {
                    name: task.name,
                    document_name: task.name,
                    project: task.project
                } ]
            }
        }).then(results => {
            let pwes = results.message;
            pwes.forEach(data => {
                data.users = frappe.utils.comma_and( data.hours_data?.users );
            });
            frappe.db.get_list('ToDo', {
                fields: ['allocated_to'],
                filters: {
                    status: "Open",
                    reference_type: "Task",
                    reference_name: task.name
                },
                limit: 0
            }).then(todos => {
                if ( todos ) {
                    add_new_pwa( task, pwas, 
                        todos.filter(todo => !pwas.some( pwa => pwa.user == todo.allocated_to ) ).map( r => r.allocated_to ), null,
                        () => make_pwa_dialog( cbfunc, task, pwas, pwes ) );
                }
            });
        });
    });
}

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

function getProjectUserRolesSync(project, user) {
    if (!project || !user)  return [];
    let roles = [];
    frappe.call({
        method: "get_project_user_roles",
        args: { 
            project: project, 
            user: user
        },
        async: false,
        callback: (r) => {
            roles = r.message || [];
        }
    });
    return roles;
}

function add_new_pwa(task, pwas, users, specificRole = null, grid = null, callback = null) {
    frappe.db.get_list('User', {
        fields: ['name', 'full_name'],
        filters: [["name", "in", users]],
        limit: users.length
    })
    .then(results => {
        for (const user of results) {
            // Получаем роли пользователя в проекте
            let userRoles = getProjectUserRolesSync(task.project, user.name);
            
            // Определяем, какую роль ставить
            let roleToSet;
            if (specificRole) {
                // Если передана конкретная роль - используем её
                roleToSet = specificRole;
            } else if (userRoles.length === 1) {
                // Если у пользователя одна роль - ставим её автоматически
                roleToSet = userRoles[0];
            } else {
                // Если несколько ролей - оставляем пустой для ручного выбора
                roleToSet = null;
            }
            
            pwas.push({  
                idx: pwas.length + 1, 
                user: user.name, 
                name: `${user.name}_${Date.now()}_${Math.random()}`, // Уникальный ID
                task: task.name,
                role: roleToSet,
                __islocal: true, 
                user_full_name: user.full_name || user.name,
                task_dates: true,
                date_from: getMaxToDate(task.exp_start_date),
                date_to: getMaxToDate(task.exp_end_date),
                workload: __('В % от трудоемкости задачи'),
                wl_value: 100,
                acc_separately: true
            });
        }
        
        if (grid) {
            let data = pwas.filter(pwa => !pwa.__isRemove);
            grid.df.data = data;
            grid.refresh();
        }
        
        if (callback) {
            callback();
        }
    });
}

function make_pwa_dialog(cbfunc, task, pwas, pwes) {
    let project_users = getProjectTeamUsersSync( task.project );
    
    const d = new frappe.ui.Dialog({
        title: __('Назначение загрузки'),
        size: 'extra-large',
        fields: [
            {fieldtype: 'Section Break'},
            {
                label: __('Пользователь'), 
                fieldname: 'user_search', 
                fieldtype: 'Link', 
                options: 'User',
                filters: { name: ["in", project_users ], ignore_user_type: true },
                change: () => {
                    const uid = d.get_value('user_search');
                    if (uid) {
                        const grid = d.fields_dict.pwa_rows.grid;
                        
                        // Получаем все роли пользователя в проекте
                        let userRoles = getProjectUserRolesSync(task.project, uid);
                        
                        // Получаем существующие назначения пользователя (активные, не удаленные)
                        let existingAssignments = pwas.filter(rec => 
                            rec.user == uid && !rec.__isRemove
                        );
                        
                        // Если у пользователя одна роль
                        if (userRoles.length === 1) {
                            let existingRole = userRoles[0];
                            let alreadyAssigned = existingAssignments.some(a => a.role === existingRole);
                            
                            if (alreadyAssigned) {
                                // Уже назначен с этой ролью - просто подсвечиваем
                                frappe.show_alert({
                                    message: __('Пользователь уже назначен на эту роль'),
                                    indicator: 'orange'
                                }, 3);
                                
                                existingAssignments.forEach(assignment => {
                                    let row = grid.get_row(assignment.name);
                                    if (row) {
                                        row.row.addClass("highlight");
                                        setTimeout(() => row.row.removeClass("highlight"), 500);
                                    }
                                });
                            } else {
                                // Не назначен - добавляем
                                add_new_pwa(task, pwas, [uid], null, grid, () => {
                                    let newRow = grid.get_row(uid);
                                    if (newRow) {
                                        newRow.activate();
                                        checkWorkload(newRow);
                                    }
                                });
                            }
                        } 
                        // Если у пользователя несколько ролей
                        else {
                            // Какие роли уже назначены?
                            let assignedRoles = existingAssignments.map(a => a.role).filter(r => r);
                            
                            // Какие роли еще не назначены?
                            let availableRoles = userRoles.filter(role => !assignedRoles.includes(role));
                            
                            if (availableRoles.length === 0) {
                                // Все роли уже назначены
                                frappe.show_alert({
                                    message: __('Пользователь уже назначен на все доступные роли'),
                                    indicator: 'orange'
                                }, 3);
                                
                                existingAssignments.forEach(assignment => {
                                    let row = grid.get_row(assignment.name);
                                    if (row) {
                                        row.row.addClass("highlight");
                                        setTimeout(() => row.row.removeClass("highlight"), 500);
                                    }
                                });
                            } else {
                                // Есть неназначенные роли - показываем диалог выбора
                                let roleDialog = new frappe.ui.Dialog({
                                    title: __('Выберите роль'),
                                    fields: [
                                        {
                                            fieldtype: 'Select',
                                            fieldname: 'role',
                                            label: __('Роль для назначения'),
                                            options: availableRoles,
                                            reqd: 1
                                        }
                                    ],
                                    primary_action_label: __('Добавить'),
                                    primary_action: (values) => {
                                        add_new_pwa(task, pwas, [uid], values.role, grid, () => {
                                            // Находим добавленную строку (последнюю запись этого пользователя)
                                            let newAssignments = pwas.filter(p => 
                                                p.user == uid && !p.__isRemove && !existingAssignments.includes(p)
                                            );
                                            
                                            newAssignments.forEach(assignment => {
                                                let row = grid.get_row(assignment.name);
                                                if (row) {
                                                    row.row.addClass("highlight");
                                                    row.activate();
                                                    setTimeout(() => {
                                                        row.row.removeClass("highlight");
                                                        checkWorkload(row);
                                                    }, 500);
                                                }
                                            });
                                        });
                                        
                                        roleDialog.hide();
                                        
                                        frappe.show_alert({
                                            message: __('Добавлена запись с ролью {0}', [values.role]),
                                            indicator: 'green'
                                        }, 3);
                                    }
                                });
                                
                                roleDialog.show();
                            }
                        }
                        
                        d.set_value('user_search', '');
                    }
                }
            },
            {fieldtype: 'Column Break', fieldname: 'user_all_column', },
            {
                fieldtype: 'Button', 
                fieldname: 'user_all', 
                label: " " + __('Назначить всю команду'),
                icon: 'users',
                click: () => {
                    let added = false;
                    let skipped = [];
                    
                    project_users.forEach(user => {
                        let userRoles = getProjectUserRolesSync(task.project, user);
                        let existingAssignments = pwas.filter(pwa => 
                            pwa.user == user && !pwa.__isRemove
                        );
                        
                        // Для пользователей с одной ролью
                        if (userRoles.length === 1) {
                            let role = userRoles[0];
                            let alreadyAssigned = existingAssignments.some(a => a.role === role);
                            
                            if (!alreadyAssigned) {
                                add_new_pwa(task, pwas, [user], null, grid);
                                added = true;
                            } else {
                                skipped.push(`${user} (${role})`);
                            }
                        } 
                        // Для пользователей с несколькими ролями
                        else {
                            let assignedRoles = existingAssignments.map(a => a.role);
                            let newRoles = userRoles.filter(role => !assignedRoles.includes(role));
                            
                            if (newRoles.length > 0) {
                                // Добавляем по одной записи на каждую новую роль
                                newRoles.forEach(role => {
                                    add_new_pwa(task, pwas, [user], role, grid);
                                });
                                added = true;
                            } else {
                                skipped.push(`${user} (все роли назначены)`);
                            }
                        }
                    });
                    
                    if (added) {
                        grid.refresh();
                        frappe.show_alert({
                            message: __('Добавлены новые назначения'),
                            indicator: 'green'
                        }, 3);
                        
                        if (skipped.length > 0) {
                            console.log('Пропущены (уже назначены):', skipped);
                        }
                    } else {
                        frappe.show_alert({
                            message: __('Все возможные назначения уже существуют'),
                            indicator: 'orange'
                        }, 5);
                    }
                }
                btn_size: 'sm' // xs, sm, lg
            },
            {fieldtype: 'Section Break', label: __('Трудозатраты'), collapsible: 1},
            {
                fieldname: 'pwe_rows',
                fieldtype: 'Table',
                cannot_add_rows: 1,
                cannot_delete_rows: 1,
                in_place_edit: true,
                fields: get_pwe_fields(),
                data: pwes
            },
            {fieldtype: 'Section Break', label: __('Загрузка') },
            {
                //label: __('Назначения'),
                fieldname: 'pwa_rows',
                fieldtype: 'Table',
                cannot_add_rows: 1,
                cannot_delete_rows: 0,
                in_place_edit: true,
                on_setup: null,
                fields: get_pwa_fields( task ),
                data: pwas,
                on_add_row: (idx) => {
                    console.log("on_add_row " + idx);
                },
                on_make: (me) => {
                    console.log("on_make " + me);
                },
            },
        ],
        primary_action_label: __('Сохранить'),
        primary_action: async (values) => {
            await submit_pwa_and_todo(pwas || []);
            d.hide();
            if ( cbfunc ) {
                cbfunc( pwas || [] );
            }            
            },
        secondary_action_label: __("Отменить"),
        secondary_action: async (values) => { d.hide(); },
        });
    
    const grid = d.fields_dict.pwa_rows.grid;
    grid.wrapper.on('click', '.grid-remove-rows, .grid-remove-all-rows', function(e) {
        for (removed of grid.get_selected()) {
            let found = pwas.find(rec => rec.name == removed && !rec.__isRemove );
            if ( found ) {
                found.__isRemove = true
            }
        }
    });
    grid.grid_rows.forEach( row => { 
        row.activate();
        checkWorkload( row );
        row.toggle_editable_row( false );
    });

    d.show();
    _pwa_starting = false;
}

function getMaxToDate(date) {
    let today = frappe.datetime.now_date();
    return frappe.datetime.get_day_diff( today, date) > 0 ? today: date; 
}

const formatUserDisplay = (val, field, options, doc) => {
    return frappe.avatar( doc.user, "", val ) + " " + val;
}

const formatWLValue = (val, field, options, doc) => {
    return val + " " +  ( ( doc.workload == __("В рабочих часах") ) ? __("ч.") : "%" );
}

function getPWAGrid(me) {
    return me.grid || cur_dialog?.fields_dict?.pwa_rows.grid; 
}

function get_pwa_fields( task ) {
    return [
          {fieldname: 'user_full_name', label: __('User'), fieldtype: 'Read Only', in_list_view: 1, read_only: 1, columns: 2, formatter: formatUserDisplay},
          {fieldname: 'role', label: __('Роль'), fieldtype: 'Link', options: 'Project Role',/**/ in_list_view: 1, columns: 2, reqd: 1,
            get_query: (doc, cdt, cdn) =>  {
                return { filters: [["Project Role", "name", "in", getProjectUserRolesSync( task.project, doc.user ) ]] };
            },
            onchange: function(e) { 
                checkWorkload( getChangedRow( getPWAGrid( this ), "role" ) );
            }
          },            
          {fieldname: 'task_dates', label: __('Даты задачи'), fieldtype: 'Check', in_list_view: 1, columns: 1, task: task,           
            onchange: function (e) { 
                let docname = $(e.target).closest(".grid-row").data("name");
                let row = getPWAGrid( this ).get_row(docname);
                
                let field = row.get_field("task_dates");
                let value = field.get_value();

                if ( value ) {
                    let dfrom = row.get_field("date_from");
                    let dto = row.get_field("date_to");

                    dfrom.set_value( field.df.task.exp_start_date );
                    dto.set_value( field.df.task.exp_end_date );
                }

                row.refresh();
            },
          },
          {fieldname: 'date_from', label: __('Дата с'), fieldtype: 'Date', in_list_view: 1, columns: 1, reqd: 1, read_only_depends_on: "task_dates",
            get_status: function(me) {
                return me.grid_row.on_grid_fields_dict.task_dates.get_value() ? "Read" : "Write";
            }
          },
          {fieldname: 'date_to', label: __('Дата по'), fieldtype: 'Date', in_list_view: 1, columns: 1, reqd: 1, read_only_depends_on: "task_dates",
            get_status: function(me) {
                return me.grid_row.on_grid_fields_dict.task_dates.get_value() ? "Read" : "Write";
            }
          },
          {fieldname: 'workload', label: __('Загрузка'), fieldtype: 'Select', in_list_view: 1, columns: 2, reqd: 1,
            options: '\n' + __('В рабочих часах') + '\n' + __('В % от фонда рабочих часов') + '\n' + __('В % от трудоемкости задачи'),            
            onchange: function(e) { 
                checkWorkload( getChangedRow( getPWAGrid( this ), "workload" ) );
            },
          },
          {fieldname: 'wl_value', label: __('Величина'), fieldtype: 'Data', in_list_view: 1, columns: 1, formatter: formatWLValue, reqd: 1 },
          /*{fieldname: 'acc_separately', label: __('Учит. отд.'), fieldtype: 'Check', in_list_view: 1, columns: 1},/* */
        ];
}

function getChangedRow( grid, fieldname ) {
    let result_row = null;
    grid.grid_rows.forEach( row => {
        let field = row.on_grid_fields_dict[fieldname];
        if ( field && field.last_value != field.get_value() ) {
            result_row = row;
            return;
        }
    });
    return result_row;
}

function checkWorkload( row ) {
    if ( row ) {
        let value = row.get_field("workload").get_value();

        clearHighlights( row );
        
        if ( value == __('В % от трудоемкости задачи') ) {
            let task = row.get_field("task_dates").df.task;
            let role = row.get_field("role").get_value();

            if ( role && role != "" ) {
                checkPWEforRow( task, role, row );
            }
        }
    }
}

function checkPWEforRow( task, role, row ) {
    frappe.db.count('Project Work Efforts', {
        filters: { 
            pwe_project: task.project,
            pwe_task: task.name,
            pwe_project_role: role
        }})
    .then(count => {
        if ( count ) {
            frappe.db.get_doc('Project Work Efforts', null, 
                { 
                    pwe_project: task.project,
                    pwe_task: task.name,
                    pwe_project_role: role
                })
            .then(pwe => {                
                for (let i = 0; i < pwe?.pwe_amount?.length; i++) {
                    let amount = pwe.pwe_amount[ i ];
                    if ( amount.pwea_plan ) {
                        return;
                    }
                }
                highlightRole( row, __("Не определены трудозатраты для роли: ") + role );
            })
        } else {
            highlightRole( row, __("Не определены трудозатраты для роли: ") + role );
        }
    })
}

function highlightRole( row, msg ) {
    let workload = row.get_field("workload");
    let role = row.get_field("role");

    workload.parent.parent().addClass("warning");    
    role.parent.parent().addClass("warning");

    workload.parent.parent().attr('tooltip', msg ); 
    role.parent.parent().attr('tooltip', msg ); 
}

function clearHighlights( row ) {
    let workload = row.get_field("workload");
    let role = row.get_field("role");

    workload.parent.parent().removeClass("warning");
    role.parent.parent().removeClass("warning");

    workload.parent.parent().attr('tooltip', "" ); 
    role.parent.parent().attr('tooltip', "" ); 
}

function get_pwe_fields() {
    return [
            { label: __('Роль'), fieldname: 'role', fieldtype: 'Data', read_only: 1, in_list_view: 1, columns: 3 },
            { label: __("План"), fieldname: 'planned_hours', fieldtype: 'Float', precision: 1, read_only: 1, in_list_view: 1, columns: 1 },
            { label: __("Факт"), fieldname: 'total_hours', fieldtype: 'Float', precision: 1, read_only: 1, in_list_view: 1, columns: 1 },
            { label: __("%"), fieldname: 'completion_percentage', fieldtype: 'Percent', precision: 1, read_only: 1, in_list_view: 1, columns: 1 },
            { label: __("Учтены трудозатраты от"), fieldname: 'users', fieldtype: 'Data', read_only: 1, in_list_view: 1, columns: 4 }
        ];
}

async function submit_pwa_and_todo(rows) {
    // Проверка на дубликаты пользователь+роль
    const uniqueCombos = new Set();
    const duplicates = [];
    
    for (const row of rows) {
        if (row.__isRemove) continue; // Пропускаем удаленные
        
        // Проверяем, что роль указана
        if (!row.role) {
            frappe.throw(__('Для пользователя {0} не указана роль', [row.user_full_name]));
        }
        
        const combo = `${row.user}|${row.role}`;
        if (uniqueCombos.has(combo)) {
            duplicates.push(`${row.user_full_name} - ${row.role}`);
        }
        uniqueCombos.add(combo);
    }
    
    if (duplicates.length > 0) {
        frappe.throw(__('Обнаружены дублирующиеся назначения:\n{0}', [duplicates.join('\n')]));
    }
    
    await frappe.call({
        method: 'bulk_process_pwa',
        args: { rows: rows },
        freeze: true,
    });
    
    frappe.show_alert({message: __('Данные сохранены'), indicator: 'green'});
}