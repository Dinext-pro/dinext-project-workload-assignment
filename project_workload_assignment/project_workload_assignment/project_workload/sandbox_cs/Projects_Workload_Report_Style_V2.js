// === Frappe Script Metadata ===
// Managed By: fix_style_v2_filters_section.py
// Kind: Client Script
// Script Name: Projects_Workload_Report_Style_V2
// Reference DocType: Projects Workload Report
// View: Form
// Enabled: 1
// Fixture Modified: 2026-06-05 14:16:27.361427
// Module: Project Workload Assignment
// Content SHA256: b76764df12abd33edfd31606b8e159313f50b74e4a653f3651a8c78ff1b07c38
// === /Frappe Script Metadata ===

/* projects_workload_styles.js - ИСПРАВЛЕННАЯ ВАНДАЛЬНАЯ ВЕРСИЯ CSS */
/* Все CSS-стили для Projects Workload Report - чистый CSS без SCSS */

function applyProjectsWorkloadStyle() {
    const styles = `
        /* Скрываем сайдбар и кнопку сохранения для Projects Workload Report */
        body[data-route="Form/Projects Workload Report"] .layout-side-section {
            display: none !important;
        }
        
        body[data-route="Form/Projects Workload Report"] .page-actions {
            display: none !important;
        }
        
        body[data-route="Form/Projects Workload Report"] .form-dashboard {
            display: none !important;
        }
        
        body[data-route="Form/Projects Workload Report"] .layout-main-section-wrapper {
            width: 100% !important;
        }
        
        body[data-route="Form/Projects Workload Report"] .layout-main-section {
            margin-left: 0 !important;
            margin-right: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
        }

        @media (min-width: 1200px) {
            body[data-route="Form/Projects Workload Report"] .container-xl,
            body[data-route="Form/Projects Workload Report"] .container-lg,
            body[data-route="Form/Projects Workload Report"] .container-md,
            body[data-route="Form/Projects Workload Report"] .container-sm,
            body[data-route="Form/Projects Workload Report"] .container,
            [id="page-Projects Workload Report"] .container-xl,
            [id="page-Projects Workload Report"] .container-lg,
            [id="page-Projects Workload Report"] .container-md,
            [id="page-Projects Workload Report"] .container-sm,
            [id="page-Projects Workload Report"] .container {
                max-width: 1490px !important;
            }
        }

        body[data-route="Form/Projects Workload Report"] .form-layout,
        body[data-route="Form/Projects Workload Report"] .std-form-layout {
            padding-left: 0 !important;
            padding-right: 0 !important;
        }

        /* Без скролла страницы — только внутренний скролл AG Grid */
        html[data-theme],
        body[data-route="Form/Projects Workload Report"] {
            overflow: hidden !important;
            height: 100% !important;
        }

        body[data-route="Form/Projects Workload Report"] .page-container,
        body[data-route="Form/Projects Workload Report"] .main-section,
        body[data-route="Form/Projects Workload Report"] .container.page-body {
            overflow: hidden !important;
            max-height: 100vh !important;
        }

        body[data-route="Form/Projects Workload Report"] .layout-main {
            display: flex !important;
            flex-direction: column !important;
            height: calc(100vh - var(--navbar-height) - var(--page-head-height) - 5px) !important;
            max-height: calc(100vh - var(--navbar-height) - var(--page-head-height) - 5px) !important;
            min-height: 0 !important;
            overflow: hidden !important;
        }

        body[data-route="Form/Projects Workload Report"] .layout-main-section-wrapper,
        body[data-route="Form/Projects Workload Report"] .layout-main-section,
        body[data-route="Form/Projects Workload Report"] .std-form-layout,
        body[data-route="Form/Projects Workload Report"] .form-layout {
            overflow: hidden !important;
        }

        body[data-route="Form/Projects Workload Report"] .layout-main-section {
            margin-bottom: 0 !important;
        }

        /* Секция фильтров: без второй рамки — card-section уже даёт обводку */
        body[data-route="Form/Projects Workload Report"] .projects-workload-filters-section .section-body {
            padding-top: 8px !important;
            padding-bottom: 8px !important;
        }

        .projects-workload-filters-section .projects-workload-controls {
            margin: 0 !important;
            padding: 0 !important;
        }

        .projects-workload-filters-section .section-body .projects-workload-controls {
            margin-bottom: 6px !important;
        }

        /* Секция таблицы: без лишних отступов и заголовка поля */
        body[data-route="Form/Projects Workload Report"] .form-section.card-section[data-fieldname="section_break_nyf1"],
        [id="page-Projects Workload Report"] .form-section.card-section[data-fieldname="section_break_nyf1"] {
            padding: 0 !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            --bs-gutter-x: 0 !important;
        }

        body[data-route="Form/Projects Workload Report"] .form-section[data-fieldname="section_break_nyf1"] .section-head {
            display: none !important;
        }

        body[data-route="Form/Projects Workload Report"] .form-section[data-fieldname="section_break_nyf1"] .section-body {
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            --bs-gutter-x: 0 !important;
        }

        body[data-route="Form/Projects Workload Report"] .form-section[data-fieldname="section_break_nyf1"] .form-column,
        body[data-route="Form/Projects Workload Report"] .form-section[data-fieldname="section_break_nyf1"] [class*="col-sm-"],
        body[data-route="Form/Projects Workload Report"] .form-section[data-fieldname="section_break_nyf1"] [class*="col-md-"] {
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            flex: 0 0 100% !important;
        }

        body[data-route="Form/Projects Workload Report"] .form-section[data-fieldname="section_break_nyf1"] .form-group {
            margin: 0 !important;
            padding: 0 !important;
        }

        body[data-route="Form/Projects Workload Report"] [data-fieldname="projects_workload_report"] {
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
        }

        body[data-route="Form/Projects Workload Report"] [data-fieldname="projects_workload_report"] .control-label {
            display: none !important;
        }

        body[data-route="Form/Projects Workload Report"] [data-fieldname="projects_workload_report"] .frappe-control,
        body[data-route="Form/Projects Workload Report"] [data-fieldname="projects_workload_report"] .control-input-wrapper,
        body[data-route="Form/Projects Workload Report"] [data-fieldname="projects_workload_report"] .control-input {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
        }

        /* Основной контейнер — высота задаётся из JS (applyProjectsWorkloadSectionLayout) */
        .projects_workload_report {
            max-width: 100% !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            display: flex;
            flex-direction: column;
            min-height: 320px !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
        }
        
        .projects_workload_report .projects-workload-table {
            flex: 1 1 auto;
            display: flex;
            flex-direction: column;
            min-height: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
        }

        .projects_workload_report .projects-workload-ag-grid {
            width: 100% !important;
            max-width: 100% !important;
            flex: 1 1 auto;
            height: 100% !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            padding-bottom: 24px !important;
        }

        .projects_workload_report .projects-workload-ag-grid .ag-root-wrapper {
            border: none !important;
            border-radius: 0 !important;
        }
        
        .projects_workload_report .projects-workload-table .datatable {
            margin-top: 0 !important;
            flex: 1;
            display: flex;
            flex-direction: column;
        }
        
        .projects_workload_report .projects-workload-table .datatable .dt-scrollable {
            max-height: none !important;
            height: auto !important;
            min-height: 300px;
            border: 1px solid var(--border-color) !important;
            flex: 1;
            overflow-y: auto;
        }
        
        .projects_workload_report .projects-workload-table .datatable .dt-fit-height {
            height: fit-content !important;
            min-height: fit-content !important;
        }
        
        /* ========== УЛУЧШЕННАЯ КОМПАКТНАЯ СТРОКА ФИЛЬТРОВ ========== */
        .projects-workload-filters-section .projects-workload-controls.unified-filters-row {
            display: flex;
            align-items: center;
            align-content: center;
            justify-content: space-between;
            width: 100%;
            margin: 0 !important;
            flex-wrap: wrap;
            row-gap: 8px !important;
            column-gap: 16px !important;
            padding: 0 4px !important;
            overflow: visible;
            background: transparent !important;
            border: none !important;
            border-radius: 0 !important;
        }

        .projects-workload-filters-section .pwr-filters-group {
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

        .projects-workload-filters-section .pwr-filters-group--left {
            justify-content: flex-start;
        }

        .projects-workload-filters-section .pwr-filters-group--center {
            justify-content: flex-start;
        }

        .projects-workload-filters-section .pwr-filters-group--right {
            justify-content: flex-end;
        }

        .projects-workload-filters-section .pwr-filters-group .form-filter-wrapper,
        .projects-workload-filters-section .pwr-filters-group .frappe-control,
        .projects-workload-filters-section .pwr-filters-group .pwr-filter-field,
        .projects-workload-filters-section .pwr-filters-group .pwr-filter-period-nav,
        .projects-workload-filters-section .pwr-filters-group.filter-buttons {
            display: flex;
            align-items: center;
            align-self: center;
            margin-bottom: 0 !important;
            padding-bottom: 0 !important;
        }

        .projects-workload-filters-section .pwr-filter-show-fact label {
            display: flex;
            align-items: center;
            gap: 6px;
            margin: 0;
            min-height: 28px;
            line-height: 1.2;
        }

        .projects-workload-filters-section .pwr-filter-period-nav {
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .projects-workload-filters-section .pwr-filter-period-nav .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            height: 28px !important;
            min-height: 28px !important;
            padding: 0 6px !important;
        }

        .projects-workload-filters-section .pwr-filters-group .frappe-control .form-group {
            display: flex;
            align-items: center;
            margin-bottom: 0 !important;
        }

        .projects-workload-filters-section .unified-filters-row .help-box,
        .projects-workload-filters-section .unified-filters-row .clearfix {
            display: none !important;
            height: 0 !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
        }

        .projects-workload-filters-section .form-filter-wrapper .filter-control,
        .projects-workload-filters-section .form-filter-wrapper .frappe-control,
        .projects-workload-filters-section .form-filter-wrapper .form-group,
        .projects-workload-filters-section .form-filter-wrapper .control-input-wrapper,
        .projects-workload-filters-section .form-filter-wrapper .control-input,
        .projects-workload-filters-section .pwr-filters-group--center .frappe-control,
        .projects-workload-filters-section .pwr-filters-group--center .form-group,
        .projects-workload-filters-section .pwr-filters-group--center .control-input-wrapper,
        .projects-workload-filters-section .pwr-filters-group--center .control-input {
            margin: 0 !important;
            padding: 0 !important;
            min-height: 0 !important;
        }

        .projects-workload-filters-section .unified-filters-row .frappe-control,
        .projects-workload-filters-section .unified-filters-row .form-group,
        .projects-workload-filters-section .unified-filters-row .pwr-filter-field {
            margin-top: 0 !important;
            margin-bottom: 0 !important;
            padding-top: 0 !important;
            padding-bottom: 0 !important;
        }

        .projects-workload-filters-section .filters-container {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
            flex: 1;
        }

        /* ФИКСИРОВАННАЯ ШИРИНА ДЛЯ ФИЛЬТРОВ */
        .projects-workload-filters-section .form-filter-wrapper {
            display: flex;
            align-items: center;
            min-width: 160px !important;
            width: 160px !important;
            max-width: 160px !important;
            flex: 0 0 auto !important;
            margin-right: 0 !important;
        }

        .projects-workload-filters-section .form-filter-wrapper .control-input {
            margin-bottom: 0 !important;
            width: 100%;
        }

        .projects-workload-filters-section .form-filter-wrapper .form-control {
            height: 28px !important;
            min-height: 28px !important;
            font-size: 12px !important;
            line-height: 1.2 !important;
            width: 100% !important;
            padding: 2px 8px !important;
        }

        .projects-workload-filters-section .form-filter-wrapper .link-field {
            height: 28px !important;
            min-height: 28px !important;
            width: 100% !important;
        }

        .projects-workload-filters-section .form-filter-wrapper .link-field .awesomplete {
            width: 100% !important;
        }

        .projects-workload-filters-section .form-filter-wrapper .link-field input {
            width: 100% !important;
            height: 28px !important;
            padding: 2px 8px !important;
            font-size: 12px !important;
        }

        /* Стили для выпадающих списков и кнопок */
        .projects-workload-filters-section .unified-filters-row .form-group {
            margin-bottom: 0 !important;
            margin-right: 0 !important;
            width: auto;
            min-width: 100px;
        }

        .projects-workload-filters-section .unified-filters-row .control-input {
            margin-bottom: 0 !important;
        }

        .projects-workload-filters-section .unified-filters-row .form-control {
            height: 28px !important;
            line-height: 1.2 !important;
            font-size: 12px !important;
            padding: 2px 8px !important;
        }

        .projects-workload-filters-section .filter-separator {
            width: 1px;
            height: 20px;
            background: var(--border-color);
            margin: 0 4px;
            flex-shrink: 0;
        }

        .projects-workload-filters-section .filter-buttons {
            display: flex;
            align-items: center;
            flex-wrap: nowrap;
            gap: 4px;
            margin-left: 0 !important;
            flex-shrink: 0;
            padding-bottom: 0 !important;
        }

        .projects-workload-filters-section .pwr-filter-period-nav .pwr-chart-period-label {
            display: none !important;
        }

        /* Кнопки - КОМПАКТНЫЕ */
        .projects-workload-filters-section .filter-buttons .btn {
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

        /* Контейнеры для селекторов */
        .projects-workload-filters-section .unified-filters-row .frappe-control {
            margin-bottom: 0 !important;
        }

        .projects-workload-filters-section .unified-filters-row .frappe-control .form-group {
            margin-bottom: 0 !important;
        }

        /* Убираем лейблы у контролов */
        .projects-workload-filters-section .unified-filters-row .control-label {
            display: none !important;
        }

        /* Стили для таблицы */
        .projects_workload_report .projects-workload-table .datatable .dt-row.dt-row-header,
        .projects_workload_report .projects-workload-table .datatable .dt-cell.dt-cell--header {
            height: auto;
            text-align: center;
            display: flex;
        }
        
        .projects_workload_report .projects-workload-table .datatable .dt-row.dt-row-header {
            height: 70px !important;
            min-height: 70px !important;
        }
        
        .projects_workload_report .projects-workload-table .datatable .dt-cell.dt-cell--header {
            height: 70px !important;
            min-height: 70px !important;
        }
        
        .projects_workload_report .projects-workload-table .dt-cell {
            border: none;
            position: static;
            padding: 0 !important;
            margin: 0 !important;
            overflow: hidden !important;
        }
        
        .projects_workload_report .projects-workload-table .datatable .dt-cell--focus .dt-cell__content {
            border-color: var(--gray-200);
            border-width: 1px !important;
        }
        
        .projects_workload_report .projects-workload-table div[data-indent="1"] .dt-tree-node {
            padding-left: 20px !important;
        }
        
        .projects_workload_report .projects-workload-table .dt-row {
            height: auto !important;
            min-height: auto !important;
        }
        
        .projects_workload_report .projects-workload-table .dt-row[data-indent="0"] {
            height: auto !important;
            min-height: 33px !important;
        }
        
        .projects_workload_report .projects-workload-table .dt-row[data-indent="1"] {
            height: auto !important;
            min-height: 27px !important;
        }
        
        .projects_workload_report .projects-workload-table .datatable .dt-row {
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
        }

        .projects_workload_report .projects-workload-table .datatable .dt-scrollable {
            margin: 0 !important;
            padding: 0 !important;
        }
        
        .projects_workload_report .projects-workload-table .datatable .dt-header .dt-cell--header .dt-cell__content {
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
        
        .projects_workload_report .projects-workload-table .datatable .dt-header .dt-cell--header .dt-cell__content br {
            display: block;
            content: " ";
            margin: 2px 0;
        }
        
        .projects_workload_report .projects-workload-table .datatable .dt-header .dt-cell--header .dt-cell__content small {
            font-size: 11px !important;
            font-weight: 700 !important;
            opacity: 0.9;
            margin-top: 2px;
            display: block;
        }
        
        .projects_workload_report .projects-workload-table .datatable .dt-cell__content {
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            height: 100% !important;
            border: none !important;
        }

        .projects_workload_report .projects-workload-table .dt-cell--header {
            width: 50px !important;
            min-width: 50px !important;
            max-width: 50px !important;
            text-align: center !important;
        }
        
        .projects_workload_report .projects-workload-table .dt-cell--header-0 {
            width: 200px !important;
            min-width: 200px !important;
            max-width: 200px !important;
            text-align: left !important;
            padding-left: 10px !important;
        }
        
        .projects_workload_report .projects-workload-table .dt-cell:not(.dt-cell--col-0) {
            width: 50px !important;
            min-width: 50px !important;
            max-width: 50px !important;
        }
        
        .projects_workload_report .projects-workload-table .dt-cell--col-0 {
            width: 200px !important;
            min-width: 200px !important;
            max-width: 200px !important;
            position: -webkit-sticky !important;
            position: sticky !important;
            left: 0;
            background: var(--bg-color);
            z-index: 3 !important;
            border-right: 1px solid var(--border-color) !important;
        }
        
        /* ========== ИСПРАВЛЕНИЯ ДЛЯ ОТОБРАЖЕНИЯ ПОЛЬЗОВАТЕЛЯ ========== */
        
        /* УВЕЛИЧИЛИ АВАТАР */
        .projects_workload_report .projects-user-display {
            display: flex;
            align-items: center;
            gap: 8px !important;
            padding: 0 8px !important;
            width: 100%;
            height: 100% !important;
            margin: 0 !important;
            box-sizing: border-box !important;
        }
        
        .projects_workload_report .projects-user-avatar {
            width: 26px !important;
            height: 26px !important;
            border-radius: 50%;
            object-fit: cover;
            border: 1px solid var(--border-color);
            flex-shrink: 0;
            margin: 0 !important;
            padding: 0 !important;
        }
        
        .projects_workload_report .projects-user-avatar-placeholder {
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
        
        .projects_workload_report .projects-user-info {
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
        
        .projects_workload_report .projects-user-fullname {
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
        
        .projects_workload_report .projects-user-email {
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
        
        .projects_workload_report .dt-row[data-indent="1"] .dt-cell--col-0 .projects-workload-cell {
            padding-top: 2px !important;
            align-items: flex-start !important;
        }
        
        .projects_workload_report .dt-row[data-indent="1"] .dt-cell--col-0 .projects-user-display::before {
            content: none !important;
            display: none !important;
        }
        
        /* ========== БАЗОВЫЕ СТИЛИ ДЛЯ ВСЕХ ЯЧЕЕК ========== */
        .projects_workload_report .projects-workload-cell {
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
        
        /* Ячейки проекта с отступом слева */
        .projects_workload_report .project-display {
            padding: 1px 4px 1px 35px !important;
            text-align: left;
            display: flex;
            align-items: center;
            gap: 4px !important;
            height: 100%;
            cursor: pointer;
            margin: 0 !important;
            width: 100%;
            box-sizing: border-box !important;
        }
        
        .projects_workload_report .project-name {
            font-weight: 500;
            font-size: 11px !important;
            color: var(--text-color);
            margin: 0 !important;
            line-height: 1.1 !important;
        }
        
        /* ========== ЯЧЕЙКИ ВЫХОДНЫХ ========== */
        .projects_workload_report .projects-weekend-cell {
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
        
        /* Скрываем текст в выходных ячейках */
        .projects_workload_report .projects-weekend-cell .projects-weekend-text {
            display: none !important;
        }
        
        .projects_workload_report .projects-weekend-cell .projects-workload-percentage {
            display: none;
        }
        
        /* ========== ЯЧЕЙКИ ОТСУТСТВИЙ ========== */
        .projects_workload_report .projects-absence-cell {
            background: -webkit-linear-gradient(135deg, #e8f5e8, #c8e6c9) !important;
            background: -moz-linear-gradient(135deg, #e8f5e8, #c8e6c9) !important;
            background: -o-linear-gradient(135deg, #e8f5e8, #c8e6c9) !important;
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
        
        .projects_workload_report .projects-absence-cell .projects-absence-text {
            font-weight: 600;
            font-size: 9px !important;
            line-height: 1 !important;
            text-align: center;
            word-break: break-word;
            overflow-wrap: break-word;
            -webkit-hyphens: auto;
            -moz-hyphens: auto;
            hyphens: auto;
            white-space: pre-line;
            color: #2e7d32;
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
        }
        
        .projects_workload_report .projects-absence-cell .projects-workload-percentage {
            display: none;
        }
        
        /* ========== ВИЗУАЛИЗАЦИЯ ЗАГРУЗКИ ========== */
        .projects_workload_report .projects-workload-visualization {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 0%;
            -webkit-transition: height 0.3s ease;
            -moz-transition: height 0.3s ease;
            -o-transition: height 0.3s ease;
            transition: height 0.3s ease;
            z-index: 1;
            border-radius: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            border: none !important;
        }
        
        .projects_workload_report .projects-workload-visualization.normal {
            background: -webkit-linear-gradient(to top, #7bc67b, #66b266) !important;
            background: -moz-linear-gradient(to top, #7bc67b, #66b266) !important;
            background: -o-linear-gradient(to top, #7bc67b, #66b266) !important;
            background: linear-gradient(to top, #7bc67b, #66b266) !important;
            border: none !important;
        }
        
        .projects_workload_report .projects-workload-visualization.warning {
            background: -webkit-linear-gradient(to top, #fcd34d, #fbbf24) !important;
            background: -moz-linear-gradient(to top, #fcd34d, #fbbf24) !important;
            background: -o-linear-gradient(to top, #fcd34d, #fbbf24) !important;
            background: linear-gradient(to top, #fcd34d, #fbbf24) !important;
            border: none !important;
        }
        
        .projects_workload_report .projects-workload-visualization.overload {
            background: -webkit-linear-gradient(to top, #e68a8a, #d67979) !important;
            background: -moz-linear-gradient(to top, #e68a8a, #d67979) !important;
            background: -o-linear-gradient(to top, #e68a8a, #d67979) !important;
            background: linear-gradient(to top, #e68a8a, #d67979) !important;
            border: none !important;
            height: 100% !important;
        }

        .projects_workload_report .projects-workload-visualization.pwr-actual-fill {
            background: rgba(33, 150, 243, 0.45) !important;
            border-top: none !important;
            z-index: 2;
        }

        .projects_workload_report .projects-workload-cell.pwr-plan-fact-cell {
            height: 54px !important;
            min-height: 54px !important;
        }

        .projects_workload_report .projects-workload-ag-grid.projects-workload-ag-grid--show-fact .ag-center-cols-container .ag-cell {
            border-right: 1px solid var(--border-color) !important;
        }

        .projects_workload_report .projects-workload-ag-grid.projects-workload-ag-grid--show-fact .ag-header-viewport .ag-header-cell {
            border-right: 1px solid var(--border-color) !important;
        }

        .projects_workload_report .pwr-plan-fact-indicators {
            position: absolute;
            left: 0;
            right: 0;
            bottom: 0;
            height: 42%;
            display: flex;
            z-index: 1;
            pointer-events: none;
        }

        .projects_workload_report .pwr-indicator-slot {
            flex: 1 1 50%;
            position: relative;
            height: 100%;
            display: flex;
            align-items: flex-end;
            overflow: hidden;
        }

        .projects_workload_report .pwr-indicator-slot .projects-workload-visualization {
            position: relative;
            width: 100%;
            bottom: auto;
            left: auto;
            right: auto;
        }

        .projects_workload_report .pwr-plan-fact-content {
            position: relative;
            z-index: 3;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 2px !important;
            padding: 1px 0 0 !important;
            height: 58%;
            box-sizing: border-box;
        }

        .projects_workload_report .pwr-plan-fact-row {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            line-height: 1;
        }

        .projects_workload_report .pwr-plan-fact-col {
            flex: 1 1 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 0;
            text-align: center;
            white-space: nowrap;
        }

        .projects_workload_report .pwr-plan-fact-row--hours .workload-hours {
            font-size: 9px !important;
        }

        .projects_workload_report .pwr-plan-fact-row--pct .projects-workload-percentage {
            font-size: 7px !important;
            margin-top: 0 !important;
        }

        .projects_workload_report .pwr-plan-fact-col--actual .pwr-actual-hours {
            color: #1565c0;
            font-size: 9px !important;
            font-weight: 600;
        }

        .projects_workload_report .pwr-plan-fact-col--actual .pwr-actual-pct {
            color: #1565c0;
            font-size: 7px !important;
            font-weight: 600;
        }

        .projects_workload_report .pwr-actual-hours.zero-load,
        .projects_workload_report .pwr-actual-pct.zero-load {
            color: var(--gray-500) !important;
        }
        
        .projects_workload_report .projects-workload-content {
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
        
        .projects_workload_report .projects-workload-percentage {
            font-size: 7px !important;
            color: var(--text-color) !important;
            margin-top: 0px !important;
            font-weight: 600;
            line-height: 1 !important;
            padding: 0 !important;
        }
        
        /* Стиль для часов загрузки */
        .projects_workload_report .workload-hours {
            font-weight: 600;
            font-size: 10px !important;
            color: var(--text-color) !important;
        }
        
        .projects_workload_report .workload-hours.zero-load {
            color: var(--gray-500) !important;
        }
        
        .projects_workload_report .workload-percentage.zero-load {
            color: var(--gray-500) !important;
        }

        /* ISS-2026-00865 V2: кнопка порционной дозагрузки пользователей */
        .projects-workload-filters-section .projects-workload-load-more {
            min-width: 130px !important;
            padding: 0 10px !important;
            white-space: nowrap;
            font-size: 12px !important;
        }

        .projects-workload-filters-section .projects-workload-load-more:disabled {
            opacity: 0.7;
            cursor: wait;
        }

        /* ========== АДАПТИВНОСТЬ ========== */
        @media screen and (max-width: 1200px) {
            .projects-workload-filters-section .form-filter-wrapper {
                min-width: 140px !important;
                width: 140px !important;
                max-width: 140px !important;
            }
        }

        @media screen and (max-width: 992px) {
            .projects-workload-filters-section .unified-filters-row {
                gap: 8px 12px;
                justify-content: flex-start;
            }

            .projects-workload-filters-section .filters-container {
                gap: 6px;
            }

            .projects-workload-filters-section .form-filter-wrapper {
                min-width: 140px !important;
                width: 140px !important;
                max-width: 140px !important;
            }

            .projects-workload-filters-section .filter-separator {
                display: none;
            }

            .projects-workload-filters-section .pwr-filters-group--right {
                justify-content: flex-end;
            }
            
            /* Уменьшаем аватар на мобильных */
            .projects_workload_report .projects-user-avatar,
            .projects_workload_report .projects-user-avatar-placeholder {
                width: 18px !important;
                height: 18px !important;
                font-size: 8px !important;
            }
            
            .projects_workload_report .projects-user-info {
                width: calc(100% - 26px);
            }
        }

        @media screen and (max-width: 768px) {
            .projects-workload-filters-section .unified-filters-row {
                flex-direction: row;
                flex-wrap: wrap;
                align-items: stretch;
                gap: 8px;
                justify-content: flex-start;
            }

            .projects-workload-filters-section .pwr-filters-group {
                flex: 1 1 100%;
                width: 100%;
                flex-wrap: nowrap;
                overflow-x: auto;
                overflow-y: hidden;
            }

            .projects-workload-filters-section .pwr-filters-group--center {
                justify-content: flex-start;
            }

            .projects-workload-filters-section .pwr-filters-group--right {
                justify-content: flex-end;
            }

            .projects-workload-filters-section .form-filter-wrapper {
                min-width: 130px !important;
                width: 130px !important;
                max-width: 130px !important;
            }

            .projects-workload-filters-section .filter-buttons {
                gap: 12px;
            }
            
            .projects-workload-filters-section .filter-buttons .btn {
                min-width: 100px !important;
                padding: 4px 12px !important;
            }
            
            /* ISS-2026-00625: Стили для заблокированного поля пользователя */
            .projects-workload-filters-section .form-filter-wrapper input[readonly] {
                background-color: var(--gray-100) !important;
                cursor: not-allowed !important;
                opacity: 0.8 !important;
            }
            
            .projects-workload-filters-section .form-filter-wrapper input[readonly]:focus {
                border-color: var(--border-color) !important;
                box-shadow: none !important;
            }
        }
    `;

    const styleSheet = document.getElementById('projects-workload-report-styles') || document.createElement('style');
    styleSheet.id = 'projects-workload-report-styles';
    styleSheet.textContent = styles;
    if (!styleSheet.parentNode) {
        document.head.appendChild(styleSheet);
    }
}

// Экспортируем функцию для использования в основном файле
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { applyProjectsWorkloadStyle };
}
