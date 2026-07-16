import { createState } from "../state.js";
import {
	createTable,
	refreshTable,
	destroyTable,
} from "../shared/table.js";
import { withLoading } from "../shared/loading.js";

/** host (wrapper/frm) → WorkloadSession */
const sessionsByHost = new WeakMap();

export function getSession(host) {
	if (!host) return null;
	return sessionsByHost.get(host) || null;
}

function registerSession(host, session) {
	if (host && session) {
		sessionsByHost.set(host, session);
	}
}

function unregisterSession(host) {
	if (host) {
		sessionsByHost.delete(host);
	}
}

/**
 * Owns lifecycle + state bag. Subclasses implement mount/reload.
 * Helpers still receive `session.state` (data bag), not the class.
 */
export class WorkloadSession {
	constructor(host, surface) {
		if (!host) {
			throw new Error("WorkloadSession: host required");
		}
		this.host = host;
		this.state = createState(host);
		this.state.surface = surface;
		this.state.session = this;
		registerSession(host, this);
	}

	getState() {
		return this.state;
	}

	async _createTable(opts) {
		return createTable({
			container: this.state.container,
			state: this.state,
			data: this.state.rows || [],
			...opts,
		});
	}

	_refreshTable(opts) {
		refreshTable(this.state, opts);
	}

	_withLoading(fn, message) {
		return withLoading(this.state, fn, message);
	}

	destroy() {
		destroyTable(this.state);
		if (typeof this.state._tabCleanup === "function") {
			this.state._tabCleanup();
		}
		unregisterSession(this.host);
		this.state.session = null;
		this.state.table = null;
	}
}
