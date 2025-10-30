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
                    workload: 'В % от трудоемкости задачи',
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
          {fieldname: 'task_dates', label: __('Синх. дат'), fieldtype: 'Check', in_list_view: 1, columns: 1,            
            onchange: function () { 
                let row = this.grid.get_row(this.docname);
                let dfrom = row.on_grid_fields_dict.date_from;
                let dto = row.on_grid_fields_dict.date_to;
                /*disp_status = this.get_value() ? "Read" : "Write";
                dfrom.disp_status = disp_status;
                dfrom.refresh_input();  
                dto.disp_status = disp_status;
                dto.refresh_input();    /* */
                this.grid.refresh_row(this.docname);
            },
          },
          {fieldname: 'date_from', label: __('Дата с'), fieldtype: 'Date', in_list_view: 1, columns: 1, reqd: 1, read_only_depends_on: "task_dates"},
          {fieldname: 'date_to', label: __('Дата по'), fieldtype: 'Date', in_list_view: 1, columns: 1, reqd: 1, read_only_depends_on: "task_dates"},
          {fieldname: 'workload', label: __('Загрузка'), fieldtype: 'Select',
            options: '\nВ рабочих часах\nВ % от фонда рабочих часов\nВ % от трудоемкости задачи', in_list_view: 1, columns: 2, reqd: 1},
          {fieldname: 'wl_value', label: __('Величина'), fieldtype: 'Data', in_list_view: 1, columns: 1, formatter: formatWLValue, reqd: 1 },
          {fieldname: 'acc_separately', label: __('Учит. отд.'), fieldtype: 'Check', in_list_view: 1, columns: 1},
        ];
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