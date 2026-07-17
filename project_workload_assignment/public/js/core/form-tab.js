/**
 * Lazy mount for DinextTable grids inside Project form tabs.
 * Shell on refresh; grid only when the field's tab is active.
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

	/**
	 * Bind mountFn to the field's tab `shown.bs.tab` (once per frm+fieldname).
	 * Runs mountFn now only if that tab is already active.
	 * Never mounts when tab cannot be resolved.
	 */
	function bindLazyTabMount(frm, fieldname, mountFn) {
		if (!frm || !fieldname || typeof mountFn !== "function") {
			return;
		}

		const bindKey = `_pwaLazyMount_${fieldname}`;

		const attach = () => {
			const tab = getFieldTab(frm, fieldname);
			if (!tab) {
				return false;
			}

			const $link = tab.tab_link?.find?.(".nav-link");
			if ($link?.length && !frm[bindKey]) {
				frm[bindKey] = true;
				$link.on("shown.bs.tab", function () {
					mountFn();
				});
			}

			if (isFieldTabVisible(frm, fieldname)) {
				mountFn();
			}
			return true;
		};

		if (attach()) {
			return;
		}

		// Layout/tabs may not be ready on the first refresh tick.
		setTimeout(() => {
			attach();
		}, 0);
	}

	project_workload_assignment.getFieldTab = getFieldTab;
	project_workload_assignment.isFieldTabVisible = isFieldTabVisible;
	project_workload_assignment.bindLazyTabMount = bindLazyTabMount;
})();
