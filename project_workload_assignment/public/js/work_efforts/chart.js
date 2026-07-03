function applyWEChartStyle() {
    var styles = `
        .we-chart-wrapper {
            & .we-chart-container {
                width:100%;
                max-height:360px;
            }
            & .work-efforts-controls {
                position: absolute;
                right: 0px;
                width: fit-content;
            }
        }
        :root {
            --charts-bg-block: #e0363622;
            --charts-bg-warn: #edba1322;
            --charts-bg-ok: #59ba8b22;
            --charts-stroke: rgba(0,0,0,0);
        }
`;

    var styleSheet = document.createElement("style");
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
}

applyWEChartStyle();

frappe.ui.form.on("Project", {
    refresh: function(frm) {
        project_workload_assignment.work_efforts.render_work_efforts_chart(frm, false);
    }
});

frappe.ui.form.on("Limit Control", "limit", function(frm, cdt, cdn) {
    project_workload_assignment.work_efforts.render_work_efforts_chart(frm, false)
});

frappe.ui.form.on("Limit Control", "type", function(frm, cdt, cdn) {
    project_workload_assignment.work_efforts.render_work_efforts_chart(frm, false)
});

frappe.ui.form.on("Limit Control", {  
    custom_limit_control_table_remove: function(frm, cdt, cdn) {  
        project_workload_assignment.work_efforts.render_work_efforts_chart(frm, false);
    }  
});

/* добавление контролла выбора роли для фильтра графика */
function add_role_filter_control(frm, controls) {
    frappe.ui.form.make_control({
		parent: controls,
		df: {
			fieldtype: 'Select',
			fieldname: "chart-roles",
			options: project_workload_assignment.work_efforts.get_project_roles(frm),
			get_status: function(i) {
                return "Write";
            },
            change: async function(i){
                if ( this.value != this.last_value ) {
                    frm._we_selected_role = this.value;
                    project_workload_assignment.work_efforts.render_work_efforts_chart(frm, false);
                }
            }
		},
		value: frm._we_selected_role,
		only_input: true,
        render_input: true
	});
}

/* сбор данных для графика — возвращает:
   labels, plan (по периодам), actual_forecast (по периодам),
   cumulative_plan, cumulative_actual_forecast, periods, plan_by_period
*/
/**
 * @param {WorkEffortsForm} frm
 * @param {string} selectedRole
 * @returns {object}
 */
