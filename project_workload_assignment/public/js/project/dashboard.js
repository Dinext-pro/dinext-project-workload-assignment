/**
 * Project Details dashboard (Dates / Work / Work Efforts / Revenue + donuts).
 * Bars: get_work_efforts_progress + get_revenue_progress — no other tabs.
 * Client Script "Project Tasks Dashboard V2" must stay disabled.
 */

const PROJECT_DASHBOARD_CSS =
	"/assets/project_workload_assignment/css/project-dashboard.css";
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
    refresh(frm) {
        reclaim_dashboard_globals();
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

function ensure_dashboard_css() {
	return new Promise((resolve) => {
		if (document.querySelector('link[href*="project-dashboard.css"]')) {
			resolve();
			return;
		}
		frappe.require([PROJECT_DASHBOARD_CSS], resolve);
	});
}

const PWA_BAR_DATES = "dates";
const PWA_BAR_WORK = "work";
const PWA_BAR_WE = "work-efforts";
const PWA_BAR_REV = "revenue";

function reclaim_dashboard_globals() {
    globalThis.render_work_efforts_percentage_chart = render_work_efforts_percentage_chart;
    globalThis.render_revenue_percentage_chart = render_revenue_percentage_chart;
    globalThis.load_and_render_project_dashboard = load_and_render_project_dashboard;
}

function get_chart_host(frm) {
    const area = frm.dashboard?.chart_area;
    if (!area) return null;
    const $host = area.wrapper?.length ? area.wrapper : area.body;
    if (!$host?.length) return null;
    const node = $host.get(0);
    if (!node || !document.body.contains(node)) return null;
    return $host;
}

function find_pwa_bar($grid, key) {
    return $grid.find('.linear-card[data-pwa-bar="' + key + '"]');
}

function get_live_dashboard_grid(frm) {
    let $grid = frm.dashboard?.chart_area?.grid;
    if ($grid?.length) {
        const node = $grid.get(0);
        if (node && document.body.contains(node)) return $grid;
    }
    const $host = get_chart_host(frm);
    if (!$host) return null;
    $grid = $host.find(".custom-dashboard-grid").first();
    if (!$grid.length) {
        $grid = $('<div class="custom-dashboard-grid"></div>').appendTo($host);
    }
    frm.dashboard.chart_area.grid = $grid;
    return $grid;
}

function paint_linear_percent_card(frm, title, data, key) {
    const $grid = get_live_dashboard_grid(frm);
    if (!$grid) return null;

    const $group = get_chart_group($grid, "dashboard-percents");
    let $card = key ? find_pwa_bar($grid, key) : $();
    if (!$card.length) {
        $card = $group.find(".linear-card").filter(function () {
            return $(this).find(".chart-title").first().text() === title;
        });
    }
    const width_percent = Math.min(100, Math.max(0, data.percent));

    if ($card.length) {
        if (key) $card.attr("data-pwa-bar", key);
        $card.find(".chart-percent").text(data.percent + "%");
        $card.find(".progress-bar-fill").css("width", width_percent + "%");
        $card.find(".progress-bar-container").attr("title", data.details);
        $card.find(".custom-tooltip").html(data.details);
        let $tail = $card.find(".progress-bar-tail");
        if (data.percent < 100) {
            if (!$tail.length) {
                $card.find(".progress-bar-container").append(
                    '<div class="progress-bar-tail" style="left: ' + width_percent + '%;"></div>'
                );
            } else {
                $tail.css("left", width_percent + "%");
            }
        } else {
            $tail.remove();
        }
        return $card;
    }

    const html = `
        <div class="chart-card linear-card"${key ? ' data-pwa-bar="' + key + '"' : ""}>
            <div class="chart-header">
                <span class="chart-title">${title}</span>
                <span class="chart-percent">${data.percent}%</span>
            </div>
            <div class="progress-bar-container" title="${data.details}">
                <div class="progress-bar-bg"></div>
                <div class="progress-bar-fill" style="width: ${width_percent}%; background-color: var(--percent-line);"></div>
                ${ data.percent < 100 ? '<div class="progress-bar-tail" style="left: ' + width_percent + '%;"></div>' : '' }
            </div>
            <div class="custom-tooltip">${data.details}</div>
        </div>
    `;
    return $(html).appendTo($group);
}

function restore_percent_bars(frm) {
    if (!frm?.doc?.name || frm.doc.__islocal) return;
    const $grid = get_live_dashboard_grid(frm);
    if (!$grid) return;
    if (!$grid.find(".linear-card").length) {
        const time_data = compute_time_data(frm);
        render_linear_chart($grid, __("Dates"), time_data.percent, time_data.details, null, PWA_BAR_DATES);
        const task_pct = Number(frm.doc.percent_complete) || 0;
        render_linear_chart($grid, __("Work"), task_pct, __("Completed:") + ` ${task_pct}%`, null, PWA_BAR_WORK);
    }
    render_work_efforts_percentage_chart(frm);
    render_revenue_percentage_chart(frm);
    frm.dashboard?.show?.();
    frm.dashboard?.chart_area?.show?.();
}

function bind_dashboard_persist(frm) {
    const $host = get_chart_host(frm);
    if (!$host) return;
    const node = $host.get(0);
    if (frm._pwa_dash_obs_node === node) return;
    if (frm._pwa_dash_obs) {
        frm._pwa_dash_obs.disconnect();
        frm._pwa_dash_obs = null;
    }
    const obs = new MutationObserver(() => {
        if (frm._pwa_dash_restoring) return;
        const $grid = get_live_dashboard_grid(frm);
        if (!$grid) return;
        if (find_pwa_bar($grid, PWA_BAR_WE).length && find_pwa_bar($grid, PWA_BAR_REV).length) {
            return;
        }
        frm._pwa_dash_restoring = 1;
        requestAnimationFrame(() => {
            reclaim_dashboard_globals();
            restore_percent_bars(frm);
            frm._pwa_dash_restoring = 0;
        });
    });
    obs.observe(node, { childList: true, subtree: true });
    frm._pwa_dash_obs = obs;
    frm._pwa_dash_obs_node = node;
}

function render_work_efforts_percentage_chart(frm) {
    frm.we_progress_chart = paint_linear_percent_card(
        frm, __("Work Efforts"), get_work_efforts_data(frm), PWA_BAR_WE
    );
}

globalThis.render_work_efforts_percentage_chart = render_work_efforts_percentage_chart;

function render_revenue_percentage_chart(frm) {
    frm.revenue_percentage_chart = paint_linear_percent_card(
        frm, __("Revenue"), get_revenue_data(frm), PWA_BAR_REV
    );
}

globalThis.render_revenue_percentage_chart = render_revenue_percentage_chart;

function fetch_work_efforts_progress(frm) {
    if (!frm?.doc?.name || frm.doc.__islocal) return;

    const project = frm.doc.name;
    if (frm._we_progress_inflight === project) return;
    frm._we_progress_inflight = project;

    frappe.xcall(
        "project_workload_assignment.api.get_work_efforts_progress",
        { project }
    ).then((data) => {
        if (frm._we_progress_inflight === project) {
            frm._we_progress_inflight = null;
        }
        if (!data || frm.doc?.name !== project) return;
        frm.we_progress = data;
        frm._we_progress_project = project;
        reclaim_dashboard_globals();
        render_work_efforts_percentage_chart(frm);
    }).catch((e) => {
        if (frm._we_progress_inflight === project) {
            frm._we_progress_inflight = null;
        }
        console.error("[ProjectDashboard] get_work_efforts_progress failed", e);
    });
}

function fetch_revenue_progress(frm) {
    if (!frm?.doc?.name || frm.doc.__islocal) return;

    const project = frm.doc.name;
    if (frm._rev_progress_inflight === project) return;
    frm._rev_progress_inflight = project;

    frappe.xcall(
        "dinext_projects_pl.api.get_revenue_progress",
        { project }
    ).then((data) => {
        if (frm._rev_progress_inflight === project) {
            frm._rev_progress_inflight = null;
        }
        if (!data || frm.doc?.name !== project) return;
        frm.revenue_progress = data;
        frm._rev_progress_project = project;
        reclaim_dashboard_globals();
        render_revenue_percentage_chart(frm);
    }).catch((e) => {
        if (frm._rev_progress_inflight === project) {
            frm._rev_progress_inflight = null;
        }
        console.error("[ProjectDashboard] get_revenue_progress failed", e);
    });
}

function render_project_dashboard_now(frm) {
    const project = frm.doc.name;
    if (frm._we_progress_project && frm._we_progress_project !== project) {
        frm.we_progress = null;
        frm._we_progress_inflight = null;
    }
    if (frm._rev_progress_project && frm._rev_progress_project !== project) {
        frm.revenue_progress = null;
        frm._rev_progress_inflight = null;
    }

    frm._pwa_dash_restoring = 1;
    const wrapper = frm.dashboard.chart_area.wrapper;
    wrapper.empty();
    frm.we_progress_chart = null;
    frm.revenue_percentage_chart = null;

    const $grid = $('<div class="custom-dashboard-grid"></div>').appendTo(wrapper);
    frm.dashboard.chart_area.grid = $grid;
    frm._pwa_dash_gen = (frm._pwa_dash_gen || 0) + 1;
    const gen = frm._pwa_dash_gen;

    const time_data = compute_time_data(frm);
    render_linear_chart($grid, __("Dates"), time_data.percent, time_data.details, null, PWA_BAR_DATES);

    const task_pct = Number(frm.doc.percent_complete) || 0;
    render_linear_chart($grid, __("Work"), task_pct, __("Completed:") + ` ${task_pct}%`, null, PWA_BAR_WORK);

    render_work_efforts_percentage_chart(frm);
    fetch_work_efforts_progress(frm);
    render_revenue_percentage_chart(frm);
    fetch_revenue_progress(frm);

    frm.dashboard.show();
    frm.dashboard.chart_area.show();
    bind_dashboard_persist(frm);
    reclaim_dashboard_globals();
    frm._pwa_dash_restoring = 0;
    setTimeout(() => {
        reclaim_dashboard_globals();
        restore_percent_bars(frm);
    }, 0);
    setTimeout(() => {
        reclaim_dashboard_globals();
        restore_percent_bars(frm);
    }, 150);

    frappe.call({
        method: "get_project_metrics",
        args: { project },
        callback: function(r) {
            if (frm._pwa_dash_gen !== gen || frm.doc?.name !== project) return;
            const $live = get_live_dashboard_grid(frm);
            if (!$live) return;
            const data = r.message;
            if (!data) return;

            render_donut_chart($live, __("Tasks by status"), data.tasks_by_status, (label) => {
                frappe.set_route('List', 'Task', { status: label, project: frm.doc.name });
            });

            render_donut_chart($live, __("Tasks by priority"), data.tasks_by_priority, (label) => {
                frappe.set_route('List', 'Task', { priority: label, project: frm.doc.name });
            });

            render_donut_chart($live, __("Tasks by assignee"), data.tasks_by_assignee, (label, key) => {
                if ( !key || key == "" ) {
                    key = [ "is", "not set" ];
                } else {
                    key = [ "like", "%" + key + "%" ];
                }
                frappe.set_route('List', 'Task', { project: frm.doc.name, "_assign": key });
            });

            render_donut_chart($live, __("Issues by type"), data.issues_by_type, (label) => {
                if ( !label || label == __("Not set") ) {
                    label = [ "is", "not set" ];
                }
                frappe.set_route('List', 'Issue', { project: frm.doc.name, issue_type: label });
            });
        }
    });
}

function load_and_render_project_dashboard(frm) {
    if (frm._pwa_dash_raf) return;
    frm._pwa_dash_raf = 1;
    ensure_dashboard_css()
        .catch(() => {})
        .then(() => {
            requestAnimationFrame(() => {
                frm._pwa_dash_raf = 0;
                render_project_dashboard_now(frm);
            });
        });
}

globalThis.load_and_render_project_dashboard = load_and_render_project_dashboard;

// --- ФУНКЦИИ ОТРИСОВКИ (RENDERERS) ---

function get_chart_group($parent , groupClass ) {
    let group = $parent.find( "." + groupClass );
    if ( !group || !group.length ) {
        group = $( "<div class='" + groupClass + " dashboard-group'></div>" ).appendTo( $parent );
    }
    return group;
}

function render_linear_chart($parent, title, percent, tooltipText, color, key) {
    let width_percent = Math.min(100, Math.max(0, percent)); // Clamp 0-100
    
    const html = `
        <div class="chart-card linear-card"${key ? ' data-pwa-bar="' + key + '"' : ""}>
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
    let plan = 0, fact = 0, pct = 0;
    const same =
        frm.we_progress &&
        (!frm._we_progress_project || frm._we_progress_project === frm.doc.name);
    if (same) {
        plan = Number(frm.we_progress.plan_hours) || 0;
        fact = Number(frm.we_progress.fact_hours) || 0;
        if (frm.we_progress.percent != null && frm.we_progress.percent !== "") {
            pct = Number(frm.we_progress.percent);
        } else if (plan > 0) {
            pct = (fact / plan) * 100;
        } else if (fact > 0) {
            pct = 100;
        }
    }
    if (Number.isNaN(pct)) pct = 0;
    return {
        percent: Math.round(pct * 100) / 100,
        details: __("Plan") + ": " + plan + " " + __("h.") + "<br>" + __("Fact") + ": " + fact + __("h.")
    };
}

function get_revenue_data(frm) {
    let plan = 0, fact = 0, pct = 0;
    const same =
        frm.revenue_progress &&
        (!frm._rev_progress_project || frm._rev_progress_project === frm.doc.name);
    if (same) {
        plan = Number(frm.revenue_progress.plan) || 0;
        fact = Number(frm.revenue_progress.fact) || 0;
        if (frm.revenue_progress.percent != null && frm.revenue_progress.percent !== "") {
            pct = Number(frm.revenue_progress.percent);
        } else if (plan > 0) {
            pct = (fact / plan) * 100;
        } else if (fact > 0) {
            pct = 100;
        }
    }
    if (Number.isNaN(pct)) pct = 0;
    return {
        percent: Math.round(pct * 100) / 100,
        details: __("Plan") + ": " + format_currency(plan) + "<br>" + __("Fact") + ": " + format_currency(fact)
    };
}
