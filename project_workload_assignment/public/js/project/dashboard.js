/**
 * Project Details dashboard (Dates / Work / Work Efforts / Revenue + donuts).
 * Moved from Client Script "Project Tasks Dashboard V2".
 * Disable that CS after deploy — otherwise the bar renders twice.
 */
// --- КОНФИГУРАЦИЯ ЦВЕТОВ ---
const STATUS_COLOR_MAP = {
    "open":         "var(--status-open)",
    "overdue":      "var(--status-overdue)",
    "templates":    "var(--status-templates)",
    "working":      "var(--status-working)",
    "completed":    "var(--status-completed)",
    "cancelled":    "var(--status-cancelled)",
    "pending review": "var(--status-pending-review)",
    "high":         "var(--priority-high)",
    "medium":       "var(--priority-medium)",
    "low":          "var(--priority-low)",
    "urgent":       "var(--priority-urgent)",
    "инцидент":     "var(--issue-incident)",
    "зни":          "var(--issue-cr",
    "зно":          "var(--issue-sr)",
    "не задано":    "var(--not-defined)",
};

// Палитра по умолчанию, если цвет не найден в карте
const DEFAULT_COLORS = ["var(--color-01)", "var(--color-02)", "var(--color-03)", "var(--color-04)", "var(--color-05)", 
        "var(--color-06)", "var(--color-07)", "var(--color-08)", "var(--color-09)", "var(--color-10)"];

frappe.ui.form.on('Project', {
    onload(frm) {
        frm.dashboard.chart_area.wrapper?.empty();
        frm.we_progress_chart = null;
        frm.revenue_percentage_chart = null;
        frm.we_progress = null;
    },
    refresh(frm) {
        // Инъекция CSS стилей
        inject_custom_dashboard_css();
        
        // Загрузка дашборда
        if(!frm.doc.__islocal) {
            load_and_render_project_dashboard(frm);
            
            frm.add_custom_button("𝌠 " + __("Task tree"), 
		    () => {
		        frappe.route_options = {
					project: frm.docname,
				};
		        frappe.set_route('Tree', 'Task', {"project": frm.docname} );
		    });
        }
    }
});

function render_work_efforts_percentage_chart( frm ) {
    if ( !frm.dashboard?.chart_area?.grid ) return;
    // Prefer lightweight API scalars; aggregatedTasks only as legacy fallback.
    let hasApi =
        frm.we_progress &&
        ( !frm._we_progress_project || frm._we_progress_project === frm.doc.name );
    if ( !hasApi && !frm.aggregatedTasks ) return;

    let we_data = get_work_efforts_data(frm);
    let $grid = frm.dashboard.chart_area.grid;
    let title = __("Work Efforts");
    let $group = get_chart_group( $grid, "dashboard-percents" );
    let $card = $group.find( ".linear-card" ).filter( function () {
        return $( this ).find( ".chart-title" ).first().text() === title;
    } );

    if ( $card.length ) {
        let width_percent = Math.min( 100, Math.max( 0, we_data.percent ) );
        $card.find( ".chart-percent" ).text( we_data.percent + "%" );
        $card.find( ".progress-bar-fill" ).css( "width", width_percent + "%" );
        $card.find( ".progress-bar-container" ).attr( "title", we_data.details );
        $card.find( ".custom-tooltip" ).html( we_data.details );
        let $tail = $card.find( ".progress-bar-tail" );
        if ( we_data.percent < 100 ) {
            if ( !$tail.length ) {
                $card.find( ".progress-bar-container" ).append(
                    '<div class="progress-bar-tail" style="left: ' + width_percent + '%;"></div>'
                );
            } else {
                $tail.css( "left", width_percent + "%" );
            }
        } else {
            $tail.remove();
        }
        frm.we_progress_chart = $card;
        return;
    }

    let width_percent = Math.min( 100, Math.max( 0, we_data.percent ) );
    let html = `
        <div class="chart-card linear-card">
            <div class="chart-header">
                <span class="chart-title">${title}</span>
                <span class="chart-percent">${we_data.percent}%</span>
            </div>
            <div class="progress-bar-container" title="${we_data.details}">
                <div class="progress-bar-bg"></div>
                <div class="progress-bar-fill" style="width: ${width_percent}%; background-color: var(--percent-line);"></div>
                ${ we_data.percent < 100 ? '<div class="progress-bar-tail" style="left: ' + width_percent + '%;"></div>' : '' }
            </div>
            <div class="custom-tooltip">${we_data.details}</div>
        </div>
    `;
    let $el = $( html );
    // Keep order: Dates / Work / Work Efforts / Revenue — insert before Revenue if present.
    let revenueTitle = __("Revenue");
    let $revenue = $group.find( ".linear-card" ).filter( function () {
        return $( this ).find( ".chart-title" ).first().text() === revenueTitle;
    } );
    if ( $revenue.length ) {
        $el.insertBefore( $revenue.first() );
    } else {
        $group.append( $el );
    }
    frm.we_progress_chart = $el;
}

