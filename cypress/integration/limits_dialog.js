Cypress.removeAllListeners("uncaught:exception");
Cypress.on("uncaught:exception", (error) => {
	// Native ResizeObserver may finish on the next frame after viewport changes.
	if (error.message.includes("ResizeObserver loop completed with undelivered notifications."))
		return false;
});
import { seed, cleanup, helper, dialog, openList, total, close } from "../support/limits_dialog";
let fixture;
context("Shared work-effort limit details", () => {
	before(() =>
		seed().then((value) => {
			fixture = value;
		})
	);
	after(cleanup);
	it("distinguishes required and optional missing plans", () => {
		openList(fixture);
		for (const required of [true, false]) {
			cy.call(`${helper}.set_limits_case`, { required: required ? 1 : 0, empty_plan: 1 });
			cy.get(".dinext-utp-list .plan-fact-button").click();
			total(fixture).should("contain", "322.0");
			cy.get(`${dialog} .alert-danger`).should(required ? "be.visible" : "not.exist");
			close();
		}
	});
	it("respects forecast visibility, runtime themes and narrow viewports", () => {
		openList(fixture);
		cy.call(`${helper}.set_limits_case`);
		for (const theme of ["light", "dark"]) {
			cy.window().then((win) => {
				win.frappe.ui.set_theme(theme);
				win.frappe.boot.dinext_timesheet_show_forecast = true;
			});
			cy.get(".dinext-utp-list .plan-fact-button").click();
			cy.get(`${dialog} thead`).should("contain", "Forecast");
			cy.get(`${dialog} thead th`).should(($headers) => {
				expect([...$headers].map((cell) => cell.textContent.trim())).to.deep.eq([
					"Status",
					"Plan",
					"Forecast",
					"Fact",
					"% Complete",
				]);
			});
			cy.get(`${dialog} .pwa-plan-fact-progress`)
				.first()
				.should(($bar) => {
					const rect = $bar[0].getBoundingClientRect();
					expect(rect.height).to.eq(20);
					expect(rect.width).to.be.greaterThan(200);
				});
			cy.get(`${dialog} tr[data-status="Pending Approval"] .progress-bar`)
				.should("contain", "1%")
				.and("have.class", "progress-bar-success");
			cy.get(`${dialog} tbody tr`).should(($rows) => {
				expect([...$rows].map((row) => row.dataset.status)).to.deep.eq([
					"total",
					"Approved",
					"Pending Approval",
					"Editing",
				]);
			});
			total(fixture)
				.should("contain", "280.0")
				.and("contain", "300.0")
				.and("contain", "322.0");
			cy.get(`${dialog} .pwa-plan-fact-note`).should("contain", fixture.parent_subject);
			cy.screenshot(`shared-limits-${theme}`, { capture: "viewport" });
			cy.viewport(360, 800);
			cy.get(`${dialog} .modal-dialog`).should(($element) => {
				const box = $element[0].getBoundingClientRect();
				expect(box.width).to.be.at.most(360);
				expect(box.left).to.be.at.least(0);
				expect(box.right).to.be.at.most(361);
			});
			cy.get(`${dialog} .pwa-plan-fact-scroll`)
				.first()
				.should(($element) => {
					expect($element[0].scrollWidth).to.be.greaterThan($element[0].clientWidth);
				});
			close();
			cy.viewport(1440, 900);
			cy.window().then((win) => {
				win.frappe.boot.dinext_timesheet_show_forecast = false;
			});
			cy.get(".dinext-utp-list .plan-fact-button").click();
			cy.get(`${dialog} thead`).should("not.contain", "Forecast");
			close();
		}
	});
});
