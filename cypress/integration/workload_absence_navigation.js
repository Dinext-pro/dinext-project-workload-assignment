const day = "2026-11-09";
const absences = [
	{ name: "AFL-LEGACY", email: "legacy@example.test", status: "Согласовано" },
	{ name: "AFL-CURRENT", email: "current@example.test", status: "Approved" },
];

context("Workload report absence navigation", () => {
	it("opens legacy and current approved absences from the daily cells", () => {
		cy.login();
		cy.openDesk();
		cy.get(".layout-main-section:visible").last().then(async ($section) => {
			const section = $section[0];
			const win = section.ownerDocument.defaultView;
			const { frappe } = win;
			await frappe.require(["workload-reports-common.bundle.js"]);
			cy.stub(frappe.db, "get_list")
				.callThrough()
				.withArgs("Application For Leave")
				.callsFake((_doctype, { filters }) => {
					const [, , email] = filters.find(([field]) => field === "lauser");
					const [, operator, values] = filters.find(([field]) => field === "status");
					const statuses = operator === "in" ? values : [values];
					expect(filters).to.deep.include(["alfrom_date", "<=", day]);
					expect(filters).to.deep.include(["alto_date", ">=", day]);
					return Promise.resolve(
						absences.filter((row) => row.email === email && statuses.includes(row.status))
					);
				});
			cy.stub(frappe, "set_route").as("absenceRoute");
			const host = win.document.createElement("div");
			host.id = "workload-absence-grid";
			section.append(host);
			const common = win.project_workload_assignment.workloadReports.common;
			await common.loadTable(
				host,
				async () => ({
					periods: [{ key: day, date: day }],
					rows: absences.map(({ name, email }) => ({
						id: name,
						label: email,
						email,
						kind: "absence",
						absences: [{ from_date: day, to_date: day, type: "Vacation" }],
					})),
				}),
				{ viewType: "daily" }
			);
		});
		absences.forEach(({ name }, index) => {
			cy.get(`#workload-absence-grid .wr-nav-pointer[col-id="hours_${day}"]`)
				.eq(index)
				.dblclick();
			cy.get("@absenceRoute").should("have.been.calledWithExactly", "Form", "Application For Leave", name);
		});
	});
});
