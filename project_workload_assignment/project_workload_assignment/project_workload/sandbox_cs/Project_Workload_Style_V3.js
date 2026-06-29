// === Frappe Script Metadata ===
// Managed By: pull_iss_2026_00865_scripts_demodev.py
// Kind: Client Script
// Script Name: Project_Workload_Style_V3
// Reference DocType: Project
// View: Form
// Enabled: 1
// Fixture Modified: 2026-05-12 18:17:41.468510
// Module: Project Workload Assignment
// Content SHA256: de721d1866b9e58fed2bb79cfa4e1d7ae9d81d7f8a3c73835ca64b824aadeb23
// === /Frappe Script Metadata ===

//ВАРИАНТ С ВЛОЖЕННЫМИ ЗАДАЧАМИ (БЕЗ ГАНТА)
/* Project_Workload_Style.js - Оптимизированные стили для трехуровневой структуры */

function applyProjectWorkloadStyle() {
    const styles = `
        /* ========== ОБЩИЕ СТИЛИ ========== */
        body[data-route="Form/Project"] [data-fieldname="custom_workload"],
        body[data-route="Form/Project"] [data-fieldname="custom_workload"] .frappe-control,
        body[data-route="Form/Project"] [data-fieldname="custom_workload"] .control-input-wrapper,
        body[data-route="Form/Project"] [data-fieldname="custom_workload"] .control-input,
        body[data-route="Form/Project"] [data-fieldname="custom_workload"] .form-group {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
        }

        body[data-route="Form/Project"] [data-fieldname="custom_workload"] .control-label {
            display: none !important;
        }

        body[data-route="Form/Project"] .tab-pane .form-section .section-body {
            padding-left: 0 !important;
            padding-right: 0 !important;
        }

        body[data-route="Form/Project"] #project-custom_загрузка .form-section.card-section,
        body[data-route="Form/Project"] .tab-pane[data-fieldname="custom_загрузка"] .form-section.card-section {
            padding: 0 !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            --bs-gutter-x: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
        }

        body[data-route="Form/Project"] #project-custom_загрузка .section-body,
        body[data-route="Form/Project"] .tab-pane[data-fieldname="custom_загрузка"] .section-body {
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            --bs-gutter-x: 0 !important;
        }

        body[data-route="Form/Project"] #project-custom_загрузка .form-column,
        body[data-route="Form/Project"] #project-custom_загрузка [class*="col-sm-"],
        body[data-route="Form/Project"] .tab-pane[data-fieldname="custom_загрузка"] .form-column,
        body[data-route="Form/Project"] .tab-pane[data-fieldname="custom_загрузка"] [class*="col-sm-"] {
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            flex: 0 0 100% !important;
        }

        body[data-route="Form/Project"] #project-custom_загрузка .frappe-control.input-max-width,
        body[data-route="Form/Project"] .frappe-control.project_workload_container,
        body[data-route="Form/Project"] .project_workload_container.frappe-control {
            max-width: 100% !important;
            width: 100% !important;
            padding-right: 0 !important;
        }

        body[data-route="Form/Project"] .form-section[data-fieldname="custom_workload"],
        body[data-route="Form/Project"] .form-section.card-section[data-fieldname="custom_workload"] {
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
        }

        body[data-route="Form/Project"] .form-section[data-fieldname="custom_workload"] .section-head,
        body[data-route="Form/Project"] .form-section[data-fieldname="custom_workload"] .section-body {
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
        }

        body[data-route="Form/Project"] .tab-pane[data-fieldname="custom_загрузка"] .form-section .section-body,
        body[data-route="Form/Project"] .tab-pane.active .form-section .section-body {
            padding-top: 0 !important;
            padding-bottom: 0 !important;
        }

        .project_workload_container {
            max-width: 100% !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            display: flex;
            flex-direction: column;
            gap: 0 !important;
            height: calc(100vh - 200px) !important;
            min-height: 600px;
            box-sizing: border-box !important;
        }
        
        .project_workload_container .project-workload-table {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 400px;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
        }

        .project_workload_container .project-workload-table .project-workload-ag-grid {
            flex: 1 1 auto;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: 400px;
            max-height: max(calc(100vh - 400px), 350px);
            margin: 0 !important;
            padding: 0 !important;
            position: relative;
        }

        .project_workload_container .project-workload-table .project-workload-ag-grid .ag-root-wrapper {
            width: 100%;
            height: 100%;
            border: none !important;
            border-radius: 0 !important;
        }

        .project_workload_container .project-workload-table .project-workload-ag-grid .ag-body-viewport,
        .project_workload_container .project-workload-table .project-workload-ag-grid .ag-center-cols-viewport {
            min-height: 320px;
        }

        .project_workload_container .project-workload-table .project-workload-ag-grid .ag-cell {
            cursor: pointer;
        }

        .project_workload_container .project-workload-table .project-workload-ag-grid .projects-workload-ag-grid-participant {
            padding: 0 4px !important;
        }

        .project_workload_container .project-workload-table .project-workload-ag-grid .projects-workload-ag-grid-participant-content {
            min-width: 0;
            flex: 1;
            height: 100%;
        }

        .project_workload_container .project-workload-table .project-workload-ag-grid .projects-workload-ag-grid-toggle:empty {
            visibility: hidden;
        }

        .project_workload_container .project-workload-table .project-workload-ag-grid .ag-pinned-left-cols-container .ag-cell {
            background: var(--bg-color);
        }
        
        .project_workload_container .project-workload-table .datatable {
            margin-top: 0 !important;
            flex: 1;
            display: flex;
            flex-direction: column;
        }
        
        .project_workload_container .project-workload-table .datatable .dt-scrollable {
            border: 1px solid var(--border-color) !important;
            flex: 1;
            overflow-y: auto;
            max-height: max(calc(100vh - 400px),350px);
            min-height: auto !important;
        }
        
        /* ========== УЛУЧШЕННАЯ КОМПАКТНАЯ СТРОКА ФИЛЬТРОВ ========== */
        .project_workload_container .projects-workload-controls.unified-filters-row,
        .project_workload_container .unified-filters-row {
            display: flex;
            align-items: center;
            align-content: center;
            justify-content: space-between;
            width: 100%;
            margin: 0 !important;
            margin-bottom: 6px !important;
            flex-wrap: wrap;
            row-gap: 8px !important;
            column-gap: 16px !important;
            padding: 8px 8px 0 !important;
            background: transparent !important;
            border: none !important;
            border-radius: 0 !important;
            overflow: visible;
        }

        .project_workload_container .pwr-filters-group {
            display: flex;
            align-items: center;
            align-self: center;
            flex-wrap: nowrap;
            flex: 0 0 auto;
            gap: 8px;
            min-width: 0;
            min-height: 28px;
            margin: 0 !important;
            padding: 0 !important;
        }

        .project_workload_container .pwr-filters-group--left {
            justify-content: flex-start;
        }

        .project_workload_container .pwr-filters-group--center {
            justify-content: flex-start;
        }

        .project_workload_container .pwr-filters-group--right {
            justify-content: flex-end;
        }

        .project_workload_container .pwr-filters-group .frappe-control,
        .project_workload_container .pwr-filters-group .pwr-filter-field,
        .project_workload_container .pwr-filters-group .pwr-filter-period-nav,
        .project_workload_container .pwr-filters-group.filter-buttons {
            display: flex;
            align-items: center;
            align-self: center;
            margin-bottom: 0 !important;
            padding-bottom: 0 !important;
        }

        .project_workload_container .pwr-filter-show-fact label {
            display: flex;
            align-items: center;
            gap: 6px;
            margin: 0;
            min-height: 28px;
            line-height: 1.2;
        }

        .project_workload_container .pwr-filter-worker-wtype {
            display: flex;
            align-items: center;
            min-width: 130px !important;
            width: 130px !important;
            max-width: 130px !important;
            flex: 0 0 auto !important;
        }

        .project_workload_container .pwr-filter-worker-wtype-select {
            width: 100% !important;
            height: 28px !important;
            min-height: 28px !important;
            font-size: 12px !important;
            line-height: 1.2 !important;
            padding: 2px 20px 2px 6px !important;
        }

        .project_workload_container .pwr-filter-period-nav {
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .project_workload_container .pwr-filter-period-nav .pwr-chart-period-label {
            display: none !important;
        }

        .project_workload_container .pwr-filter-period-nav .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            height: 28px !important;
            min-height: 28px !important;
            padding: 0 6px !important;
        }

        .project_workload_container .unified-filters-row .help-box,
        .project_workload_container .unified-filters-row .clearfix {
            display: none !important;
            height: 0 !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
        }

        .project_workload_container .pwr-filters-group .frappe-control,
        .project_workload_container .pwr-filters-group .form-group,
        .project_workload_container .pwr-filters-group .control-input-wrapper,
        .project_workload_container .pwr-filters-group .control-input,
        .project_workload_container .pwr-filters-group .pwr-filter-field {
            margin: 0 !important;
            padding: 0 !important;
            min-height: 0 !important;
        }

        .project_workload_container .pwr-filters-group .frappe-control .form-group {
            display: flex;
            align-items: center;
            margin-bottom: 0 !important;
            width: auto !important;
            max-width: none !important;
        }

        .project_workload_container .unified-filters-row .form-group {
            margin-bottom: 0 !important;
            margin-right: 0 !important;
            width: auto;
            min-width: 100px;
        }

        .project_workload_container .unified-filters-row .control-input {
            margin-bottom: 0 !important;
        }

        .project_workload_container .unified-filters-row .form-control {
            height: 28px !important;
            line-height: 1.2 !important;
            font-size: 12px !important;
            padding: 2px 8px !important;
        }

        .project_workload_container .filter-buttons {
            display: flex;
            align-items: center;
            flex-wrap: nowrap;
            gap: 4px;
            margin-left: 0 !important;
            margin-bottom: 0 !important;
            flex-shrink: 0;
            width: auto !important;
        }

        .project_workload_container .filter-buttons .btn {
            height: 28px !important;
            min-height: 28px !important;
            min-width: 28px !important;
            padding: 0 6px !important;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px !important;
            line-height: 1 !important;
            border-radius: 3px !important;
        }

        .project_workload_container .unified-filters-row .frappe-control {
            margin-bottom: 0 !important;
            flex: 0 0 auto !important;
            width: auto !important;
            min-width: 100px !important;
            max-width: 160px !important;
        }

        .project_workload_container .unified-filters-row .control-label {
            display: none !important;
        }

        /* ========== СТИЛИ ТАБЛИЦЫ ========== */
        .project_workload_container .project-workload-table .datatable .dt-row.dt-row-header,
        .project_workload_container .project-workload-table .datatable .dt-cell.dt-cell--header {
            height: auto;
            text-align: center;
            display: flex;
        }
        
        .project_workload_container .project-workload-table .datatable .dt-row.dt-row-header {
            height: 70px !important;
            min-height: 70px !important;
        }
        
        .project_workload_container .project-workload-table .datatable .dt-cell.dt-cell--header {
            height: 70px !important;
            min-height: 70px !important;
        }
        
        .project_workload_container .project-workload-table .dt-cell {
            border: none;
            position: static;
            padding: 0 !important;
            margin: 0 !important;
            overflow: hidden !important;
        }
        
        .project_workload_container .project-workload-table .datatable .dt-cell--focus .dt-cell__content {
            border-color: var(--gray-200);
            border-width: 1px !important;
        }
        
        /* Отступы для разных уровней вложенности */
        .project_workload_container .project-workload-table div[data-indent="1"] .dt-tree-node {
            padding-left: 20px !important;
        }
        
        .project_workload_container .project-workload-table div[data-indent="2"] .dt-tree-node {
            padding-left: 40px !important;
        }
        
        .project_workload_container .project-workload-table .dt-row {
            height: auto !important;
            min-height: auto !important;
        }
        
        .project_workload_container .project-workload-table .dt-row[data-indent="0"] {
            height: auto !important;
            min-height: 33px !important;
        }
        
        .project_workload_container .project-workload-table .dt-row[data-indent="1"] {
            height: auto !important;
            min-height: 27px !important;
        }
        
        .project_workload_container .project-workload-table .dt-row[data-indent="2"] {
            height: auto !important;
            min-height: 25px !important;
        }
        
        .project_workload_container .project-workload-table .datatable .dt-row {
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
        }

        .project_workload_container .project-workload-table .datatable .dt-scrollable {
            margin: 0 !important;
            padding: 0 !important;
        }
        
        .project_workload_container .project-workload-table .datatable .dt-header .dt-cell--header .dt-cell__content {
            font-weight: 600;    
            margin: auto;
            font-size: 12px !important;
            line-height: 1.4 !important;
            padding: 10px 0 !important;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            flex-direction: column;
        }
        
        .project_workload_container .project-workload-table .datatable .dt-header .dt-cell--header .dt-cell__content br {
            display: block;
            content: " ";
            margin: 2px 0;
        }
        
        .project_workload_container .project-workload-table .datatable .dt-header .dt-cell--header .dt-cell__content small {
            font-size: 11px !important;
            font-weight: 700 !important;
            opacity: 0.9;
            margin-top: 2px;
            display: block;
        }
        
        .project_workload_container .project-workload-table .datatable .dt-cell__content {
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            height: 100% !important;
            border: none !important;
        }

        .project_workload_container .project-workload-table .dt-cell--header {
            width: 50px !important;
            min-width: 50px !important;
            max-width: 50px !important;
            text-align: center !important;
        }
        
        .project_workload_container .project-workload-table .dt-cell--header-0 {
            width: 250px !important; /* Увеличено для задач */
            min-width: 250px !important;
            max-width: 250px !important;
            text-align: left !important;
            padding-left: 10px !important;
        }
        
        .project_workload_container .project-workload-table .dt-cell:not(.dt-cell--col-0) {
            width: 50px !important;
            min-width: 50px !important;
            max-width: 50px !important;
        }
        
        .project_workload_container .project-workload-table .dt-cell--col-0 {
            width: 250px !important; /* Увеличено для задач */
            min-width: 250px !important;
            max-width: 250px !important;
            position: -webkit-sticky !important;
            position: sticky !important;
            left: 0;
            background: var(--bg-color);
            z-index: 3 !important;
            border-right: 1px solid var(--border-color) !important;
        }
        
        /* ========== ОТОБРАЖЕНИЕ ПОЛЬЗОВАТЕЛЯ ========== */
        .project_workload_container .project-user-display {
            display: flex;
            align-items: center;
            gap: 8px !important;
            padding: 0 8px !important;
            width: 100%;
            height: 100% !important;
            margin: 0 !important;
            box-sizing: border-box !important;
        }
        
        .project_workload_container .project-user-avatar {
            width: 26px !important;
            height: 26px !important;
            border-radius: 50%;
            object-fit: cover;
            border: 1px solid var(--border-color);
            flex-shrink: 0;
            margin: 0 !important;
            padding: 0 !important;
        }
        
        .project_workload_container .project-user-avatar-placeholder {
            width: 22px !important;
            height: 22px !important;
            border-radius: 50%;
            background: var(--blue-50);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 9px !important;
            color: var(--blue-500);
            border: 1px solid var(--blue-100);
            flex-shrink: 0;
            margin: 0 !important;
            padding: 0 !important;
        }
        
        .project_workload_container .project-user-info {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            justify-content: center;
            flex: 1;
            min-width: 0;
            margin: 0 !important;
            padding: 0 !important;
            height: 100%;
            line-height: 1.1 !important;
            width: calc(100% - 30px);
        }
        
        .project_workload_container .project-user-fullname {
            font-weight: 500;
            font-size: 12px !important;
            line-height: 1.1 !important;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            width: 100%;
            color: var(--text-color);
            margin: 0 !important;
            padding: 0 !important;
            display: block;
            text-align: left !important;
        }
        
        .project_workload_container .project-user-email {
            font-size: 10px !important;
            color: var(--text-muted);
            line-height: 1.1 !important;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            width: 100%;
            margin: 0 !important;
            padding: 0 !important;
            display: block;
            text-align: left !important;
        }
        
        /* ========== ОТОБРАЖЕНИЕ РОЛЕЙ ========== */
        .project_workload_container .project-role-display {
            padding: 0 !important;
            margin: 0 !important;
            height: 100% !important;
            display: flex;
            align-items: center;
            width: 100%;
            box-sizing: border-box !important;
            text-align: left;
            background: transparent !important;
            border: none !important;
            cursor: pointer;
        }
        
        .project_workload_container .project-role-name {
            font-weight: 500;
            font-size: 11px !important;
            color: var(--text-color);
            margin: 0 !important;
            padding: 0 !important;
            line-height: 1.1 !important;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            display: flex;
            align-items: center;
            width: 100%;
            padding-left: 20px !important;
        }
        
        /* ========== ОТОБРАЖЕНИЕ ЗАДАЧ ========== */
        .project_workload_container .project-task-display {
            padding: 0 !important;
            margin: 0 !important;
            height: 100% !important;
            display: flex;
            align-items: center;
            width: 100%;
            box-sizing: border-box !important;
            text-align: left;
            background: transparent !important;
            border: none !important;
        }
        
        .project_workload_container .project-task-name {
            font-weight: 400;
            font-size: 12px !important; 
            color: var(--text-color) !important; /* Изменили с var(--text-muted) на var(--text-color) - черный */
            margin: 0 !important;
            padding: 0 !important;
            line-height: 1.2 !important;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            display: flex;
            align-items: center;
            width: 100%;
            padding-left: 20px !important; /* Сдвинули левее - с 40px до 20px (на уровень роли) */
        }
        
        /* ========== СТИЛИ ДЛЯ ЯЧЕЕК РАЗНЫХ УРОВНЕЙ ========== */
        .project_workload_container .level-user .workload-hours {
            font-weight: 700;
            font-size: 11px !important;
        }
        
        .project_workload_container .level-role .workload-hours {
            font-weight: 600;
            font-size: 10px !important;
            color: var(--text-color);
        }
        
        .project_workload_container .level-task .workload-hours {
            font-weight: 400;
            font-size: 9px !important;
            color: var(--text-muted);
        }
        
        .project_workload_container .level-task .project-workload-percentage {
            font-size: 6px !important;
        }
        
        /* ========== БАЗОВЫЕ СТИЛИ ДЛЯ ЯЧЕЕК ========== */
        .project_workload_container .project-workload-cell {
            text-align: center;
            padding: 0 !important;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            position: relative;
            width: 100% !important;
            height: 40px !important;
            min-height: 40px !important;
            font-size: 8px !important;
            cursor: pointer;
            margin: 0 !important;
            border: none !important;
            box-sizing: border-box !important;
            line-height: 1 !important;
        }
        
        /* ========== ЯЧЕЙКИ ВЫХОДНЫХ ========== */
        .project_workload_container .project-weekend-cell {
            background: #60bcff20 !important;
            cursor: pointer;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            height: 40px !important;
            min-height: 40px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            border: none !important;
        }
        
        .project_workload_container .project-weekend-cell .project-weekend-text {
            display: none !important;
        }
        
        /* ========== ЯЧЕЙКИ ОТСУТСТВИЙ ========== */
        .project_workload_container .project-absence-cell {
            background: linear-gradient(135deg, #e8f5e8, #c8e6c9) !important;
            color: #2e7d32 !important;
            border: 1px solid #a5d6a7 !important;
            cursor: pointer;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            height: 40px !important;
            min-height: 40px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
        }
        
        .project_workload_container .project-absence-cell .project-absence-text {
            font-weight: 600;
            font-size: 9px !important;
            line-height: 1 !important;
            text-align: center;
            color: #2e7d32;
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
        }
        
        /* ========== ВИЗУАЛИЗАЦИЯ ЗАГРУЗКИ ========== */
        .project_workload_container .project-workload-visualization {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 0%;
            transition: height 0.3s ease;
            z-index: 1;
            border-radius: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            border: none !important;
        }
        .project_workload_container.animate .project-workload-visualization {
            transform: scaleY(0);
            transform-origin: bottom;
            animation: grow 1s ease forwards;
        }

        @keyframes grow {
            to {
                transform: scaleY(1);
            }
        }
        
        .project_workload_container .project-workload-visualization.normal {
            background: linear-gradient(to top, #7bc67b, #66b266);
        }
        
        .project_workload_container .project-workload-visualization.warning {
            background: linear-gradient(to top, #fcd34d, #fbbf24);
        }
        
        .project_workload_container .project-workload-visualization.overload {
            background: linear-gradient(to top, #e68a8a, #d67979);
            height: 100% !important;
        }
        
        /* ДОБАВИТЬ НОВЫЕ СТИЛИ для красного текста */
        .project_workload_container .project-workload-cell.overload-text .workload-hours,
        .project_workload_container .level-user .workload-hours.overload-text,
        .project_workload_container .level-role .workload-hours.overload-text,
        .project_workload_container .level-task .workload-hours.overload-text {
            color: #e63946 !important;
            font-weight: 700 !important;
        }
        
        .project_workload_container .project-workload-cell.overload-text .project-workload-percentage {
            color: #e63946 !important;
            font-weight: 700 !important;
        }
        
        .project_workload_container .project-workload-content {
            position: relative;
            z-index: 2;
            background: transparent;
            padding: 0 !important;
            margin: 0 !important;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            line-height: 1 !important;
        }
        
        .project_workload_container .project-workload-percentage {
            font-size: 7px !important;
            color: var(--text-color) !important;
            margin-top: 0px !important;
            font-weight: 600;
            line-height: 1 !important;
            padding: 0 !important;
        }
        
        .project_workload_container .workload-hours {
            font-weight: 600;
            font-size: 10px !important;
            color: var(--text-color) !important;
        }
        
        .project_workload_container .workload-hours.zero-load {
            color: var(--gray-500) !important;
        }
        
        .project_workload_container .workload-percentage.zero-load {
            color: var(--gray-500) !important;
        }
        
        /* ========== ВСЕ СТИЛИ ГАНТА УДАЛЕНЫ ========== */
        /* Стили .project-gantt-container, .project-gantt-timeline, 
           .project-gantt-bar, .project-gantt-bar-text и цвета полностью удалены */
        
        /* ========== АДАПТИВНОСТЬ ========== */
        @media screen and (max-width: 1200px) {
            .project_workload_container .form-filter-wrapper {
                min-width: 140px !important;
                width: 140px !important;
                max-width: 140px !important;
            }
            
            .project_workload_container .project-workload-table .dt-cell--col-0,
            .project_workload_container .project-workload-table .dt-cell--header-0,
            .project_workload_container .project-workload-table .project-workload-ag-grid .ag-pinned-left-cols-container,
            .project_workload_container .project-workload-table .project-workload-ag-grid .ag-pinned-left-header {
                width: 220px !important;
                min-width: 220px !important;
                max-width: 220px !important;
            }
        }

        @media screen and (max-width: 992px) {
            .project_workload_container .projects-workload-controls.unified-filters-row,
            .project_workload_container .unified-filters-row {
                gap: 8px 12px;
                justify-content: flex-start;
            }

            .project_workload_container .unified-filters-row .form-group,
            .project_workload_container .unified-filters-row .frappe-control {
                min-width: 100px !important;
                width: 140px !important;
                max-width: 140px !important;
            }

            .project_workload_container .pwr-filters-group--right {
                justify-content: flex-end;
            }
            
            /* Уменьшаем аватар на мобильных */
            .project_workload_container .project-user-avatar,
            .project_workload_container .project-user-avatar-placeholder {
                width: 18px !important;
                height: 18px !important;
                font-size: 8px !important;
            }
            
            .project_workload_container .project-user-info {
                width: calc(100% - 26px);
            }
            
            .project_workload_container .project-workload-table .dt-cell--col-0,
            .project_workload_container .project-workload-table .dt-cell--header-0,
            .project_workload_container .project-workload-table .project-workload-ag-grid .ag-pinned-left-cols-container,
            .project_workload_container .project-workload-table .project-workload-ag-grid .ag-pinned-left-header {
                width: 200px !important;
                min-width: 200px !important;
                max-width: 200px !important;
            }
            
            .project_workload_container .project-task-name {
                padding-left: 50px !important;
            }
        }

        @media screen and (max-width: 768px) {
            .project_workload_container .unified-filters-row {
                flex-direction: row;
                flex-wrap: wrap;
                align-items: stretch;
                gap: 8px;
                justify-content: flex-start;
            }

            .project_workload_container .pwr-filters-group {
                flex: 1 1 100%;
                width: 100%;
                flex-wrap: nowrap;
                overflow-x: auto;
                overflow-y: hidden;
            }

            .project_workload_container .pwr-filters-group--center {
                justify-content: flex-start;
            }

            .project_workload_container .pwr-filters-group--right {
                justify-content: flex-end;
            }

            .project_workload_container .unified-filters-row .form-group,
            .project_workload_container .unified-filters-row .frappe-control {
                min-width: 100px !important;
                width: 110px !important;
                max-width: 110px !important;
            }

            .project_workload_container .filter-buttons {
                gap: 8px;
            }
            
            .project_workload_container .filter-buttons .btn {
                min-width: 100px !important;
                padding: 4px 12px !important;
            }
            
            .project_workload_container .project-workload-table .dt-cell--col-0,
            .project_workload_container .project-workload-table .dt-cell--header-0,
            .project_workload_container .project-workload-table .project-workload-ag-grid .ag-pinned-left-cols-container,
            .project_workload_container .project-workload-table .project-workload-ag-grid .ag-pinned-left-header {
                width: 180px !important;
                min-width: 180px !important;
                max-width: 180px !important;
            }
            
            .project_workload_container .project-task-name {
                padding-left: 40px !important;
                font-size: 9px !important;
            }
        }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
}

// Экспорт для использования в основном файле
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { applyProjectWorkloadStyle };
}
