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
                        todos.filter(todo => !pwas.some( pwa => pwa.user == todo.allocated_to ) ).map( r => r.allocated_to ),
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

function add_new_pwa( task, pwas, users, callback=null) {
    frappe.db.get_list('User', {
        fields: ['name', 'full_name'],
        filters: [["name", "in", users ]],
        limit: users.length
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
                    user_full_name: user.full_name || user.name,
                    date_from: getMaxToDate( task.exp_start_date ),
                    date_to: getMaxToDate( task.exp_end_date ),
                    workload: __('В % от трудоемкости задачи'),
                    wl_value: 100
                } ); 
            }
            if ( callback ) {
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
                    if ( uid ) {
                        let found = pwas.find(rec => rec.user == uid);
                        if ( found ) {
                            const grid = d.fields_dict.pwa_rows.grid;
                            let row = grid.get_row( found.name );
                            row.row.addClass("highlight");
                            setTimeout(function() { 
                                row.row.removeClass("highlight"); 
                                row.toggle_editable_row();
                            }, 500);
                            d.set_value('user_search', '');
                        } else {
                            add_new_pwa( task, pwas, [uid], () => {
                                const grid = d.fields_dict.pwa_rows.grid;
                                grid.refresh();
                                let row = grid.get_row( uid );
                                row.toggle_editable_row();
                                d.set_value('user_search', '');
                            } );
                        }
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
                    let new_users = project_users.filter( user => !pwas.some( pwa => pwa.user == user ) )
                    
                    if ( new_users.length ) {
                        add_new_pwa( task, pwas, new_users, () => {
                            const grid = d.fields_dict.pwa_rows.grid;
                            grid.refresh();
                            new_users.forEach(
                                user => {
                                    let row = grid.get_row( user );
                                    row.row.addClass("highlight");
                                    setTimeout(function() { 
                                        row.row.removeClass("highlight"); 
                                    }, 500);
                                }
                            );
                        } );
                    } else {
                        frappe.show_alert(__("Назначены все возможные исполнители"), 5);
                    }
                },
                btn_size: 'sm' // xs, sm, lg
            },
            {fieldtype: 'Section Break', label: __('Трудозатраты'), collapsible: 1},
            {
                fieldname: 'pwe_rows',
                fieldtype: 'Table',
                cannot_add_rows: 1,
                cannot_delete_rows: 1,
                in_place_edit: true,
                fields: get_pwe_fileds(),
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
                fields: get_pwa_fileds( task ),
                data: pwas,
                on_add_row: (idx) => {
                    console.log("on_add_row " + idx);
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
            let found = pwas.find(rec => rec.name == removed);
            if ( found ) {
                found.__isRemove = true
            }
        }
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

function get_pwa_fileds( task ) {
    return [
          {fieldname: 'user_full_name', label: __('User'), fieldtype: 'Read Only', in_list_view: 1, read_only: 1, columns: 2, formatter: formatUserDisplay},
          {fieldname: 'role', label: __('Роль'), fieldtype: 'Link', options: 'Project Role',/**/ in_list_view: 1, columns: 1, reqd: 1,
            get_query: (doc, cdt, cdn) =>  {
                return { filters: [["Project Role", "name", "in", getProjectUserRolesSync( task.project, doc.user ) ]] };
            }},            
          {fieldname: 'task_dates', label: __('Даты задачи'), fieldtype: 'Check', in_list_view: 1, columns: 1, task: task,           
            onchange: function (e) { 
                let docname = $(e.target).closest(".grid-row").data("name");
                let row = this.grid.get_row(docname);
                
                let value = row.get_field("task_dates").get_value();

                if ( value ) {
                    let dfrom = row.get_field("date_from");
                    let dto = row.get_field("date_to");

                    dfrom.set_value( this.df.task.exp_start_date );
                    dto.set_value( this.df.task.exp_end_date );
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
            onchange: function (e) { 
                let docname = $(e.target).closest(".grid-row").data("name");
                let row = this.grid.get_row(docname);
                let value = row.get_field("workload").get_value();
                

                if ( value == __('В % от трудоемкости задачи') ) {
                    let task = row.get_field("task_dates").df.task;
                    let role = row.get_field("role").get_value();
                    checkPWEforRow( task, role, row );
                } else {
                    clearHighlightRow( row );
                }
            }
          },
          {fieldname: 'wl_value', label: __('Величина'), fieldtype: 'Data', in_list_view: 1, columns: 1, formatter: formatWLValue, reqd: 1 },
          {fieldname: 'acc_separately', label: __('Учит. отд.'), fieldtype: 'Check', in_list_view: 1, columns: 1},
        ];
}

function checkPWEforRow( task, role, row ) {
    frappe.db.count('Project Work Efforts',
        { 
            pwe_project: task.project,
            pwe_task: task.name,
            pwe_project_role: role
        })
    .then(count => {
        if ( count ) {
            frappe.db.get_doc('Project Work Efforts', null, 
                { 
                    pwe_project: task.project,
                    pwe_task: task.name,
                    pwe_project_role: role
                })
            .then(pwe => {
                console.log(pwe);
            })
        } else {
            highlightRow( row, __("Не определены трудозатраты для роли: ") + role );
        }
    })
}

function highlightRow( row, msg ) {
    let workload = row.get_field("workload");
    let role = row.get_field("role");

    workload.parent.parent().addClass("warning");    
    role.parent.parent().addClass("warning");

    row.grid.control.layout.add_fields([
        { fieldname: 'warning', fieldtype: 'HTML', options: msg },
    ]);
}

function clearHighlightRow( row ) {
    let workload = row.get_field("workload");
    let role = row.get_field("role");

    workload.parent.parent().removeClass("warning");
    role.parent.parent().removeClass("warning");

    let warning = row.grid.control.layout.get_field( "warning" );

    if ( warning ) {
        warning.section.hide();
    }
}

function get_pwe_fileds() {
    return [
            { label: __('Роль'), fieldname: 'role', fieldtype: 'Data', read_only: 1, in_list_view: 1, columns: 3 },
            { label: __("План"), fieldname: 'planned_hours', fieldtype: 'Float', precision: 1, read_only: 1, in_list_view: 1, columns: 1 },
            { label: __("Факт"), fieldname: 'total_hours', fieldtype: 'Float', precision: 1, read_only: 1, in_list_view: 1, columns: 1 },
            { label: __("%"), fieldname: 'completion_percentage', fieldtype: 'Percent', precision: 1, read_only: 1, in_list_view: 1, columns: 1 },
            { label: __("Учтены трудозатраты от"), fieldname: 'users', fieldtype: 'Data', read_only: 1, in_list_view: 1, columns: 4 }
        ];
}

async function submit_pwa_and_todo(rows) {
  await frappe.call({
    method: 'bulk_process_pwa',
    args: { rows: rows },
    freeze: true,
  });

  frappe.show_alert({message: __('Данные сохранены'), indicator: 'green'});
}