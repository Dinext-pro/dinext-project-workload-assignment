export const helper = "dinext_timesheets.tests.limits_dialog_ui";
export const dialog = ".pwa-plan-fact-dialog:visible";

export function seed() {
	cy.login();
	cy.openDesk("/app");
	return cy
		.call(`${helper}.seed_limits_dialog`, {}, { timeout: 180000 })
		.then((res) => res.body.message);
}

export function cleanup() {
	cy.login();
	cy.openDesk("/app");
	cy.call(`${helper}.cleanup_limits_dialog`, {}, { timeout: 180000 });
}

export function openList(fixture) {
	cy.login(fixture.owner, fixture.password);
	cy.openDesk(`/app/user-timesheet-position?name=${encodeURIComponent(fixture.position)}`);
	cy.get(`.dinext-utp-list .plan-fact-button[data-docname="${fixture.position}"]`).should(
		"be.visible"
	);
}

export function openForm(fixture) {
	cy.login(fixture.owner, fixture.password);
	cy.openDesk(`/app/user-timesheet/${encodeURIComponent(fixture.timesheet)}`);
	cy.window().should((win) => {
		expect(win.cur_frm?.doc?.name).to.eq(fixture.timesheet);
		expect(win.cur_frm.ut?.table?.api).to.exist;
	});
}

export function formControl(fixture) {
	cy.window().then((win) => {
		const api = win.cur_frm.ut.table.api;
		const node = api.getRowNode(fixture.position);
		expect(node, "position row").to.exist;
		api.ensureNodeVisible(node, "middle");
	});
	return cy.get(`.ag-row[row-id="${fixture.position}"] [col-id="limit_icon"] button`).first();
}

export function role(fixture, name = fixture.role) {
	return cy.get(`${dialog} .pwa-plan-fact-role[data-role="${name}"]`);
}

export function total(fixture, name = fixture.role) {
	return role(fixture, name).find('tr[data-status="total"]');
}

export function close() {
	cy.window().should((win) => {
		expect(win.cur_dialog?.display, "modal opening transition completed").to.eq(true);
		expect(win.cur_dialog.$wrapper.hasClass("pwa-plan-fact-dialog")).to.eq(true);
	});
	cy.get(`${dialog} .modal-footer .btn-primary`).click();
	cy.get(dialog).should("not.exist");
}
