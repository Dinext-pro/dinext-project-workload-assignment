/**
 * Lazy mount for heavy Project form tab content.
 * - mountFn runs once per bind cycle (form refresh), not on every tab switch
 * - CSS overlay on tab pane until mountFn settles (Promise-aware)
 */
(function () {
	frappe.provide("project_workload_assignment");

	function getFieldTab(frm, fieldname) {
		const field = frm?.get_field?.(fieldname);
		if (!field) {
			return null;
		}
		if (field.tab) {
			return field.tab;
		}
		const node = field.$wrapper?.get?.(0);
		const tabs = frm.layout?.tabs;
		if (!node || !tabs?.length) {
			return null;
		}
		for (let i = 0; i < tabs.length; i++) {
			const tab = tabs[i];
			const pane = tab.wrapper?.get?.(0);
			if (pane && $.contains(pane, node)) {
				return tab;
			}
		}
		return null;
	}

	function isFieldTabVisible(frm, fieldname) {
		const tab = getFieldTab(frm, fieldname);
		if (!tab) {
			return false;
		}
		return typeof tab.is_active === "function"
			? tab.is_active()
			: !!tab.wrapper?.hasClass?.("active");
	}

	function ensureLazyState(frm) {
		if (!frm._pwaLazy) {
			frm._pwaLazy = {
				mountFns: {},
				done: {},
				inflight: {},
				overlayCount: {},
				bound: {},
			};
		}
		return frm._pwaLazy;
	}

	function tabPaneKey(frm, fieldname) {
		const tab = getFieldTab(frm, fieldname);
		return (tab && tab.df && tab.df.fieldname) || fieldname;
	}

	function showTabOverlay(frm, fieldname) {
		const tab = getFieldTab(frm, fieldname);
		const $pane = tab && tab.wrapper;
		if (!$pane || !$pane.length) {
			return;
		}

		const state = ensureLazyState(frm);
		const key = tabPaneKey(frm, fieldname);
		state.overlayCount[key] = (state.overlayCount[key] || 0) + 1;
		if (state.overlayCount[key] > 1) {
			return;
		}

		$pane.addClass("pwa-tab-loading-host");
		let $el = $pane.children(".pwa-tab-loading");
		if (!$el.length) {
			const label = frappe.utils.escape_html(__("Loading…"));
			$el = $(
				`<div class="pwa-tab-loading" aria-live="polite"><p class="text-muted">${label}</p></div>`
			);
			$pane.prepend($el);
		}
		$el.removeClass("is-hidden");
	}

	function hideTabOverlay(frm, fieldname) {
		const tab = getFieldTab(frm, fieldname);
		const $pane = tab && tab.wrapper;
		if (!$pane || !$pane.length) {
			return;
		}

		const state = ensureLazyState(frm);
		const key = tabPaneKey(frm, fieldname);
		state.overlayCount[key] = Math.max(0, (state.overlayCount[key] || 0) - 1);
		if (state.overlayCount[key] > 0) {
			return;
		}

		$pane.children(".pwa-tab-loading").addClass("is-hidden");
	}

	function runLazyMount(frm, fieldname) {
		const state = ensureLazyState(frm);
		if (state.done[fieldname] || state.inflight[fieldname]) {
			return;
		}

		const mountFn = state.mountFns[fieldname];
		if (typeof mountFn !== "function") {
			return;
		}

		state.inflight[fieldname] = true;
		showTabOverlay(frm, fieldname);

		Promise.resolve()
			.then(() => mountFn())
			.catch((err) => {
				console.error(`[LazyTabMount] ${fieldname} failed`, err);
			})
			.finally(() => {
				state.inflight[fieldname] = false;
				state.done[fieldname] = true;
				hideTabOverlay(frm, fieldname);
			});
	}

	/**
	 * Bind mountFn to the field's tab `shown.bs.tab`.
	 * Call from form refresh: resets once-flag for this field (shell may be new),
	 * but repeat tab switches within the same cycle do not remount / re-show overlay.
	 */
	function bindLazyTabMount(frm, fieldname, mountFn) {
		if (!frm || !fieldname || typeof mountFn !== "function") {
			return;
		}

		const state = ensureLazyState(frm);
		state.mountFns[fieldname] = mountFn;
		if (!state.inflight[fieldname]) {
			delete state.done[fieldname];
		}

		const attach = () => {
			const tab = getFieldTab(frm, fieldname);
			if (!tab) {
				return false;
			}

			const $link = tab.tab_link?.find?.(".nav-link");
			if ($link?.length && !state.bound[fieldname]) {
				state.bound[fieldname] = true;
				$link.on("shown.bs.tab", function () {
					runLazyMount(frm, fieldname);
				});
			}

			if (isFieldTabVisible(frm, fieldname)) {
				runLazyMount(frm, fieldname);
			}
			return true;
		};

		if (attach()) {
			return;
		}

		setTimeout(() => {
			attach();
		}, 0);
	}

	project_workload_assignment.getFieldTab = getFieldTab;
	project_workload_assignment.isFieldTabVisible = isFieldTabVisible;
	project_workload_assignment.bindLazyTabMount = bindLazyTabMount;
})();
