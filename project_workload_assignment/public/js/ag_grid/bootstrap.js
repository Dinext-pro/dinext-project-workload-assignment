(function() {
    const AG_GRID_VERSION = "35.2.1";
    const AG_GRID_JS = "/assets/project_workload_assignment/js/ag_grid/ag-grid-community.min.js";
    const AG_GRID_CSS = [
        "/assets/project_workload_assignment/css/ag_grid/ag-grid.css",
        "/assets/project_workload_assignment/css/ag_grid/ag-theme-quartz.css"
    ];

    let agGridPromise = null;

    function loadScriptOnce(url, globalCheck) {
        if (globalCheck && globalCheck()) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${url}"]`);
            if (existing) {
                existing.addEventListener("load", resolve, { once: true });
                existing.addEventListener("error", reject, { once: true });
                if (globalCheck && globalCheck()) resolve();
                return;
            }

            const script = document.createElement("script");
            script.src = url;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    function loadStyleOnce(url) {
        if (document.querySelector(`link[href="${url}"]`)) return;

        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = url;
        document.head.appendChild(link);
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
            .projects-workload-ag-grid-participant {
                display: flex;
                align-items: center;
                height: 100%;
                padding: 0 8px !important;
                cursor: default;
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
        if (window.agGrid && typeof window.agGrid.createGrid === "function") {
            return Promise.resolve();
        }

        if (!agGridPromise) {
            AG_GRID_CSS.forEach(loadStyleOnce);
            injectProjectsWorkloadAgGridCss();
            agGridPromise = loadScriptOnce(AG_GRID_JS, () => window.agGrid && typeof window.agGrid.createGrid === "function")
                .then(() => {
                    if (!window.agGrid || typeof window.agGrid.createGrid !== "function") {
                        throw new Error("AG Grid не загрузился");
                    }
                });
        }

        return agGridPromise;
    }

    window.DinextProjectsAgGridBootstrap = {
        version: AG_GRID_VERSION,
        ensure: ensureAgGrid
    };
})();