function build_chart_data(frm, selectedRole) {
    let aggregatedTasks = frm.aggregatedTasks || {};
    let periods = project_workload_assignment.work_efforts.get_display_periods(frm, "month");
    let labels = periods.map(p => `${p.year}-${String(p.month).padStart(2,'0')}`);

    // Вспомогательная рекурсивная функция: возвращает { plan, actual } для заданной задачи и роли за период
    function sumForTaskByPeriod(taskId, period, roleFilter, planRoles, actualRoles) {
        let task = aggregatedTasks[taskId];
        if (!task) return { plan: 0, actual: 0 };

        let plan = 0, actual = 0;
        let e = (task.role_data || []);

        if (roleFilter) {
            e = e.find(r => r.role === roleFilter);
            if ( e ) e = [e];
        }
        
        if ( e && e.length ) {
            e.forEach(r => {
                const planIndex = planRoles.indexOf(r.role);
                const actualIndex = actualRoles.indexOf(r.role);
                
                if (planIndex > -1) {
                    let curr_plan = parseFloat(r[`plan_${period.year}_${period.month}`]) || 0;
                    
                    if ( curr_plan ) {
                        plan += curr_plan;
                        planRoles.splice(planIndex, 1);
                    }
                }
                
                if (actualIndex > -1) {
                    let curr_actual = 0;
                    
                    if (period.is_past) {
                        curr_actual = parseFloat(r[`fact_${period.year}_${period.month}`]) || 0;
                    } else {
                        curr_actual = parseFloat(r[`forecast_${period.year}_${period.month}`]) || 0;
                    }
                    
                    if ( curr_actual ) {
                        actual += curr_actual;
                        actualRoles.splice(actualIndex, 1);
                    }
                }
            });
        }

        // Если явных данных нет — рекурсивно суммируем детей
        let childTasks = Object.values(aggregatedTasks).filter(t => t.parent_task === taskId);
        childTasks.forEach(child => {
            let childPlanRoles = [...planRoles];
            let childActualRoles = [...actualRoles];
            if ( !planRoles.length && !actualRoles.length ) return;
            let r = sumForTaskByPeriod(child.value, period, roleFilter, childPlanRoles, childActualRoles);
            plan += r.plan;
            actual += r.actual;
        });
        return { plan: plan, actual: actual};
    }

    // Для каждого периода суммируем по всем корням
    let plan_per_period = [];
    let actual_per_period = [];
    
    let all_roles = project_workload_assignment.work_efforts.get_project_roles(frm).filter(r => r );
    let rootTasks = Object.values(aggregatedTasks).filter(t => !t.parent_task);

    if ( rootTasks.length ) {
        periods.forEach(period => {
            let total_plan = 0;
            let total_actual = 0;
            rootTasks.forEach(root => {
                let planRoles = [...all_roles];
                let actualRoles = [...all_roles];
                let res = sumForTaskByPeriod(root.value, period, selectedRole || "", planRoles, actualRoles);
                total_plan += res.plan;
                total_actual += res.actual;
            });
            plan_per_period.push(total_plan);
            actual_per_period.push(total_actual);
        });
    }

    // Накопительные (cumulative) серии
    let cumulative_plan = [];
    let cumulative_actual = [];
    let cumP = 0, cumA = 0;
    for (let i = 0; i < plan_per_period.length; i++) {
        cumP += plan_per_period[i];
        cumA += actual_per_period[i];
        cumulative_plan.push(parseFloat(cumP.toFixed(2)));
        cumulative_actual.push(parseFloat(cumA.toFixed(2)));
    }

    return {
        labels: labels,
        plan: plan_per_period,
        actual_forecast: actual_per_period,
        cumulative_plan: cumulative_plan,
        cumulative_actual_forecast: cumulative_actual,
        plan_by_period: plan_per_period,
        periods: periods
    };
}

function get_limits( frm ) {
    let yellow = 1;
    let red;
    frm.doc.custom_limit_control_table.forEach(r => {
        if ( r.type == "Предупреждение" ) {
            yellow = r.limit / 100;    
        }
        if ( r.type == "Блокировка" ) {
            red = r.limit / 100;    
        }
    });
    return { yellow: yellow, red: red };
}

function get_chart_data(frm, selectedRole) {
    let dataObj = project_workload_assignment.work_efforts.build_chart_data(frm, selectedRole);
    
    let finalCumulativePlan = dataObj.cumulative_plan.length ? dataObj.cumulative_plan[dataObj.cumulative_plan.length - 1] : Math.max(...(dataObj.plan_by_period.concat([1])));
    let finalCumulativeActual = dataObj.cumulative_actual_forecast.length ? dataObj.cumulative_actual_forecast[dataObj.cumulative_actual_forecast.length - 1] : Math.max(...(dataObj.actual_forecast.concat([1])));
    if (!finalCumulativePlan) {
        finalCumulativePlan = Math.max(...(dataObj.plan_by_period.concat([1])));
    }
    let limits = get_limits( frm );
    let green_end = finalCumulativePlan * limits.yellow;
    let yellow_end = limits.red ? finalCumulativePlan * limits.red : Math.max( green_end * 1.3, green_end + 1, finalCumulativeActual );
    let red_end = limits.red ? Math.max(yellow_end * 1.3, yellow_end + 1, finalCumulativeActual) : null;

    let yRegions = [
        { label: "", start: 0, end: Math.round(green_end), options: { fill: "var(--charts-bg-ok)", stroke: "var(--charts-stroke)" } },
        { label: "", start: Math.round(green_end), end: Math.round(yellow_end), options: {  fill: "var(--charts-bg-warn)", stroke: "var(--charts-stroke)" } },
    ];
    
    if ( red_end ) {
        yRegions.push( { label: "", start: Math.round(yellow_end), end: Math.round(red_end), options: {  fill: "var(--charts-bg-block)", stroke: "var(--charts-stroke)" } } );
    }

    let datasets = [];
    let view =  __("Факт/Прогноз");
    if ( frm.view_options == __("Только прогноз") ) {
        view = __("Прогноз");
    } else if ( frm.view_options == __("Только факт") ) {
        view = __("Факт");
    }
    
    if ( !frm.hide_plan ) {
        datasets.push( { name: __("План"), values: dataObj.plan, chartType: 'bar' } );
        datasets.push( { name: __("Накоплен. план"), values: dataObj.cumulative_plan, chartType: 'line' } );
    }
    
    datasets.push( { name: view, values: dataObj.actual_forecast, chartType: 'bar' } );
    datasets.push( { name: __("Накоплен.") + " " + view.toLowerCase(), values: dataObj.cumulative_actual_forecast, chartType: 'line' } );
    
    return {
        labels: dataObj.labels,
        datasets: datasets,
        yRegions: yRegions,
        dataObj: dataObj,
    };
}

