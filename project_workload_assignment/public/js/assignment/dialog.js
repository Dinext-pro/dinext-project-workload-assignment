let _pwa_starting = false;

// Canonical DB values (types.py / Project Workload Assignment.workload options) — not translated.
const PWR_WORKLOAD_IN_WORKING_HOURS = "В рабочих часах";
const PWR_WORKLOAD_PERCENT_FUND = "В % от фонда рабочих часов";
const PWR_WORKLOAD_PERCENT_TASK = "В % от трудоемкости задачи";

function ensure_task_dates(task) {
    if (task.exp_start_date && task.exp_end_date) {
        return Promise.resolve(task);
    }
    return frappe.db.get_value('Task', task.name, ['exp_start_date', 'exp_end_date'])
        .then(r => {
            if (r.message) {
                task.exp_start_date = r.message.exp_start_date;
                task.exp_end_date = r.message.exp_end_date;
            }
            return task;
        });
}

function start_pwa_dialog(cbfunc, task) {
    if ( _pwa_starting ) { return; }
    _pwa_starting = true;

    ensure_task_dates(task).then(() => {
    frappe.db.get_list('Project Workload Assignment', {
        fields: ['name', 'task', 'role', 'user', 'user_full_name', 'task_dates', 'date_from', 'date_to', 'workload', 'wl_value', 'acc_separately'],
        filters: {
            task: task.name
        },
        limit: 0
    }).then(pwas => {
        frappe.call({
            method: "project_workload_assignment.api.calculate_timesheet_limits",
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
                const todoOnly = (todos || [])
                    .filter((todo) => !pwas.some((pwa) => pwa.user == todo.allocated_to))
                    .map((r) => r.allocated_to);
                add_new_pwa(
                    task,
                    pwas,
                    todoOnly,
                    null,
                    () => make_pwa_dialog(cbfunc, task, pwas, pwes),
                    { fromTodo: true }
                );
            });
        });
    });
    }).catch(() => {
        _pwa_starting = false;
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

function isFromTodo(doc) {
    return !!(doc && !doc.__isRemove && (doc.from_todo || doc.__from_todo));
}

function add_new_pwa(task, pwas, users, grid = null, callback = null, opts = {}) {
    const fromTodo = !!opts.fromTodo;
    const list = users || [];
    if (!list.length) {
        if (callback) {
            callback();
        }
        return;
    }
    frappe.db.get_list('User', {
        fields: ['name', 'full_name'],
        filters: [["name", "in", list]],
        limit: list.length
    })
        .then(results => {
            for ( const user of results ) {
                let roles = getProjectUserRolesSync( task.project, user.name );
                pwas.push( {  
                    idx: pwas.length + 1, 
                    user: user.name, 
                    name: user.name, 
                    task: task.name,
                    role: ( roles.length == 1 ) ? roles[ 0 ] : null,
                    __islocal: true,
                    // Regular field (survives grid) + legacy meta flag.
                    from_todo: fromTodo ? 1 : 0,
                    __from_todo: fromTodo,
                    user_full_name: user.full_name || user.name,
                    task_dates: true,
                    date_from: getMaxToDate( task.exp_start_date ),
                    date_to: getMaxToDate( task.exp_end_date ),
                    workload: PWR_WORKLOAD_PERCENT_TASK,
                    wl_value: 100,
                    acc_separately: true
                } );                                
            }
            if ( grid ) {
                let data = pwas.filter( pwa => !pwa.__isRemove );
                grid.df.data = data;
                grid.refresh();
                decorateTodoPwaRows(grid);
            }
            if ( callback ) {
                callback();
            }
        });
}

function countTodoDrafts(pwas) {
    return (pwas || []).filter((p) => isFromTodo(p)).length;
}

function updateTodoHint(dialog, pwas) {
    const wrap = dialog?.fields_dict?.todo_hint?.$wrapper;
    if (!wrap?.length) {
        return;
    }
    const n = countTodoDrafts(pwas);
    if (!n) {
        wrap.empty().hide();
        return;
    }
    wrap
        .show()
        .html(
            `<div class="alert alert-warning pwa-todo-hint mb-2" role="status">${__(
                "There are {0} ToDo-only assignee(s) without workload. Saving will create Project Workload Assignment rows for them.",
                [n]
            )}</div>`
        );
}

function decorateTodoPwaRows(grid) {
    if (!grid?.grid_rows) {
        return;
    }
    grid.grid_rows.forEach((row) => {
        const doc = row.doc;
        // GridRow: .wrapper = .grid-row, .row = inner .data-row
        const $row = $(row.wrapper || row.row);
        if (!$row.length) {
            return;
        }
        $row.removeClass("pwa-row--from-todo pwa-row--needs-role");
        if (!isFromTodo(doc)) {
            return;
        }
        $row.addClass("pwa-row--from-todo");
        if (!doc.role) {
            $row.addClass("pwa-row--needs-role");
        }
    });
}

function make_pwa_dialog(cbfunc, task, pwas, pwes) {
    let project_users = getProjectTeamUsersSync( task.project );
    
    const d = new frappe.ui.Dialog({
        title: __('Workload assignment'),
        size: 'extra-large',
        fields: [
            {fieldtype: 'Section Break'},
            {
                label: __('User'), 
                fieldname: 'user_search', 
                fieldtype: 'Link', 
                options: 'User',
                filters: { name: ["in", project_users ], ignore_user_type: true },
                change: () => {
                    const uid = d.get_value('user_search');
                    if ( uid ) {
                        let found = pwas.find(rec => rec.user == uid);
                        if ( found ) {
                            const grid = d.fields_dict.pwa_rows.grid;
                            let row = grid.get_row( found.name );
                            row.row.addClass("highlight");
                            setTimeout(function() { 
                                row.row.removeClass("highlight"); 
                                row.activate();                            
                            }, 500);
                            d.set_value('user_search', '');
                        } else {
                            const grid = d.fields_dict.pwa_rows.grid;
                            add_new_pwa( task, pwas, [uid], grid, () => {                                                                
                                let row = grid.get_row( uid );
                                row.activate();
                                d.set_value('user_search', '');
                                checkWorkload( row );
                            } );
                        }
                    }
                }
            },
            {fieldtype: 'Column Break', fieldname: 'user_all_column', },
            {
                fieldtype: 'Button', 
                fieldname: 'user_all', 
                label: " " + __('Assign entire team'),
                icon: 'users',
                click: () => {
                    let new_users = project_users.filter( user => !pwas.some( pwa => !pwa.__isRemove && pwa.user == user ) )
                    
                    if ( new_users.length ) {
                        const grid = d.fields_dict.pwa_rows.grid;                        
                        add_new_pwa( task, pwas, new_users, grid, () => {                                                        
                            new_users.forEach(
                                user => {
                                    let row = grid.get_row( user );
                                    row.row.addClass("highlight");
                                    row.activate();
                                    row.toggle_editable_row( false );
                                    setTimeout(function() { 
                                        row.row.removeClass("highlight"); 
                                        checkWorkload( row );                                        
                                    }, 500);
                                }
                            );
                        } );
                    } else {
                        frappe.show_alert(__("All possible assignees are already assigned"), 5);
                    }
                },
                btn_size: 'sm' // xs, sm, lg
            },
            {fieldtype: 'Section Break', label: __('Work efforts'), collapsible: 1},
            {
                fieldname: 'pwe_rows',
                fieldtype: 'Table',
                cannot_add_rows: 1,
                cannot_delete_rows: 1,
                in_place_edit: true,
                fields: get_pwe_fields(),
                data: pwes
            },
            {fieldtype: 'Section Break', label: __('Workload') },
            {
                fieldtype: "HTML",
                fieldname: "todo_hint",
            },
            {
                //label: __('Assignments'),
                fieldname: 'pwa_rows',
                fieldtype: 'Table',
                cannot_add_rows: 1,
                cannot_delete_rows: 0,
                in_place_edit: true,
                on_setup: null,
                fields: get_pwa_fields( task ),
                data: pwas,
                on_add_row: (_idx) => {},
                on_make: (_me) => {},
            },
        ],
        primary_action_label: __('Save'),
        primary_action: async (values) => {
            const incomplete = (pwas || []).filter(
                (p) => isFromTodo(p) && !p.role
            );
            if (incomplete.length) {
                decorateTodoPwaRows(d.fields_dict.pwa_rows.grid);
                frappe.msgprint({
                    title: __("Role required"),
                    indicator: "orange",
                    message: __(
                        "Select a project role for ToDo-only assignees before saving. Saving creates workload (PWA) rows."
                    ),
                });
                return;
            }
            await submit_pwa_and_todo(pwas || []);
            d.hide();
            if ( cbfunc ) {
                cbfunc( pwas || [] );
            }            
            },
        secondary_action_label: __("Cancel without saving"),
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
        updateTodoHint(d, pwas);
        decorateTodoPwaRows(grid);
    });
    grid.grid_rows.forEach( row => { 
        row.activate();
        checkWorkload( row );
        row.toggle_editable_row( false );
    });

    d.show();
    updateTodoHint(d, pwas);
    decorateTodoPwaRows(grid);
    // Grid paints after show — re-apply chrome on next tick.
    setTimeout(() => {
        updateTodoHint(d, pwas);
        decorateTodoPwaRows(grid);
    }, 0);
    _pwa_starting = false;
}

function getMaxToDate(date) {
    let today = frappe.datetime.now_date();
    return frappe.datetime.get_day_diff( today, date) > 0 ? today: date; 
}

const formatUserDisplay = (val, field, options, doc) => {
    const name = frappe.utils.escape_html(val || "");
    let html = frappe.avatar(doc.user, "", val) + " " + name;
    if (isFromTodo(doc)) {
        html +=
            ` <span class="badge badge-warning pwa-todo-badge" title="${frappe.utils.escape_html(
                __("Assigned via ToDo only — saving will create workload")
            )}">${__("ToDo")}</span>`;
    }
    return html;
}

const formatWLValue = (val, field, options, doc) => {
    return val + " " +  ( ( doc.workload == PWR_WORKLOAD_IN_WORKING_HOURS ) ? __("h") : "%" );
}

function getPWAGrid(me) {
    return me.grid || cur_dialog?.fields_dict?.pwa_rows.grid; 
}

function get_pwa_fields( task ) {
    return [
          {fieldname: 'from_todo', label: __('From ToDo'), fieldtype: 'Check', hidden: 1, in_list_view: 0, read_only: 1},
          {fieldname: 'user_full_name', label: __('User'), fieldtype: 'Read Only', in_list_view: 1, read_only: 1, columns: 2, formatter: formatUserDisplay},
          {fieldname: 'role', label: __('Role'), fieldtype: 'Link', options: 'Project Role',/**/ in_list_view: 1, columns: 2, reqd: 1,
            get_query: (doc, cdt, cdn) =>  {
                return { filters: [["Project Role", "name", "in", getProjectUserRolesSync( task.project, doc.user ) ]] };
            },
            onchange: function(e) { 
                const row = getChangedRow( getPWAGrid( this ), "role" );
                checkWorkload( row );
                const grid = getPWAGrid(this);
                if (grid) {
                    decorateTodoPwaRows(grid);
                }
                if (cur_dialog) {
                    updateTodoHint(cur_dialog, grid?.df?.data || []);
                }
            }
          },            
          {fieldname: 'task_dates', label: __('Task dates'), fieldtype: 'Check', in_list_view: 1, columns: 1, task: task,           
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
          {fieldname: 'date_from', label: __('From date'), fieldtype: 'Date', in_list_view: 1, columns: 1, reqd: 1, read_only_depends_on: "task_dates",
            get_status: function(me) {
                return me.grid_row.on_grid_fields_dict.task_dates.get_value() ? "Read" : "Write";
            }
          },
          {fieldname: 'date_to', label: __('To date'), fieldtype: 'Date', in_list_view: 1, columns: 1, reqd: 1, read_only_depends_on: "task_dates",
            get_status: function(me) {
                return me.grid_row.on_grid_fields_dict.task_dates.get_value() ? "Read" : "Write";
            }
          },
          {fieldname: 'workload', label: __('Workload'), fieldtype: 'Select', in_list_view: 1, columns: 2, reqd: 1,
            options: '\n' + PWR_WORKLOAD_IN_WORKING_HOURS + '\n' + PWR_WORKLOAD_PERCENT_FUND + '\n' + PWR_WORKLOAD_PERCENT_TASK,            
            onchange: function(e) { 
                checkWorkload( getChangedRow( getPWAGrid( this ), "workload" ) );
            },
          },
          {fieldname: 'wl_value', label: __('Amount'), fieldtype: 'Data', in_list_view: 1, columns: 1, formatter: formatWLValue, reqd: 1 },
          /*{fieldname: 'acc_separately', label: __('Charge Dept.'), fieldtype: 'Check', in_list_view: 1, columns: 1},/* */
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
        
        if ( value == PWR_WORKLOAD_PERCENT_TASK ) {
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
                highlightRole( row, __("Work efforts are not defined for role: {0}", [role]) );
            })
        } else {
            highlightRole( row, __("Work efforts are not defined for role: {0}", [role]) );
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

function showForecastColumn() {
    return Boolean(frappe.boot && frappe.boot.dinext_timesheet_show_forecast);
}

function get_pwe_fields() {
    const showForecast = showForecastColumn();
    const fields = [
            { label: __('Role'), fieldname: 'role', fieldtype: 'Data', read_only: 1, in_list_view: 1, columns: 3 },
            { label: __("Plan"), fieldname: 'planned_hours', fieldtype: 'Float', precision: 1, read_only: 1, in_list_view: 1, columns: 1 },
        ];
    if (showForecast) {
        fields.push({
            label: __("Forecast"),
            fieldname: 'forecast_hours',
            fieldtype: 'Float',
            precision: 1,
            read_only: 1,
            in_list_view: 1,
            columns: 1,
        });
    }
    fields.push(
            { label: __("Actual"), fieldname: 'total_hours', fieldtype: 'Float', precision: 1, read_only: 1, in_list_view: 1, columns: 1 },
            { label: __("%"), fieldname: 'completion_percentage', fieldtype: 'Percent', precision: 1, read_only: 1, in_list_view: 1, columns: 1 },
            { label: __("Work efforts accounted from"), fieldname: 'users', fieldtype: 'Data', read_only: 1, in_list_view: 1, columns: showForecast ? 3 : 4 }
        );
    return fields;
}

async function submit_pwa_and_todo(rows) {
  await frappe.call({
    method: 'project_workload_assignment.pwa_dates.bulk.bulk_process_pwa',
    args: { rows: rows },
    freeze: true,
  });

  frappe.show_alert({message: __('Data saved'), indicator: 'green'});
}