globalThis.render_work_efforts_percentage_chart = render_work_efforts_percentage_chart;

function ensure_work_efforts_progress_bar( frm ) {
    if ( frm.we_progress ) {
        render_work_efforts_percentage_chart( frm );
        return;
    }
    const loadFn = () => project_workload_assignment?.work_efforts?.load_work_efforts_progress?.( frm );
    if ( typeof project_workload_assignment?.work_efforts?.load_work_efforts_progress === "function" ) {
        loadFn();
        return;
    }
    frappe.require( [ frappe.assets.bundled_asset( "work-efforts.bundle.js" ) ], loadFn );
}

globalThis.render_revenue_percentage_chart = ( frm ) => {
    if ( frm.aggregatedBudget && frm.dashboard.chart_area.grid && !frm.revenue_percentage_chart ) {
        let revenue_data = get_revenue_data(frm);
        frm.revenue_percentage_chart = render_linear_chart( frm.dashboard.chart_area.grid, __("Revenue"), revenue_data.percent, revenue_data.details );
    }
}

function load_and_render_project_dashboard(frm) {
    // Очистка и подготовка контейнера
    let wrapper = frm.dashboard.chart_area.wrapper;
    wrapper.empty();
    
    frm.we_progress_chart = null;
    frm.revenue_percentage_chart = null;
    // Keep frm.we_progress if app already fetched — re-render bar after grid rebuild.
    
    // Создаем основной грид контейнер
    let $grid = $('<div class="custom-dashboard-grid"></div>').appendTo(wrapper);
    frm.dashboard.chart_area.grid = $grid;

    // --- РЯД 1: Процентные полосы (Linear Charts) ---
    // 1. Сроки
    let time_data = compute_time_data(frm);
    render_linear_chart($grid, __("Dates"), time_data.percent, time_data.details );

    // 2. Работы
    let task_pct = Number(frm.doc.percent_complete) || 0;
    render_linear_chart($grid, __("Work"), task_pct, __(`Выполнено:`) + ` ${task_pct}%` );

    // 3. Трудозатраты (async API — ensure re-render after load)
    ensure_work_efforts_progress_bar( frm );
    
    // 4. Выручка
    render_revenue_percentage_chart( frm );

    // Отображаем область
    frm.dashboard.show();
    frm.dashboard.chart_area.show();

    // --- РЯД 2: Пончики (Donut Charts) ---
    // Данные загружаются асинхронно
    frappe.call({
        method: "get_project_metrics",
        args: { project: frm.doc.name },
        callback: function(r) {
            const data = r.message;
            if (!data) return;

            // 1. Задачи по статусам
            render_donut_chart($grid, __("Tasks by status"), data.tasks_by_status, (label) => {
                frappe.set_route('List', 'Task', { status: label, project: frm.doc.name });
            });

            // 2. Задачи по приоритетам
            render_donut_chart($grid, __("Tasks by priority"), data.tasks_by_priority, (label) => {
                frappe.set_route('List', 'Task', { priority: label, project: frm.doc.name });
            });

            // 3. Задачи по ответственным
            render_donut_chart($grid, __("Tasks by assignee"), data.tasks_by_assignee, (label, key) => {
                if ( !key || key == "" ) {
                    key = [ "is", "not set" ];
                } else {
                    key = [ "like", "%" + key + "%" ];
                }
                frappe.set_route('List', 'Task', { project: frm.doc.name, "_assign": key }); 
            });

            // 4. Запросы по типам
            render_donut_chart($grid, __("Issues by type"), data.issues_by_type, (label) => {
                if ( !label || label == __("Not set") ) {
                    label = [ "is", "not set" ];
                }
                frappe.set_route('List', 'Issue', { project: frm.doc.name, issue_type: label });
            });
        }
    });
}

