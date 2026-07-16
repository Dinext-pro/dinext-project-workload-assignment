import { SURFACE_REPORT } from "../constants.js";
import { WorkloadSession } from "./base.js";
import { getColumns } from "../shared/columns.js";
import { createOnExpandRow } from "../shared/tree.js";
import { setupLoadMore } from "../shared/paging.js";
import { syncReportViewport, bindViewportResize } from "../shared/viewport.js";
import { loadReportGrid, loadMoreUsers } from "../report/data.js";
import { initFilters } from "../report/filters.js";
import { initReportCharts, reloadReportCharts } from "../report/charts.js";
import { createOnCellDoubleClicked } from "../report/navigation.js";
import { destroy as destroyCharts } from "../charts/index.js";

export class ReportSession extends WorkloadSession {
	constructor(opts) {
		const { host, container, gridShellEl, filtersEl, page, wrapper } = opts || {};
		super(host, SURFACE_REPORT);
		const s = this.state;
		s.container = container;
		s.gridShellEl = gridShellEl || null;
		s.filtersEl = filtersEl || null;
		s.page = page || null;
		s.wrapper = wrapper || host;
	}

	_columns() {
		const s = this.state;
		return getColumns(s.periods, {
			viewType: s.filters?.view_type,
			participantWidth: s.participantWidth,
		});
	}

	_bindLoadMore() {
		this.state.loadMorePage = (st) => loadMoreUsers(st);
	}

	_afterLayout() {
		bindViewportResize(this.state);
		requestAnimationFrame(() => syncReportViewport(this.state));
	}

	async mount({ withFilters = true } = {}) {
		const s = this.state;
		if (!s.container) {
			throw new Error("ReportSession.mount: container required");
		}

		if (withFilters) {
			initFilters({
				state: s,
				onReload: () => this.reload(),
			});
		}

		s.container.replaceChildren();
		this._bindLoadMore();

		try {
			await this._withLoading(
				() => loadReportGrid(s),
				__("Loading data...")
			);
		} catch (err) {
			console.error("[workload.report] load failed", err);
			frappe.msgprint({
				title: __("Error"),
				indicator: "red",
				message: err?.message || String(err),
			});
			s.rows = [];
			s.periods = [];
		}

		await this._createTable({
			columns: this._columns(),
			onExpandRow: createOnExpandRow(s),
			onCellDoubleClicked: createOnCellDoubleClicked(s),
		});

		try {
			await initReportCharts({
				state: s,
				onTableReload: () => this.reload(),
			});
		} catch (err) {
			console.error("[workload.report] charts init failed", err);
		}

		this._afterLayout();
		return s.table;
	}

	async reload(filterArgs) {
		const s = this.state;
		this._bindLoadMore();

		try {
			await this._withLoading(
				() => loadReportGrid(s, filterArgs),
				__("Loading data...")
			);
		} catch (err) {
			console.error("[workload.report] refresh failed", err);
			frappe.msgprint({
				title: __("Error"),
				indicator: "red",
				message: err?.message || String(err),
			});
			return null;
		}

		const columns = this._columns();
		if (!s.table) {
			if (!s.container) return null;
			await this._createTable({
				columns,
				onExpandRow: createOnExpandRow(s),
				onCellDoubleClicked: createOnCellDoubleClicked(s),
			});
		} else {
			this._refreshTable({ rows: s.rows, columns, collapseAll: true });
			setupLoadMore(s, s.table);
		}

		reloadReportCharts(s);
		this._afterLayout();
		return s.table;
	}

	destroy() {
		destroyCharts(this.state);
		super.destroy();
	}
}
