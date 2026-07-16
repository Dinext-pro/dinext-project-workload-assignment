/**
 * Legacy PWR / Project workload AG Grid adapter (`ProjectsWorkloadAgGrid.Table`).
 *
 * ISS-2026-00865 (prod until ISS-2026-00926 DinextAgGrid ships). When porting to 00926, keep:
 * - Tree: `toVisibleRows` + `expandedOnPath`, stable `getRowKey` (`user:email`, `project:…`).
 * - UI: `participantColumnWidth` + `onColumnResized`; `syncAllToggleDom` / `refreshParticipantCells`
 *   after `renderRows` (expand arrow vs visible children; width survives refresh / load-more).
 * - Project tab: `getProjectWorkloadToggleIndent`, toggle `›` vs spacer (architect #9–10).
 *
 * PWR Python: `project_workload_assignment.project_workload.*` + `project_workload_api` (not dinext_common).
 * Porting map: `.issues/ISS-2026-00926/cross-ref-iss-2026-00865.md`
 */
(function() {
    const BOOTSTRAP_JS = "/assets/dinext_common/js/ag-grid/bootstrap.js";
    let bootstrapPromise = null;
    let initPromise = null;

    function loadBootstrap() {
        if (window.DinextAgGrid && typeof window.DinextAgGrid.ensure === "function") {
            return Promise.resolve();
        }

        if (!bootstrapPromise) {
            bootstrapPromise = new Promise((resolve, reject) => {
                const finish = () => {
                    if (window.DinextAgGrid && typeof window.DinextAgGrid.ensure === "function") {
                        resolve();
                        return true;
                    }
                    return false;
                };

                if (finish()) {
                    return;
                }

                const existing = document.querySelector(`script[src="${BOOTSTRAP_JS}"]`);
                if (existing) {
                    existing.addEventListener(
                        "load",
                        () => {
                            if (!finish()) {
                                reject(new Error(__("DinextAgGrid bootstrap failed to load")));
                            }
                        },
                        { once: true }
                    );
                    existing.addEventListener(
                        "error",
                        () => reject(new Error(__("DinextAgGrid bootstrap failed to load"))),
                        { once: true }
                    );
                    // Script tag already in DOM (e.g. previous navigation) — "load" will not fire again.
                    let attempts = 0;
                    const poll = () => {
                        if (finish()) {
                            return;
                        }
                        if (attempts++ >= 120) {
                            reject(new Error(__("DinextAgGrid bootstrap timeout")));
                            return;
                        }
                        setTimeout(poll, 100);
                    };
                    poll();
                    return;
                }

                const script = document.createElement("script");
                script.src = BOOTSTRAP_JS;
                script.onload = () => {
                    if (!finish()) {
                        reject(new Error(__("DinextAgGrid bootstrap failed to load")));
                    }
                };
                script.onerror = () => reject(new Error(__("DinextAgGrid bootstrap failed to load")));
                document.head.appendChild(script);
            });
        }

        return bootstrapPromise;
    }

    function injectProjectsWorkloadAgGridCss() {
        if (document.getElementById("projects-workload-ag-grid-css")) return;

        const style = document.createElement("style");
        style.id = "projects-workload-ag-grid-css";
        style.textContent = `
            .projects-workload-ag-grid {
                width: calc(100% - 4px);
                height: 70vh;
                min-height: 420px;
                margin: 0.5rem 0 4px 4px;
                border-radius: 0;
                font-family: inherit;
                font-size: var(--text-md);
                --ag-font-family: inherit;
                --ag-font-size: var(--text-md);
                --ag-border-radius: 0;
                --ag-wrapper-border-radius: 0;
                --ag-row-border-color: transparent;
                --ag-cell-horizontal-border: none;
                --ag-border-color: var(--border-color);
                --ag-header-column-separator-display: none;
                --ag-header-column-resize-handle-display: none;
                --ag-background-color: var(--bg-color);
                --ag-header-background-color: rgb(243, 243, 243);
                --ag-header-foreground-color: var(--text-color);
                --ag-foreground-color: var(--text-color);
                --projects-workload-ag-header-bg: rgb(243, 243, 243);
                --projects-workload-ag-header-main-color: var(--text-color);
                --projects-workload-ag-header-sub-color: var(--text-color);
            }
            .projects_workload_report .projects-workload-ag-grid {
                height: 100%;
                min-height: 0;
                max-height: none;
                margin: 0;
            }
            .project_workload_container .project-workload-ag-grid {
                height: 100%;
                min-height: 0;
                max-height: none;
                margin: 0;
            }
            .projects-workload-ag-grid .ag-pinned-left-header {
                --ag-header-column-resize-handle-display: block;
            }
            [data-theme="dark"] .projects-workload-ag-grid,
            .projects-workload-ag-grid.projects-workload-ag-grid-dark {
                --ag-background-color: rgb(23, 23, 23);
                --ag-header-background-color: var(--subtle-fg, #1f2226);
                --ag-foreground-color: var(--text-color);
                --projects-workload-ag-header-bg: var(--subtle-fg, #1f2226);
                --projects-workload-ag-header-main-color: var(--text-color, #f4f4f4);
                --projects-workload-ag-header-sub-color: var(--text-color, #f4f4f4);
            }
            .projects-workload-ag-grid .ag-root-wrapper {
                border: 1px solid var(--border-color) !important;
                border-radius: 0 !important;
                background: var(--ag-background-color) !important;
            }
            .projects-workload-ag-grid .ag-root,
            .projects-workload-ag-grid .ag-body,
            .projects-workload-ag-grid .ag-body-viewport,
            .projects-workload-ag-grid .ag-center-cols-viewport,
            .projects-workload-ag-grid .ag-center-cols-container,
            .projects-workload-ag-grid .ag-pinned-left-cols-container {
                background: var(--ag-background-color) !important;
            }
            .projects-workload-ag-grid .ag-row {
                border: none !important;
                background: transparent !important;
            }
            .projects-workload-ag-grid .ag-cell {
                padding: 0 !important;
                margin: 0 !important;
                line-height: normal;
                border: none !important;
                overflow: hidden !important;
            }
            .projects-workload-ag-grid .ag-cell-wrapper,
            .projects-workload-ag-grid .ag-cell-value {
                width: 100%;
                height: 100%;
                padding: 0 !important;
                margin: 0 !important;
                display: block;
            }
            .projects-workload-ag-grid .ag-header-cell-label {
                justify-content: center;
                text-align: center;
            }
            .projects-workload-ag-grid .ag-header,
            .projects-workload-ag-grid .ag-header-row,
            .projects-workload-ag-grid .ag-header-cell {
                background: var(--projects-workload-ag-header-bg);
            }
            .projects-workload-ag-grid .ag-header {
                border-bottom: none !important;
            }
            .projects-workload-ag-grid .ag-header-cell {
                padding: 0 !important;
                border-right: none !important;
            }
            .projects-workload-ag-grid .ag-header-viewport .ag-header-cell-resize {
                display: none !important;
            }
            .projects-workload-ag-grid .ag-header-cell::before,
            .projects-workload-ag-grid .ag-header-group-cell::before {
                display: none !important;
            }
            .projects-workload-ag-grid .ag-header-viewport .ag-header-cell-resize::after {
                display: none !important;
            }
            .projects-workload-ag-grid .ag-pinned-left-header,
            .projects-workload-ag-grid .ag-pinned-left-cols-container {
                border-right: 1px solid var(--border-color) !important;
            }
            .projects-workload-ag-grid .ag-header-cell .projects-workload-ag-grid-header {
                box-sizing: border-box;
                min-height: 100%;
            }
            .projects-workload-ag-grid .ag-header-cell:has(.projects-workload-ag-grid-header--current-period) {
                background: rgba(33, 150, 243, 0.14) !important;
            }
            [data-theme="dark"] .projects-workload-ag-grid .ag-header-cell:has(.projects-workload-ag-grid-header--current-period) {
                background: rgba(33, 150, 243, 0.22) !important;
            }
            .projects-workload-ag-grid[data-loading-message]::after {
                content: attr(data-loading-message);
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 10;
                padding: 8px 12px;
                border: 1px solid var(--border-color);
                border-radius: 4px;
                background: var(--fg-color, var(--bg-color));
                color: var(--text-color);
                box-shadow: var(--shadow-sm, 0 2px 8px rgba(0, 0, 0, 0.12));
                pointer-events: none;
            }
            .projects-workload-ag-grid .projects-workload-ag-grid-header {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                width: 100%;
                height: 100%;
                line-height: 1.4;
                text-align: center;
                padding: 10px 0 !important;
            }
            .projects-workload-ag-grid .projects-workload-ag-grid-header-main {
                color: var(--projects-workload-ag-header-main-color);
                font-size: 12px;
                font-weight: 600;
            }
            .projects-workload-ag-grid .projects-workload-ag-grid-header-sub {
                margin-top: 2px;
                color: var(--projects-workload-ag-header-sub-color);
                font-size: 11px;
                font-weight: 700;
                opacity: 0.9;
            }
            .projects-workload-ag-grid .projects-workload-ag-grid-header-single {
                color: var(--projects-workload-ag-header-main-color);
                font-size: 12px;
                font-weight: 600;
                white-space: normal;
            }
            .projects-workload-ag-grid .projects-workload-ag-grid-header--current-period {
                background: rgba(33, 150, 243, 0.14) !important;
            }
            .projects-workload-ag-grid .projects-workload-ag-grid-header--current-period .projects-workload-ag-grid-header-main,
            .projects-workload-ag-grid .projects-workload-ag-grid-header--current-period .projects-workload-ag-grid-header-sub,
            .projects-workload-ag-grid .projects-workload-ag-grid-header--current-period .projects-workload-ag-grid-header-single {
                color: #1565c0;
                font-weight: 600;
            }
            [data-theme="dark"] .projects-workload-ag-grid .projects-workload-ag-grid-header--current-period {
                background: rgba(33, 150, 243, 0.22) !important;
            }
            [data-theme="dark"] .projects-workload-ag-grid .projects-workload-ag-grid-header--current-period .projects-workload-ag-grid-header-main,
            [data-theme="dark"] .projects-workload-ag-grid .projects-workload-ag-grid-header--current-period .projects-workload-ag-grid-header-sub,
            [data-theme="dark"] .projects-workload-ag-grid .projects-workload-ag-grid-header--current-period .projects-workload-ag-grid-header-single {
                color: #64b5f6;
            }
            .projects-workload-ag-grid-participant {
                display: flex;
                align-items: center;
                height: 100%;
                padding: 0 8px !important;
                cursor: default;
            }
            .projects-workload-ag-grid .project-user-avatar-wrap,
            .projects-workload-ag-grid .projects-user-avatar-wrap {
                position: relative;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 26px;
                height: 26px;
                flex-shrink: 0;
            }
            .projects-workload-ag-grid .project-user-avatar-wrap .project-user-avatar,
            .projects-workload-ag-grid .projects-user-avatar-wrap .projects-user-avatar {
                width: 26px;
                height: 26px;
            }
            .projects-workload-ag-grid-toggle {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 18px;
                min-width: 18px;
                height: 18px;
                color: var(--text-muted, #6c7680);
                cursor: pointer;
                font-size: 24px;
                font-weight: 700;
                line-height: 1;
                user-select: none;
                flex-shrink: 0;
                align-self: center;
                transform: rotate(0deg);
                transform-origin: center center;
                transition: transform 0.15s ease;
            }
            .projects-workload-ag-grid-toggle.is-expanded {
                transform: rotate(90deg);
                transform-origin: center center;
                transition: transform 0.15s ease;
                padding-left: 4px !important;
                padding-bottom: 8px !important;
            }
            .projects-workload-ag-grid-toggle-spacer {
                display: inline-block;
                width: 18px;
                min-width: 18px;
                height: 18px;
                flex-shrink: 0;
            }
            .projects-workload-ag-grid-placeholder {
                color: var(--text-muted, #6c7680);
                font-style: italic;
            }
            .projects-workload-ag-grid.project-workload-ag-grid .projects-workload-ag-grid-participant-content .project-role-display,
            .projects-workload-ag-grid.project-workload-ag-grid .projects-workload-ag-grid-participant-content .project-task-display {
                width: 100%;
            }
            .projects-workload-ag-grid.project-workload-ag-grid .projects-workload-ag-grid-participant-content .project-role-name {
                padding-left: 4px !important;
                font-weight: 600;
            }
        `;
        document.head.appendChild(style);
    }

    function ensureAgGrid() {
        if (!initPromise) {
            initPromise = loadBootstrap()
                .then(() => window.DinextAgGrid.ensure())
                .then(() => {
                    // Class-theme CSS for this adapter only (DinextTable uses Theming API).
                    if (typeof window.DinextAgGrid.ensureLegacyThemeCss === "function") {
                        window.DinextAgGrid.ensureLegacyThemeCss();
                    }
                    injectProjectsWorkloadAgGridCss();
                });
        }

        return initPromise;
    }

    function getDefaultRowLevel(row) {
        const indent = Number(row && row.indent);
        return Number.isFinite(indent) ? Math.max(0, indent) : 0;
    }

    function getWorkloadTreeRowLevel(row) {
        if (!row) return 0;
        if (row.level === "user" || row.isUser) return 0;
        if (row.level === "role" || row.isRole) return 1;
        if (row.level === "task" || row.isTask) {
            const indent = Number(row.indent);
            return Number.isFinite(indent) ? Math.max(2, indent) : 2;
        }
        return getDefaultRowLevel(row);
    }

    function getTreeLevelAttr(row) {
        if (!row) return "";
        if (row.level) return row.level;
        if (row._isProject) return "project";
        if (row._isUser) return "user";
        return "";
    }

    function getToggleSymbol() {
        return "›";
    }

    function escapeHtml(text) {
        return String(text || "")
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function getUserAvatarInitial(fullName) {
        return ((fullName && fullName.charAt(0)) || "U").toUpperCase();
    }

    function buildUserAvatarHtml(fullName, userImage, classPrefix) {
        const initial = getUserAvatarInitial(fullName);
        const safeName = escapeHtml(fullName);
        const placeholderClass = `${classPrefix}-placeholder`;
        const placeholderHtml = `<div class="${placeholderClass}">${initial}</div>`;

        if (!userImage) {
            return placeholderHtml;
        }

        const safeSrc = escapeHtml(userImage);
        return (
            `<span class="${classPrefix}-wrap">` +
            `<img src="${safeSrc}" class="${classPrefix}" alt="${safeName}" ` +
            `onerror="this.style.display='none';` +
            `var p=this.parentElement&&this.parentElement.querySelector('.${placeholderClass}');` +
            `if(p)p.classList.add('pwr-avatar-visible');">` +
            `<div class="${placeholderClass}">${initial}</div>` +
            `</span>`
        );
    }

    function getProjectWorkloadToggleIndent(row, table) {
        const indent = Number(row && row.indent);
        if (Number.isFinite(indent) && indent > 0) {
            return 28 + (indent - 1) * 18;
        }
        const level = table ? table.getRowLevel(row) : getWorkloadTreeRowLevel(row);
        if (level <= 0) return 0;
        return 28 + (level - 1) * 18;
    }

    function resolveRowLevel(row, table) {
        if (table && typeof table.getRowLevel === "function") {
            return table.getRowLevel(row);
        }
        if (row && row.level) {
            return getWorkloadTreeRowLevel(row);
        }
        return getDefaultRowLevel(row);
    }

    function getDefaultRowKey(row, index) {
        if (!row) return `row-${index}`;
        if (row._agRowKey) return row._agRowKey;

        if (row.level === "user" || row.isUser || row._isUser) {
            return `user:${row.email || row._email || row.participant || index}`;
        }
        if (row.level === "role" || row.isRole) {
            return `role:${row.email || row._email || "user"}:${row.roleName || row.role || row.participant || index}`;
        }
        if (row.level === "task" || row.isTask) {
            return `task:${row.email || row._email || "user"}:${row.roleName || row.role || "role"}:${row.task_id || row.name || row.participant || index}`;
        }
        if (row._isAbsenceRow) {
            return `absence:${row._email || row.email || index}`;
        }
        if (row._isLazyPlaceholder) {
            return `placeholder:${row._email || row.email || index}`;
        }
        if (row._isProject) {
            return `project:${row._email || row.email || "user"}:${row._project || row.project || row.participant || index}`;
        }

        return `row:${row.participant || row.name || index}:${index}`;
    }

    function getRowId(row, index, table) {
        if (!row) return `row-${index}`;
        const key = table ? table.getRowKey(row, index) : getDefaultRowKey(row, index);
        row._agRowId = key;
        return row._agRowId;
    }

    function getParticipantIndent(row, table) {
        const indentSize = table && Number.isFinite(Number(table.options.indentSize))
            ? Number(table.options.indentSize)
            : 18;
        return (table ? table.getRowLevel(row) : getDefaultRowLevel(row)) * indentSize;
    }

    function isDefaultExpandableRow(row) {
        if (!row) return false;
        if (typeof row.expandable === "boolean") {
            return row.expandable;
        }
        if (row._isLazyPlaceholder || row._isAbsenceRow || row._isProject) {
            return false;
        }
        if (row.level === "task" || row.isTask) {
            return false;
        }
        return false;
    }

    // ISS-2026-00865 / port to ISS-2026-00926: independent expand per branch (not one flag per indent level).
    function toVisibleRows(rows, table) {
        const visibleRows = [];
        const expandedOnPath = [];

        (rows || []).forEach((row, index) => {
            if (!row) return;

            const level = resolveRowLevel(row, table);
            expandedOnPath.length = level;

            const parentVisible = level === 0 || expandedOnPath[level - 1] === true;
            if (!parentVisible) {
                return;
            }

            visibleRows.push(row);

            const expandable = table.isRowExpandable(row, index);
            const rowKey = table.getRowKey(row, index);
            const isExpanded = !expandable || table.expandedRows.has(rowKey);
            expandedOnPath[level] = isExpanded;
        });

        return visibleRows;
    }

    function periodColumnSignature(columns) {
        return (columns || [])
            .map(column => column && column.id)
            .filter(id => id && id !== "participant" && String(id).indexOf("workload_") === 0)
            .join("\u0001");
    }

    function resolveCurrentPeriodKey(periods, viewType) {
        if (!periods?.length || !frappe.datetime?.get_today || !frappe.datetime?.str_to_obj) {
            return null;
        }
        const today = frappe.datetime.str_to_obj(frappe.datetime.get_today());
        for (let i = 0; i < periods.length; i += 1) {
            const period = periods[i];
            if (viewType === "daily") {
                if (period.date === frappe.datetime.get_today()) {
                    return period.key;
                }
                continue;
            }
            if (viewType === "weekly") {
                const start = frappe.datetime.str_to_obj(period.start_date);
                const end = frappe.datetime.str_to_obj(period.end_date);
                if (today >= start && today <= end) {
                    return period.key;
                }
                continue;
            }
            if (
                period.year === today.getFullYear() &&
                Number(period.month) === today.getMonth() + 1
            ) {
                return period.key;
            }
        }
        return null;
    }

    function getParticipantColumnWidth(table, column, isParticipant) {
        if (!isParticipant) {
            return Number(column.width) || 50;
        }
        const saved = Number(table.participantColumnWidth);
        if (Number.isFinite(saved) && saved > 0) {
            return saved;
        }
        return Number(column.width) || table.options.participantWidth || 220;
    }

    function toAgColumn(column, index, table) {
        const field = column.id || column.name || `col_${index}`;
        const isParticipant = field === "participant" || index === 0;
        const width = getParticipantColumnWidth(table, column, isParticipant);
        const minWidth = Number(column.minWidth) || (isParticipant ? Math.min(width, 160) : width);
        const maxWidth = Number(column.maxWidth) || (isParticipant ? undefined : width);

        const agColumn = {
            field,
            colId: field,
            headerName: column.name || "",
            headerComponent: ProjectsWorkloadAgGridHeader,
            headerComponentParams: {
                html: column.name || "",
                isCurrentPeriod: !!column.isCurrentPeriod,
            },
            width,
            minWidth,
            pinned: isParticipant ? "left" : undefined,
            lockPinned: isParticipant,
            suppressMovable: true,
            sortable: !!column.sortable,
            resizable: isParticipant,
            cellClass: params => {
                const classes = [];
                if (isParticipant) classes.push("projects-workload-ag-grid-participant-cell");
                if (params.data && params.data.level) classes.push(`level-${params.data.level}`);
                if (typeof column.cellClass === "function") {
                    const customClass = column.cellClass(params);
                    if (Array.isArray(customClass)) {
                        classes.push(...customClass);
                    } else if (customClass) {
                        classes.push(customClass);
                    }
                } else if (column.cellClass) {
                    classes.push(column.cellClass);
                }
                return classes;
            },
            cellRenderer: params => {
                if (isParticipant) {
                    return table.renderParticipantCell(params.data, column, params);
                }

                if (typeof column.format === "function") {
                    return column.format(params.value, null, column, params.data);
                }

                return params.value == null ? "" : String(params.value);
            }
        };

        if (Number.isFinite(maxWidth)) {
            agColumn.maxWidth = maxWidth;
        }

        return agColumn;
    }

    function isFrappeDarkTheme() {
        const root = document.documentElement;
        const resolvedTheme = root.getAttribute("data-theme");
        const selectedTheme = root.getAttribute("data-theme-mode");

        if (resolvedTheme) return resolvedTheme === "dark";
        return selectedTheme === "dark";
    }

    class ProjectsWorkloadAgGridHeader {
        init(params) {
            const rawHtml = params.html || params.displayName || "";
            const parts = String(rawHtml)
                .split(/<br\s*\/?>/i)
                .map(part => part.replace(/<\/?small>/gi, "").trim())
                .filter(Boolean);

            this.eGui = document.createElement("div");
            this.eGui.className = "projects-workload-ag-grid-header";

            if (parts.length > 1) {
                this.eGui.innerHTML = `
                    <div class="projects-workload-ag-grid-header-main">${parts[0]}</div>
                    <div class="projects-workload-ag-grid-header-sub">${parts.slice(1).join(" ")}</div>
                `;
            } else {
                this.eGui.innerHTML = `<div class="projects-workload-ag-grid-header-single">${parts[0] || rawHtml}</div>`;
            }
            if (params.isCurrentPeriod) {
                this.eGui.classList.add("projects-workload-ag-grid-header--current-period");
            }
        }

        getGui() {
            return this.eGui;
        }
    }

    class ProjectsWorkloadAgGridTable {
        constructor(container, options = {}) {
            this.container = container;
            this.wrapper = container;
            this.options = options;
            this.columns = options.columns || [];
            this.rows = options.data || [];
            this.expandedRows = new Set();
            // ISS-2026-00865: survives refresh()/columnDefs rebuild and load-more (00926: same in preset/factory).
            this.participantColumnWidth = Number(options.participantWidth) || 220;
            this.loading = false;
            this.getRowLevel = typeof options.getRowLevel === "function"
                ? options.getRowLevel
                : row => (row && row.level ? getWorkloadTreeRowLevel(row) : getDefaultRowLevel(row));
            this.getRowKey = typeof options.getRowKey === "function"
                ? options.getRowKey
                : getDefaultRowKey;
            this.isRowExpandable = typeof options.isRowExpandable === "function"
                ? options.isRowExpandable
                : isDefaultExpandableRow;
            this.onCellDoubleClick = typeof options.onCellDoubleClick === "function"
                ? options.onCellDoubleClick
                : null;
            this.rowHeight = Number(options.rowHeight) || 40;

            this.container.classList.add("projects-workload-ag-grid");
            if (options.extraClass) {
                String(options.extraClass).split(/\s+/).filter(Boolean).forEach(className => {
                    this.container.classList.add(className);
                });
            }
            this.applyTheme();
            this.themeObserver = new MutationObserver(() => this.applyTheme());
            this.themeObserver.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ["data-theme", "data-theme-mode"]
            });
            this.rowmanager = {
                collapseAllNodes: () => {
                    this.expandedRows.clear();
                    this.renderRows({ forceFull: true });
                },
                openSingleNode: rowIndexOrKey => {
                    const row = this.findRowByIndexOrKey(rowIndexOrKey);
                    if (!row) return;
                    const rowIndex = this.findRowIndex(row);
                    const rowKey = this.getRowKey(row, rowIndex >= 0 ? rowIndex : 0);
                    this.expandedRows.add(rowKey);
                    this.renderRows();
                    this.scheduleToggleDomSync();
                },
            };

            this.gridOptions = {
                theme: "legacy",
                columnDefs: this.columns.map((column, index) => toAgColumn(column, index, this)),
                rowData: [],
                rowHeight: options.rowHeight || 40,
                headerHeight: options.headerHeight || 70,
                suppressColumnVirtualisation: false,
                suppressRowVirtualisation: false,
                animateRows: false,
                ensureDomOrder: false,
                loadingOverlayComponentParams: {
                    loadingMessage: options.freezeMessage || __("Loading data...")
                },
                getRowId: params => params.data && params.data._agRowId ? params.data._agRowId : getRowId(params.data, 0, this),
                getRowClass: params => params.data && params.data.level ? `level-${params.data.level}` : "",
                onGridReady: params => {
                    this.api = params.api;
                    this.bodyScrollable = this.container.querySelector(".ag-body-viewport");
                    this.renderRows();
                    this.applyParticipantColumnWidth();
                },
                onColumnResized: params => this.handleColumnResized(params),
                onCellClicked: params => this.handleCellClick(params),
                onCellDoubleClicked: params => this.handleCellDoubleClick(params)
            };

            this.api = window.agGrid.createGrid(this.container, this.gridOptions);
            this.syncShowFactClass();
            this.renderRows();
        }

        applyTheme() {
            const isDark = isFrappeDarkTheme();
            this.container.classList.toggle("ag-theme-quartz", !isDark);
            this.container.classList.toggle("ag-theme-quartz-dark", isDark);
            this.container.classList.toggle("projects-workload-ag-grid-dark", isDark);
        }

        syncShowFactClass(showFact) {
            const enabled =
                showFact != null
                    ? !!showFact
                    : !!(typeof window !== "undefined" && window.pwrShowFact);
            this.container.classList.toggle("projects-workload-ag-grid--show-fact", enabled);
        }

        schedulePeriodCellRefresh() {
            if (!this.api || typeof this.api.refreshCells !== "function") {
                return;
            }
            requestAnimationFrame(() => {
                if (!this.api || typeof this.api.refreshCells !== "function") {
                    return;
                }
                this.api.refreshCells({ force: true });
            });
        }

        syncContentHeight() {
            if (!this.container.classList.contains("project-workload-ag-grid")) {
                return;
            }
            const charts =
                typeof project_workload_assignment !== "undefined"
                    ? project_workload_assignment.charts
                    : null;
            if (charts && typeof charts.syncGridViewportHeight === "function") {
                charts.syncGridViewportHeight(window.cur_frm);
            }
        }

        refresh(rows, columns, options) {
            const opts = options || {};
            this.syncShowFactClass(opts.showFact);
            if (opts.rowHeight) {
                this.rowHeight = opts.rowHeight;
                this.setGridOption("rowHeight", opts.rowHeight);
                if (this.api && typeof this.api.resetRowHeights === "function") {
                    this.api.resetRowHeights();
                }
            }
            const prevPeriodSignature = periodColumnSignature(this.columns);
            this.rows = rows || [];
            if (columns != null) {
                this.columns = columns;
            }
            if (opts.workloadPeriods) {
                this.workloadPeriods = opts.workloadPeriods;
            }
            if (opts.workloadViewType) {
                this.workloadViewType = opts.workloadViewType;
            }
            const currentPeriodKey = resolveCurrentPeriodKey(
                this.workloadPeriods,
                this.workloadViewType
            );
            if (currentPeriodKey) {
                this.columns = (this.columns || []).map((column) => {
                    if (!column || column.id === "participant") {
                        return column;
                    }
                    return {
                        ...column,
                        isCurrentPeriod: column.id === currentPeriodKey,
                    };
                });
            }
            this.rows.forEach((row, index) => {
                if (row) {
                    delete row._agRowId;
                    getRowId(row, index, this);
                }
            });

            const columnDefs = this.columns.map((column, index) => toAgColumn(column, index, this));
            this.setGridOption("columnDefs", columnDefs);
            this.renderRows({ forceFull: true });
            this.applyParticipantColumnWidth();
            this.schedulePeriodCellRefresh();

            const periodsChanged =
                columns != null && periodColumnSignature(this.columns) !== prevPeriodSignature;
            const shouldReloadChart = periodsChanged || this._chartReloadAfterRefresh;
            this._chartReloadAfterRefresh = false;

            if (
                shouldReloadChart &&
                cur_frm &&
                (cur_frm.doctype === "Projects Workload Report" || cur_frm.doctype === "Project")
            ) {
                requestAnimationFrame(() => {
                    $(document).trigger("pwr-workload-chart-reload", [cur_frm]);
                });
            }
        }

        findRowByIndexOrKey(rowIndexOrKey) {
            if (typeof rowIndexOrKey === "number" && Number.isFinite(rowIndexOrKey)) {
                return this.rows[rowIndexOrKey] || null;
            }
            const targetKey = String(rowIndexOrKey || "");
            if (!targetKey) return null;
            for (let i = 0; i < this.rows.length; i++) {
                const row = this.rows[i];
                if (!row) continue;
                if (this.getRowKey(row, i) === targetKey) {
                    return row;
                }
            }
            return null;
        }

        handleColumnResized(params) {
            if (!params || !params.finished) return;
            const col = params.column;
            if (!col || col.getColId() !== "participant") return;
            const width = col.getActualWidth();
            if (Number.isFinite(width) && width > 0) {
                this.participantColumnWidth = width;
            }
        }

        applyParticipantColumnWidth() {
            if (!this.api || !this.participantColumnWidth) return;
            const width = this.participantColumnWidth;
            if (typeof this.api.setColumnWidths === "function") {
                this.api.setColumnWidths([{ key: "participant", newWidth: width }]);
                return;
            }
            const col = typeof this.api.getColumn === "function"
                ? this.api.getColumn("participant")
                : null;
            if (col && typeof col.setWidth === "function") {
                col.setWidth(width);
            }
        }

        scheduleToggleDomSync() {
            if (this._toggleDomSyncScheduled) return;
            this._toggleDomSyncScheduled = true;
            requestAnimationFrame(() => {
                this._toggleDomSyncScheduled = false;
                this.syncAllToggleDom();
            });
        }

        syncAllToggleDom() {
            if (!this.api || typeof this.api.forEachNode !== "function") return;

            this.api.forEachNode(node => {
                const row = node.data;
                if (!row) return;

                const rowIndex = this.findRowIndex(row);
                if (!this.isRowExpandable(row, rowIndex)) return;

                const rowKey = this.getRowKey(row, rowIndex >= 0 ? rowIndex : 0);
                const rowId = row._agRowId || rowKey;
                const expanded = this.expandedRows.has(rowKey);
                const rowEl = this.container.querySelector(
                    `.ag-row[row-id="${CSS.escape(String(rowId))}"]`
                );
                if (!rowEl) return;

                const toggle = rowEl.querySelector(".projects-workload-ag-grid-toggle");
                if (toggle) {
                    toggle.classList.toggle("is-expanded", expanded);
                }
            });
        }

        refreshParticipantCells() {
            if (!this.api) return;
            if (typeof this.api.refreshCells === "function") {
                this.api.refreshCells({
                    columns: ["participant"],
                    force: true
                });
                return;
            }
            this.scheduleToggleDomSync();
        }

        renderRows(options = {}) {
            const opts = options || {};
            const visibleRows = toVisibleRows(this.rows, this);
            visibleRows.forEach((row, index) => getRowId(row, index, this));

            const nextIdList = visibleRows.map(row => row._agRowId);
            const nextIdSet = new Set(nextIdList);
            const canDelta = !opts.forceFull
                && this.api
                && typeof this.api.applyTransaction === "function"
                && Array.isArray(this._visibleRowIdList);

            if (canDelta) {
                const prevIdSet = new Set(this._visibleRowIdList);
                const toAdd = [];
                let addIndex = -1;

                visibleRows.forEach((row, index) => {
                    if (!prevIdSet.has(row._agRowId)) {
                        if (addIndex < 0) {
                            addIndex = index;
                        }
                        toAdd.push(row);
                    }
                });

                const toRemove = [];
                this.api.forEachNode(node => {
                    const id = node.data && node.data._agRowId;
                    if (id && !nextIdSet.has(id)) {
                        toRemove.push(node.data);
                    }
                });

                if (toAdd.length || toRemove.length) {
                    const tx = {};
                    if (toRemove.length) {
                        tx.remove = toRemove;
                    }
                    if (toAdd.length) {
                        tx.add = toAdd;
                        if (addIndex >= 0) {
                            tx.addIndex = addIndex;
                        }
                    }
                    this.api.applyTransaction(tx);
                    this._visibleRowIdList = nextIdList;
                    this.bodyScrollable = this.container.querySelector(".ag-body-viewport");
                    this.refreshParticipantCells();
                    this.scheduleToggleDomSync();
                    this.syncContentHeight();
                    return;
                }

                this._visibleRowIdList = nextIdList;
                this.scheduleToggleDomSync();
                this.syncContentHeight();
                return;
            }

            this.setGridOption("rowData", visibleRows);
            this._visibleRowIdList = nextIdList;
            this.bodyScrollable = this.container.querySelector(".ag-body-viewport");
            this.refreshParticipantCells();
            this.scheduleToggleDomSync();
            this.syncContentHeight();
        }

        syncToggleDomByRowKey(rowKey, expanded) {
            if (!rowKey) {
                return;
            }

            const rowEl = this.container.querySelector(
                `.ag-row[row-id="${CSS.escape(String(rowKey))}"]`
            );
            if (!rowEl) {
                return;
            }

            const toggle = rowEl.querySelector(".projects-workload-ag-grid-toggle");
            if (toggle) {
                toggle.classList.toggle("is-expanded", !!expanded);
            }
        }

        syncToggleDomFromClick(params, expanded) {
            const cellEl = params.eGridCell
                || (params.event && params.event.target
                    ? params.event.target.closest('[col-id="participant"]')
                    : null);
            if (!cellEl) {
                return;
            }

            const toggle = cellEl.querySelector(".projects-workload-ag-grid-toggle");
            if (toggle) {
                toggle.classList.toggle("is-expanded", !!expanded);
            }
        }

        setGridOption(key, value) {
            if (!this.api) return;
            if (typeof this.api.setGridOption === "function") {
                this.api.setGridOption(key, value);
                return;
            }

            if (key === "rowData" && typeof this.api.setRowData === "function") {
                this.api.setRowData(value);
            } else if (key === "columnDefs" && typeof this.api.setColumnDefs === "function") {
                this.api.setColumnDefs(value);
            }
        }

        findRowIndex(row) {
            if (!row) return -1;
            const targetKey = this.getRowKey(row, 0);
            for (let i = 0; i < this.rows.length; i++) {
                const current = this.rows[i];
                if (current === row) {
                    return i;
                }
                if (this.getRowKey(current, i) === targetKey) {
                    return i;
                }
            }
            return -1;
        }

        rowHasTreeChildren(row) {
            const rowIndex = this.findRowIndex(row);
            if (rowIndex < 0) {
                return false;
            }

            const level = this.getRowLevel(row);
            for (let i = rowIndex + 1; i < this.rows.length; i++) {
                const nextRow = this.rows[i];
                if (!nextRow) {
                    continue;
                }

                const nextLevel = this.getRowLevel(nextRow);
                if (nextLevel <= level) {
                    break;
                }
                if (nextLevel === level + 1) {
                    return true;
                }
            }

            return false;
        }

        renderParticipantCell(row, column, params) {
            if (!row) return "";

            const value = params.value == null ? row.participant : params.value;
            const rowIndex = this.findRowIndex(row);
            const treeLevel = getTreeLevelAttr(row);
            const rowKey = this.getRowKey(row, rowIndex >= 0 ? rowIndex : 0);
            const hasToggle = this.isRowExpandable(row, rowIndex);
            const expanded = hasToggle && this.expandedRows.has(rowKey);
            const toggleClass = expanded
                ? "projects-workload-ag-grid-toggle is-expanded"
                : "projects-workload-ag-grid-toggle";
            const isProjectGrid = this.container.classList.contains("project-workload-ag-grid");
            let participantStyle = "";
            let toggleHtml = "";
            if (isProjectGrid) {
                const toggleIndent = getProjectWorkloadToggleIndent(row, this);
                const indentStyle = toggleIndent ? ` style="margin-left:${toggleIndent}px"` : "";
                if (hasToggle) {
                    toggleHtml = `<span class="${toggleClass}"${indentStyle}>${getToggleSymbol()}</span>`;
                } else if (toggleIndent > 0) {
                    toggleHtml = `<span class="projects-workload-ag-grid-toggle-spacer"${indentStyle}></span>`;
                }
            } else {
                const indent = getParticipantIndent(row, this);
                if (indent) {
                    participantStyle = ` style="padding-left:${indent}px"`;
                }
                if (hasToggle) {
                    toggleHtml = `<span class="${toggleClass}">${getToggleSymbol()}</span>`;
                }
            }
            let content = "";

            if (typeof column.format === "function") {
                content = column.format(value, null, column, row);
            } else {
                content = value == null ? "" : String(value);
            }

            if (row._isLazyPlaceholder) {
                content = `<span class="projects-workload-ag-grid-placeholder">${content}</span>`;
            }

            const treeLevelAttr = treeLevel ? ` data-tree-level="${treeLevel}"` : "";

            return `
                <div class="projects-workload-ag-grid-participant"${treeLevelAttr}${participantStyle}>
                    ${toggleHtml}
                    <span class="projects-workload-ag-grid-participant-content">${content}</span>
                </div>
            `;
        }

        handleCellClick(params) {
            const row = params.data;
            if (!row || params.column.getColId() !== "participant" || !this.isRowExpandable(row)) {
                return;
            }

            const rowIndex = this.findRowIndex(row);
            const rowKey = this.getRowKey(row, rowIndex >= 0 ? rowIndex : 0);

            if (row._detailsLoaded === false && typeof window.loadProjectDetailsForUser === "function" && window.cur_frm) {
                if (this.expandedRows.has(rowKey)) {
                    this.expandedRows.delete(rowKey);
                    this.renderRows();
                    return;
                }
                this.expandedRows.add(rowKey);
                this.renderRows();
                window.loadProjectDetailsForUser(window.cur_frm, row);
                return;
            }

            const expanded = !this.expandedRows.has(rowKey);
            if (expanded) {
                this.expandedRows.add(rowKey);
            } else {
                this.expandedRows.delete(rowKey);
            }
            this.renderRows();
        }

        handleCellDoubleClick(params) {
            const column = this.columns.find(col => (col.id || col.name) === params.column.getColId()) || {
                id: params.column.getColId()
            };

            if (this.onCellDoubleClick) {
                this.onCellDoubleClick(params.data, column, params);
            } else if (typeof window.handleDoubleClick === "function") {
                window.handleDoubleClick(params.data, column);
            }
        }

        setCellDoubleClickHandler(handler) {
            this.onCellDoubleClick = typeof handler === "function" ? handler : null;
        }

        freeze(message) {
            this.loading = true;
            this._chartReloadAfterRefresh = true;
            if (this.api && typeof this.api.setGridOption === "function") {
                this.api.setGridOption("loading", true);
            }
            if (message) {
                this.container.setAttribute("data-loading-message", message);
            }
        }

        unfreeze() {
            this.loading = false;
            if (this.api && typeof this.api.setGridOption === "function") {
                this.api.setGridOption("loading", false);
            }
            this.container.removeAttribute("data-loading-message");
        }

        destroy() {
            if (this.themeObserver) {
                this.themeObserver.disconnect();
                this.themeObserver = null;
            }
            if (this.api && typeof this.api.destroy === "function") {
                this.api.destroy();
            }
            this.container.innerHTML = "";
        }
    }

    window.ProjectsWorkloadAgGrid = {
        ensure: ensureAgGrid,
        Table: ProjectsWorkloadAgGridTable,
        buildUserAvatarHtml
    };
})();