// --- ФУНКЦИИ ОТРИСОВКИ (RENDERERS) ---

function get_chart_group($parent , groupClass ) {
    let group = $parent.find( "." + groupClass );
    if ( !group || !group.length ) {
        group = $( "<div class='" + groupClass + " dashboard-group'></div" ).appendTo( $parent );
    }
    return group;
}

function render_linear_chart($parent, title, percent, tooltipText, color) {
    let width_percent = Math.min(100, Math.max(0, percent)); // Clamp 0-100
    
    const html = `
        <div class="chart-card linear-card">
            <div class="chart-header">
                <span class="chart-title">${title}</span>
                <span class="chart-percent">${percent}%</span>
            </div>
            <div class="progress-bar-container" title="${tooltipText}">
                <div class="progress-bar-bg"></div>
                <div class="progress-bar-fill" style="width: ${width_percent}%; background-color: ${color ? color : "var(--percent-line)" };"></div>
                ${ percent < 100 ?'<div class="progress-bar-tail" style="left: ' + width_percent + '%;"></div>' : ''}
            </div>
            <div class="custom-tooltip">${tooltipText}</div>
        </div>
    `;
    return get_chart_group( $parent, "dashboard-percents" ).append(html);
}

function render_donut_chart($parent, title, data, onClickHandler) {
    if (!data || !data.labels || data.labels.length === 0) {
        return;
    }

    const total = data.counts.reduce((a, b) => a + b, 0);
    let segments = [];
    
    let accumulatedAngle = 0; 
    
    // Параметры SVG
    const size = 180;
    const strokeWidth = 35;
    const radius = (size - strokeWidth) / 2;
    const center = size / 2; // Центр круга

    data.labels.forEach((label, i) => {
        const value = data.counts[i];
        const key = data.keys ? data.keys[i] : null;
        if (value <= 0) return;
        
        // Расчет доли и углов
        const pct = value / total;
        const angle = pct * 360;
        
        const startAngle = accumulatedAngle;
        const endAngle = accumulatedAngle + angle;
        const pathData = describeArc(center, center, radius, startAngle, endAngle);
        
        let segColor = STATUS_COLOR_MAP[label.toLowerCase()] || DEFAULT_COLORS[i % DEFAULT_COLORS.length];

        segments.push({
            label: label,
            value: value,
            key: key,
            color: segColor,
            d: pathData, // Сохраняем путь
            percent: Math.round(pct * 100)
        });

        accumulatedAngle += angle;
    });

    let svgContent = segments.map((seg, i) => `
        <path class="donut-segment donut-segment-hidden" d="${seg.d}" 
            fill="none" stroke="${seg.color}" stroke-width="${strokeWidth}"
            data-label="${seg.label}" data-value="${seg.value}" data-percent="${seg.percent}">
        </path>
    `).join('');

    // Невидимые сектора для клика (hit areas)
    let hitAreas = segments.map((seg, i) => `
         <path class="donut-hit-area" d="${seg.d}" 
            fill="none" stroke="transparent" stroke-width="${strokeWidth + 10}"
            onclick="window.donutClick('${title}', '${seg.label}', '${seg.key}')">
            <title>${seg.label}: ${seg.value} (${seg.percent}%)</title>
        </path>
    `).join('');

    if(!window.donutClickRegistry) window.donutClickRegistry = {};
    window.donutClickRegistry[title] = onClickHandler;
    window.donutClick = (t, l, k) => { if(window.donutClickRegistry[t]) window.donutClickRegistry[t](l, k); };

    const html = `
        <div class="chart-card donut-card">
            <div class="chart-title">${title}</div>
            <div class="donut-wrapper">
                <svg width="100%" height="100%" viewBox="0 0 ${size} ${size}" class="donut-svg">
                    ${svgContent}
                    ${hitAreas}
                </svg>
                <div class="donut-center-info">
                    <span class="donut-val"></span>
                    <span class="donut-lbl"></span>
                </div>
            </div>
        </div>
    `;

    const $chartNode = $(html).appendTo( get_chart_group( $parent, "dashboard-donuts" ) );
    
    setTimeout(() => requestAnimationFrame( () => {
        $chartNode.find('.donut-segment').each(function(index, el) {    
            // 1. Вычисляем точную длину пути в пикселях
            const len = el.getTotalLength();
            
            // 2. Устанавливаем stroke-dasharray так, чтобы штрих был равен длине пути
            // [длина_штриха, длина_пробела]
            el.style.strokeDasharray = len + ' ' + len;
            
            // 3. Смещаем штрих полностью назад, чтобы он был невидим (offset = length)
            el.style.strokeDashoffset = len;
            
            // 4. Делаем элемент видимым (убираем класс helper)
            $(el).removeClass('donut-segment-hidden');
            
            // 5. Форсируем пересчет макета (Reflow), чтобы браузер понял начальное состояние
            el.getBoundingClientRect(); 
            
            // 6. Задаем переход (transition)
            // ease-out делает движение более естественным (быстро в начале, медленно в конце)
            // Задержка (index * 0.1s) создает эффект последовательного появления сегментов
            el.style.transition = `stroke-dashoffset 1s ease-out, stroke-width 0.3s ease, filter 0.3s ease`;
            
            // 7. Сбрасываем offset в 0, что запускает анимацию заполнения
            el.style.strokeDashoffset = '0';
        });
    }), 50);
    
    // Логика hover
    $chartNode.find('.donut-hit-area').on('mouseenter', function() {
        const $this = $(this);
        const idx = $this.index() - segments.length; 
        const $visSegment = $chartNode.find('.donut-segment').eq(idx);
        
        $visSegment.addClass('hovered');
        const titleText = $this.find('title').text().split(':'); 
        $chartNode.find('.donut-lbl').text(titleText[0]); 
        $chartNode.find('.donut-val').text(titleText[1].trim()); 
    }).on('mouseleave', function() {
        $chartNode.find('.donut-segment').removeClass('hovered');
        $chartNode.find('.donut-lbl').text('');
        $chartNode.find('.donut-val').text('');
    });
}

