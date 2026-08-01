/**
 * Проверка перегрузки PWA относительно прогноза PWE.
 * @param {WorkEffortsForm} frm
 */
function perform_overload_check(frm) {
    let periods = project_workload_assignment.work_efforts.get_display_periods(frm, "month");
    
    frappe.call({
        method: "project_workload_assignment.api.check_workload_overload",
        args: {
            project: frm.doc.name,
            periods: periods,
            view_options: frm.view_options
        },
        freeze: true,
        freeze_message: __("Checking project workload and work efforts..."),
        callback: function(r) {
            if (r.message && r.message.overloads) {
                let overloads = r.message.overloads;
                
                if (overloads.length === 0) {
                    frappe.show_alert({
                        message: __("No discrepancies found"),
                        indicator: 'green'
                    }, 3);
                    return;
                }
                
                frm._overloadMap = {};
                
                overloads.forEach(overload => {
                    if (overload.months) {
                        overload.months.forEach(month => {
                            month.users.forEach(user => {
                                let key = `${overload.task}_${overload.role}_${user.user}`;
                                if (!frm._overloadMap[key]) {
                                    frm._overloadMap[key] = [];
                                }
                                frm._overloadMap[key].push({
                                    year: month.year,
                                    month: month.month,
                                    forecast_hours: month.forecast_hours,
                                    assigned_hours: user.assigned,
                                    overload_hours: user.assigned - month.forecast_hours
                                });
                            });
                        });
                    }
                });
                
                project_workload_assignment.work_efforts
                    .ensure_aggregated_tasks(frm)
                    .then(() => {
                        project_workload_assignment.work_efforts.show_overload_details_dialog(overloads, frm);
                    })
                    .catch(() => {
                        frappe.msgprint(__("Failed to load data for the overload dialog"));
                    });
            } else if (r.message && r.message.error) {
                console.error("Server error:", r.message.error);
                frappe.msgprint(__("Error checking: {0}", [r.message.error]));
            } else {
                console.error("Unexpected response structure:", r);
                frappe.msgprint(__("Unexpected server response"));
            }
        },
        error: function(err) {
            console.error("AJAX Error:", err);
            frappe.msgprint(__("Error checking workload discrepancies"));
        }
    });
}

/**
 * @param {Array<{task: string, role: string, months?: unknown[]}>} overloads
 * @param {WorkEffortsForm} frm
 */