function get_we_chart_options( frm, data ) {
    return {
            title: __("План / Факт / Прогноз трудозатрат — по периодам и накопительно"),
            data: data,
            colors: frm.hide_plan ? ['#1b3bff','#919ff5'] : ['#8F00FF','#c482f7','#1b3bff','#919ff5'],
            type: 'axis-mixed',
            height: 360,
            valuesOverPoints: 0,
            animate: 1,
            disableEntryAnimation: 0,
            truncateLegends: 0,
            axisOptions: {
                xIsSeries: 0,
                xAxisMode: 'span',
            },
            lineOptions: {
                hideDots: 0,
                dotSize: 5,
                spline: 0,
                showDots: 1,
                hideDotBorder: 1,
            },
            barOptions: {
                spaceRatio: 0.8,
                stacked: 0,
            }
        };
}

/* рендер графика:
   - plan и fact отображаются столбиками (bar) по периодам
   - cumulative_plan и cumulative_fact отображаются линиями (line)
*/
/**
 * @param {WorkEffortsForm} frm
 * @param {boolean} [init]
 */
function render_work_efforts_chart(frm, init = true) {
    try {
        let selectedRole = frm._we_selected_role || "";
        let data = project_workload_assignment.work_efforts.get_chart_data(frm, selectedRole);
        
        if ( frm._we_chart_instance ) {
            if ( init ) {
                frm._we_chart_instance.destroy();
            } else {
                frm._we_chart_instance.update( data );
                return;
            }
        }
        
        let wrapper_field = frm.get_field("custom_work_efforts_chart");
        if (!wrapper_field) return;
        let $wrapper = wrapper_field.$wrapper;
        if (!$wrapper || $wrapper.length === 0) return;
        
        $wrapper.addClass("we-chart-wrapper");
        $wrapper.empty();
        let $chartContainer = $('<div class="we-chart-container"></div>').appendTo($wrapper);

        try {
             frm._we_chart_instance = new frappe.Chart($chartContainer[0], get_we_chart_options( frm, data ));
        } catch (err) {
            console.error("Chart creation failed:", err );
            $chartContainer.html(`<div style="padding:24px;color:#900;">${__("Ошибка при построении графика")}</div>`);
            return;
        }
        
        let controls = $('<div class="work-efforts-controls"></div>');
        controls.insertAfter(".we-chart-container .graph-svg-tip");
        add_role_filter_control(frm, controls);                     
    } catch (e) {
        console.error("render_work_efforts_chart error:", e);
    }
}

Object.assign(project_workload_assignment.work_efforts, {
    render_work_efforts_chart,
    build_chart_data,
    get_chart_data,
});