function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
    // Переводим угол в радианы и смещаем на -90 градусов, 
    // чтобы 0 начинался с 12 часов (сверху), а не с 3 часов (справа)
    var angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;

    return {
        x: centerX + (radius * Math.cos(angleInRadians)),
        y: centerY + (radius * Math.sin(angleInRadians))
    };
}

function describeArc(x, y, radius, startAngle, endAngle) {
    // Если круг полный (360 градусов), svg path может вести себя странно,
    // поэтому делаем чуть меньше 360, чтобы дуга замкнулась визуально, но математика сработала
    if (endAngle - startAngle >= 360) {
        endAngle = 359.999;
    }

    var start = polarToCartesian(x, y, radius, endAngle);
    var end = polarToCartesian(x, y, radius, startAngle);

    var largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

    var d = [
        "M", start.x, start.y, 
        "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
    ].join(" ");

    return d;       
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДАННЫХ ---

function compute_time_data(frm) {
    const start = frm.doc.expected_start_date;
    const end = frm.doc.expected_end_date;
    if (!start || !end) return { percent: 0, details: __("Dates are not set") };

    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    const today = new Date().getTime();

    const totalDays = (e - s) / (1000 * 60 * 60 * 24);
    const elapsedDays = (today - s) / (1000 * 60 * 60 * 24);
    
    let pct = 0;
    if (totalDays > 0) pct = (elapsedDays / totalDays) * 100;
    if (today < s) pct = 0;
    if (today > e) pct = 100;
    
    pct = Math.round(pct * 100) / 100;
    return { 
        percent: pct, 
        details: __("Plan") + ": " + frappe.datetime.str_to_user(end) + "<br>" + __("Elapsed") + ": " + Math.max(0, Math.floor(elapsedDays)) + " " + __("d.")
    };
}

function get_work_efforts_data(frm) {
    let plan = 0, fact = 0, pct = null;

    if ( frm.we_progress ) {
        plan = Number( frm.we_progress.plan_hours ) || 0;
        fact = Number( frm.we_progress.fact_hours ) || 0;
        if ( frm.we_progress.percent != null && frm.we_progress.percent !== "" ) {
            pct = Number( frm.we_progress.percent );
        }
    } else {
        try {
            if ( typeof _get_plant_fact_efforts === "function" ) {
                let vals = _get_plant_fact_efforts( frm );
                if ( vals ) {
                    plan = vals.plan; fact = vals.fact;
                }
            }
        } catch ( e ) {}
    }

    if ( pct == null || Number.isNaN( pct ) ) {
        pct = 0;
        if ( plan > 0 ) pct = ( fact / plan ) * 100;
        else if ( fact > 0 ) pct = 100;
    }

    return {
        percent: Math.round( pct * 100 ) / 100,
        details: __("Plan") + ": " + plan + " " + __("h.") + "<br>" + __("Actual") + ": " + fact + __("h.")
    };
}

function get_revenue_data(frm) {
    let plan = 0, fact = 0;
    try {
        if(typeof _get_revenue_values === 'function') {
            let vals = _get_revenue_values(frm);
            plan = vals.planned; fact = vals.actual;
        }
    } catch(e) {}

    let pct = 0;
    if (plan > 0) pct = (fact / plan) * 100;
    
    return { 
        percent: Math.round(pct*100)/100, 
        details: __("Plan") + ": " + format_currency(plan) + "<br>" + __("Actual") + ": " + format_currency(fact) 
    };
}

// --- CSS STYLES ---
function inject_custom_dashboard_css() {
    if ($('#custom-dashboard-styles').length) return;
    
    const css = `
        :root {
            --percent-line: var(--bg-dark-blue);
            --status-open: #c9e7fc8c;
            --status-overdue: #e036368c;
            --status-templates: #9999998c;
            --status-working: #70b6f08c;
            --status-completed: #30a66d8c;
            --status-cancelled: #7c7c7c8c;
            --status-pending-review: #007be08c;
            --priority-high: #fd7e14a8;
            --priority-medium: #ffc1078c;
            --priority-low: #c0d0ea;
            --priority-urgent: #ff000078;
            --issue-incident: #7808b18c;
            --issue-cr: #0da6908c;
            --issue-sr: #1e87c58c;
            --not-defined: #a4abb675;
            --color-01: #ffe3ff;
            --color-02: #ffc6ff;
            --color-03: #bdb2ff;
            --color-04: #a0c4ff;
            --color-05: #9bf6ff;
            --color-06: #caffbf;
            --color-07: #fdffb6;
            --color-08: #ffd6a5;
            --color-09: #ffadad;
            --color-10: #f48b6e;
        }
        [data-theme="dark"] {
            --percent-line: var(--bg-dark-blue);
            --status-open: #c9e7fc;
            --status-overdue: #d24343;
            --status-templates: #999999;
            --status-working: #70b6f0;
            --status-completed: #30a66d;
            --status-cancelled: #7c7c7c;
            --status-pending-review: #007be0;
            --priority-high: #fd7e14;
            --priority-medium: #ffc107;
            --priority-low: #92aed9;
            --priority-urgent: #ff0000d6;
            --issue-incident: #7808b1;
            --issue-cr: #0da690;
            --issue-sr: #1e87c5;
            --not-defined: #A4ABB6;
            --color-01: #b5a6c9;
            --color-02: #6a4c93;
            --color-03: #4267ac;
            --color-04: #1982c4;
            --color-05: #36949d;
            --color-06: #52a675;
            --color-07: #8ac926;
            --color-08: #ffca3a;
            --color-09: #ff924c;
            --color-10: #ff595e;
        }
        .custom-dashboard-grid {
            width: 100%;
        }
        .dashboard-group {
            display: grid;
            gap: 20px;
            padding: 15px 0;
            grid-template-columns: repeat(2, 1fr);
            grid-auto-columns: 1fr;
            grid-auto-flow: column;
        }
        .chart-card {
            /* background: #2c333a; Dark mode simulation if needed, or transparent */
            padding: 10px;
            border-radius: 8px;
            position: relative;
        }
        .chart-header {
            text-align: center;
        }
        /* --- Linear Charts --- */
        .chart-title {
            font-size: 12px;
            color: #8d99a6; /* Muted text color */
            display: block;
        }
        .chart-percent {
            margin-bottom: 5px;
            font-size: x-large;
            display: block;
        }
        .progress-bar-container {
            height: 12px;
            position: relative;
            width: 100%;
        }
        .progress-bar-bg {
            width: 100%;
            height: 100%;
            background-color: var(--bg-dark-gray);
            border-radius: 6px;
            position: absolute;
        }
        .progress-bar-fill {
            height: 100%;
            border-radius: 6px;
            position: absolute;
            left: 0; top: 0;
            transition: width 1s ease-out;
            animation: slideIn 1s ease-out;
        }
        .progress-bar-tail {
            position: absolute;
            height: 100%;
            width: 4px;
            background-color: rgba(255,255,255,0.3);
            margin-left: -2px;
            top: 0;
            z-index: 2;
        }
        /* Tooltip */
        .custom-tooltip {
            display: none;
            position: absolute;
            background: var(--bg-color);
            color: var(--text-color);
            padding: 5px 8px;
            font-size: 11px;
            border-radius: 4px;
            top: -35px;
            left: 0;
            white-space: nowrap;
            z-index: 10;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        }
        .linear-card:hover .custom-tooltip {
            display: block;
        }

        /* --- Donut Charts --- */
        .donut-card {
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .donut-wrapper {
            width: 180px;
            height: 180px;
            position: relative;
            margin: 15px;
        }
        .donut-svg {
            overflow: visible;
        }
        .donut-segment {
            /*transition: all 0.3s ease;
            transform-origin: center;*/
            transition: stroke-width 0.3s ease, filter 0.3s ease; 
            transform-origin: center;
            will-change: stroke-dashoffset;
        }
        .donut-segment-hidden {
            visibility: hidden; 
        }
        .donut-segment.hovered {
            filter: brightness(0.8);
            cursor: pointer;
            transform: scale(1.1);
        }
        .donut-hit-area {
            cursor: pointer;
        }
        .donut-center-info {
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            pointer-events: none;
        }
        .donut-val {
            display: block;
            font-size: 18px;
            font-weight: bold;
        }
        .donut-lbl {
            display: block;
            font-size: 10px;
        }
        .no-data {
            text-align: center;
            color: #555;
            padding: 40px 0;
        }

        @keyframes slideIn {
            from { width: 0; }
        }
        
        /* Responsive fallback */
        @media (max-width: 1200px) {
            .dashboard-group {
                gap: 10px;
            }
            .donut-wrapper {
                width: 150px;
                height: 150px;
            }
        @media (max-width: 768px) {
            .dashboard-group {
                gap: initial;
                padding: 10px 0;
                grid-template-columns: 1fr, 1fr;
            }
            .dashboard-donuts {
                display: none;
            }
        }
    `;
    $('<style id="custom-dashboard-styles">' + css + '</style>').appendTo('head');
}

function _get_plant_fact_efforts( frm ) {
    if ( frm.aggregatedTasks ) {
        let aggregatedTasks = frm.aggregatedTasks || {};
        let periods = get_display_periods(frm, frm.currentPeriodType || "month");
    
        let total_plan = 0;
        let total_actual = 0;
        
        // Вспомогательная рекурсивная функция: возвращает { plan, actual } для заданной задачи и роли за период
        function sumForTaskByPeriod(taskId, period, planRoles, actualRoles) {
            let task = aggregatedTasks[taskId];
            if (!task) return { plan: 0, actual: 0 };
    
            // если роль задана — ищем только её запись; иначе — суммируем по всем ролям
            let plan = 0, actual = 0;
            let e = (task.role_data || []);
            
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
                        let curr_actual = parseFloat(r[`fact_${period.year}_${period.month}`]) || 0;

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
                let r = sumForTaskByPeriod(child.value, period, childPlanRoles, childActualRoles);
                plan += r.plan;
                actual += r.actual;
            });
            return { plan: plan, actual: actual};
        }
    
        // Для каждого периода суммируем по всем корням
        let plan_per_period = [];
        let actual_per_period = [];
        
        let all_roles = get_project_roles(frm).filter(r => r );
        let rootTasks = Object.values(aggregatedTasks).filter(t => !t.parent_task);
    
        if ( rootTasks.length ) {
            periods.forEach(period => {
                let total_period_plan = 0;
                let total_period_actual = 0;
                rootTasks.forEach(root => {
                    let planRoles = [...all_roles];
                    let actualRoles = [...all_roles];
                    //if ( !planRoles.length && !actualRoles.length ) return;
                    let res = sumForTaskByPeriod(root.value, period, planRoles, actualRoles);
                    total_period_plan += res.plan;
                    total_period_actual += res.actual;
                });
                total_plan += total_period_plan;
                total_actual += total_period_actual;
            });
        }
        return { plan: total_plan, fact: total_actual};
    }
    return null;
}

function _get_revenue_values( frm ) {
    if ( frm.aggregatedBudget ) {
        let periods = get_budget_display_periods(frm, "month");
        let plan_income_sum = 0;
        let actual_income_sum = 0;
    
        periods.forEach(function(period) {
            let plan_income = 0;
            let actual_income = 0;
        
            for ( const child of Object.values(frm.aggregatedBudget) ) {
                let bucket = (child.dimension_data || [])[0];//.find(r => r.role === role);
                
                if ( child.type == "Income" ) {
                    let plan = parseFloat(bucket[`plan_${period.year}_${period.month}`]) || 0;
                    let actual = (parseFloat(bucket[`fact_${period.year}_${period.month}`]) || 0);
                
                    if ( !actual_income && actual ) {
                        actual_income = actual;
                    }
                    if ( !plan_income && plan ) {
                        plan_income = plan;
                    }
                }
                
                if ( actual_income  && plan_income ) break;
            }
            
            plan_income_sum += plan_income;
            actual_income_sum += actual_income;
        });
        
        return { planned: plan_income_sum, actual: actual_income_sum};
    }
    return null;
}
