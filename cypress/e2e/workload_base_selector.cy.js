/**
 * ISS-2026-03483: report has 3 bases (default By Project); Project tab has plan/forecast only.
 * Static fixture — no ERP credentials (CI.md read-only acceptance).
 */
describe("workload_base selector", () => {
	beforeEach(() => {
		cy.visit("/cypress/fixtures/workload_base_selector.html");
	});

	it("report select offers By Project / From Plan / From Forecast", () => {
		cy.get("#report-workload-base option").should("have.length", 3);
		cy.get("#report-workload-base option")
			.then(($opts) => [...$opts].map((o) => o.value))
			.should("deep.equal", ["По проекту", "От плана", "От прогноза"]);
		cy.get("#report-workload-base").should("have.value", "По проекту");
	});

	it("project select offers only From Plan / From Forecast", () => {
		cy.get("#project-workload-base option").should("have.length", 2);
		cy.get("#project-workload-base option")
			.then(($opts) => [...$opts].map((o) => o.value))
			.should("deep.equal", ["От плана", "От прогноза"]);
	});

	it("can switch report base to From Forecast", () => {
		cy.get("#report-workload-base").select("От прогноза");
		cy.get("#report-workload-base").should("have.value", "От прогноза");
	});
});