function show_overload_details_dialog(overloads, frm) {
    if (!overloads || overloads.length === 0) return;
    
    let overloadMap = {};
    overloads.forEach(overload => {
        if (!overloadMap[overload.task]) {
            overloadMap[overload.task] = {};
        }
        overloadMap[overload.task][overload.role] = overload;
    });
    
    let allTasks = frm.aggregatedTasks ? Object.values(frm.aggregatedTasks) : [];
    
    let tasksWithOverload = new Set();
    allTasks.forEach(task => {
        if (overloadMap[task.value]) {
            tasksWithOverload.add(task.value);
        }
    });
    
    let tasksToShow = new Set(tasksWithOverload);
    tasksWithOverload.forEach(taskId => {
        let current = allTasks.find(t => t.value === taskId);
        while (current && current.parent_task) {
            tasksToShow.add(current.parent_task);
            current = allTasks.find(t => t.value === current.parent_task);
        }
    });
    
    let table_data = [];
    
    allTasks.forEach(task => {
        if (tasksToShow.has(task.value)) {
            let taskCopy = JSON.parse(JSON.stringify(task));
            
            let new_role_data = [];
            let rolesData = overloadMap[task.value] || {};
            
            if (Object.keys(rolesData).length > 0) {
                Object.keys(rolesData).forEach(role => {
                    let roleEntry = taskCopy.role_data?.find(r => r.role === role);
                    if (roleEntry) {
                        let overload = rolesData[role];
                        roleEntry.total_forecast = overload.total_forecast;
                        roleEntry.total_assigned = overload.total_assigned;
                        roleEntry.overload = overload.overload;
                        new_role_data.push(roleEntry);
                    } else {
                        new_role_data.push({ 
                            role: role,
                            total_forecast: rolesData[role].total_forecast,
                            total_assigned: rolesData[role].total_assigned,
                            overload: rolesData[role].overload
                        });
                    }
                });
                taskCopy.role_data = new_role_data;
                taskCopy.has_overload = true;
            } else {
                taskCopy.role_data = [];
                taskCopy.has_overload = false;
            }
            
            table_data.push(taskCopy);
        }
    });
    
    let tableHeight = Math.min(500, Math.max(200, table_data.length * 30 + 40));
    
    let dialog = new frappe.ui.Dialog({
        title: __("Discrepancies between forecast work efforts and assigned workload"),
        size: "large",
        fields: [
            {
                fieldtype: "HTML",
                fieldname: "table_container",
                options: `<div class="overload-table-container" style="height: ${tableHeight}px; width: 100%; overflow: auto;"></div>`
            },
            {
                fieldtype: "HTML",
                fieldname: "info_html",
                options: `
                    <div class="text-muted" style="margin-top: 10px; padding: 8px 10px; background: var(--bg-light-gray); border-radius: 4px; font-size: 12px;">
                        <i class="fa fa-info-circle" style="margin-right: 5px;"></i>
                        <strong>${__("Check the tasks and roles to update the forecast")}</strong>
                    </div>
                `
            }
        ],
        primary_action_label: __("Update Work Efforts"),
        primary_action: function(values) {
            let checkedRows = dialog.datatable.rowmanager.getCheckedRows();
            
            if (!checkedRows || checkedRows.length === 0) {
                frappe.msgprint(__("Select at least one task and role"));
                return;
            }
            
            let selected_rows = [];
            
            checkedRows.forEach(rowIndex => {
                let rowData = dialog.datatable.datamanager.getData(rowIndex);
                if (rowData && rowData.role_data && rowData.role_data.length > 0) {
                    rowData.role_data.forEach(roleEntry => {
                        let role = roleEntry.role;
                        let overloadData = overloadMap[rowData.value]?.[role];
                        if (overloadData) {
                            selected_rows.push({
                                task: rowData.value,
                                role: role,
                                months: overloadData.months
                            });
                        }
                    });
                }
            });
            
            if (selected_rows.length === 0) {
                frappe.msgprint(__("Select at least one overloaded task and role"));
                return;
            }
            
            frappe.confirm(
                __("Update forecast for {0} positions?", [selected_rows.length]),
                () => project_workload_assignment.work_efforts.update_forecast_from_assignments(frm, selected_rows, dialog)
            );
        },
        secondary_action_label: __("Close"),
        secondary_action: function() {
            dialog.hide();
        }
    });
    
    dialog.show();
    
    setTimeout(() => {
        let container = dialog.$wrapper.find('.overload-table-container');
        
        let columns = [
            {
                name: __("Task"),
                id: "subject",
                width: 200,
                treeView: true,
                sortable: false,
                format: (value) => value || ''
            },
            {
                name: __("Role"),
                id: "role",
                width: 120,
                sortable: false,
                format: (value, row, column, data) => {
                    if (data && data.role_data && data.role_data.length > 0) {
                        return data.role_data.map(r => r.role || '—').join('<br>');
                    }
                    return '—';
                }
            },
            {
                name: __("Work Efforts"),
                id: "total_forecast",
                width: 110,
                sortable: false,
                format: (value, row, column, data) => {
                    if (data && data.role_data && data.role_data.length > 0) {
                        return data.role_data.map(r => {
                            if (r.total_forecast !== undefined) {
                                return r.total_forecast.toFixed(1);
                            }
                            return '—';
                        }).join('<br>');
                    }
                    return '—';
                }
            },
            {
                name: __("Workload"),
                id: "total_assigned",
                width: 110,
                sortable: false,
                format: (value, row, column, data) => {
                    if (data && data.role_data && data.role_data.length > 0) {
                        return data.role_data.map(r => {
                            if (r.total_assigned !== undefined) {
                                return `<span style="color: #e67e22;">${r.total_assigned.toFixed(1)}</span>`;
                            }
                            return '—';
                        }).join('<br>');
                    }
                    return '—';
                }
            },
            {
                name: __("Discrepancy"),
                id: "overload",
                width: 110,
                sortable: false,
                format: (value, row, column, data) => {
                    if (data && data.role_data && data.role_data.length > 0) {
                        return data.role_data.map(r => {
                            if (r.overload !== undefined) {
                                return `<span style="color: #e74c3c; font-weight: bold;">${r.overload.toFixed(1)}</span>`;
                            }
                            return '—';
                        }).join('<br>');
                    }
                    return '—';
                }
            }
        ];
        
        dialog.datatable = new StickyDataTable(container[0], {
            columns: columns,
            data: table_data,
            treeView: true,
            checkboxColumn: true,
            checkedRowStatus: false,
            layout: "fixed",
            inlineFilters: false,
            disableReorderColumn: true,
            serialNoColumn: true,
            cellHeight: 30
        });
        
        setTimeout(() => {
            container.find('.dt-row').each(function() {
                let rowIndex = $(this).data('row-index');
                if (rowIndex !== undefined && dialog.datatable.datamanager) {
                    let rowData = dialog.datatable.datamanager.getData(rowIndex);
                    
                    if (rowData && !rowData.has_overload) {
                        $(this).find('.dt-cell--col-0 input[type="checkbox"]').hide();
                        $(this).css('background-color', '#f8f9fa');
                    }
                }
            });
        }, 100);
        
    }, 200);
}

