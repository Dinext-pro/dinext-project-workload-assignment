/**
 * dinext_kanban (Quick Kanban): open PWA dialog on assign avatar / "+" click.
 * Capture-phase required — Assignments.vue stops propagation in bubble phase.
 */
(function () {
	const PWA_DOCTYPES = new Set(["Task", "Issue"]);

	function get_kanban_doctype() {
		return (
			window.cur_list?.doctype ||
			window.__quickKanbanStore?.state?.config?.ref_doctype ||
			null
		);
	}

	function refresh_kanban_card(cardName) {
		const store = window.__quickKanbanStore;
		if (store?.dispatch && cardName) {
			store.dispatch("refreshCard", { cardName });
			return;
		}
		window.refreshKanbanBoard?.();
	}

	function open_fallback_assign(doctype, docname) {
		if (!frappe.ui?.form?.AssignToDialog) return;
		const dialog = new frappe.ui.form.AssignToDialog({
			method: "frappe.desk.form.assign_to.add",
			doctype,
			docname,
			callback: () => refresh_kanban_card(docname),
		});
		dialog.dialog.show();
	}

	function open_pwa_for_task(task, cardName) {
		if (!task?.project || typeof start_pwa_dialog !== "function") {
			return false;
		}
		start_pwa_dialog(() => refresh_kanban_card(cardName), {
			name: task.name,
			project: task.project,
			exp_start_date: task.exp_start_date,
			exp_end_date: task.exp_end_date,
		});
		return true;
	}

	function resolve_task(doctype, docname) {
		if (doctype === "Task") {
			return frappe.db
				.get_value("Task", docname, [
					"name",
					"project",
					"exp_start_date",
					"exp_end_date",
				])
				.then((r) => r.message || null);
		}

		return frappe.db
			.get_list("Task", {
				fields: ["name", "project", "exp_start_date", "exp_end_date"],
				filters: { custom_linked_issue: docname },
				limit: 1,
			})
			.then((records) => (records && records.length ? records[0] : null));
	}

	function handle_assign_click(e) {
		const block = e.target.closest?.("#kanbanapp .assignments-block");
		if (!block) return;

		const hit = e.target.closest?.(
			".avatar, .avatar-extra-count, .avatar-action"
		);
		if (!hit) return;

		const doctype = get_kanban_doctype();
		if (!PWA_DOCTYPES.has(doctype)) return;

		const card = e.target.closest?.("article.kanban-card[data-card-name]");
		const docname = card?.getAttribute("data-card-name");
		if (!docname) return;

		e.preventDefault();
		e.stopPropagation();

		resolve_task(doctype, docname).then((task) => {
			if (open_pwa_for_task(task, docname)) return;
			open_fallback_assign(doctype, docname);
		});
	}

	document.addEventListener("click", handle_assign_click, true);
})();