function escape_html(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

/**
 * @param {WorkEffortsForm} frm
 * @param {Array<{task: string, role: string, months: unknown[]}>} selectedRows
 * @param {object} [dialog]
 */
function update_forecast_from_assignments(frm, selectedRows, dialog) {
    let updates = [];
    
    selectedRows.forEach(row => {
        let task = row.task;
        let role = row.role;
        let months = row.months;
        
        months.forEach(month => {
            updates.push({
                task: task,
                role: role,
                year: month.year,
                month: month.month,
                assigned_hours: month.assigned_hours
            });
        });
    });
    
    let updates_json = JSON.stringify(updates);
    
    frappe.call({
        method: "project_workload_assignment.api.update_forecast_from_assignments",
        args: {
            project: frm.doc.name,
            updates_json: updates_json
        },
        freeze: true,
        freeze_message: __("Updating forecast work efforts..."),
        callback: function(r) {
            if (r.message && r.message.success) {
                frappe.show_alert({
                    message: __("Forecast data successfully updated for {0} positions", [r.message.updated_count]),
                    indicator: 'green'
                }, 5);
                
                if (dialog) dialog.hide();
                
                project_workload_assignment.work_efforts.clear_assignments_cache();
                project_workload_assignment.work_efforts.clear_aggregated_tasks?.(frm);
                frm.last_loaded_time = null;
                frm.last_loaded_project = null;
                frm._overloadMap = {};
                frm._missingPlanMap = {};

                if (window.WorkEfforts?.refresh) {
                    window.WorkEfforts.refresh(frm);
                }
            } else if (r.message && r.message.error) {
                frappe.msgprint(__("Error updating: {0}", [r.message.error]));
            } else {
                frappe.msgprint(__("Unknown error while updating forecast data"));
            }
        },
        error: function(err) {
            console.error("AJAX Error:", err);
            frappe.msgprint(__("Error updating forecast data"));
        }
    });
}

Object.assign(project_workload_assignment.work_efforts, {
    perform_overload_check,
    show_overload_details_dialog,
    escape_html,
    update_forecast_from_assignments,
});
