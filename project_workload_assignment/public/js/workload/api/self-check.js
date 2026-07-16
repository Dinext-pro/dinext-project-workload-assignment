import { adaptTeamGridResponse, adaptUserProjectsResponse } from "./adapt-report.js";
import { TEAM_GRID_SAMPLE, USER_PROJECTS_SAMPLE } from "./_fixtures/sample-team-grid.js";

export function selfCheck() {
	const errors = [];
	const grid = adaptTeamGridResponse(TEAM_GRID_SAMPLE);
	const children = adaptUserProjectsResponse(
		USER_PROJECTS_SAMPLE,
		"alice@example.com"
	);

	if (!grid.periods.length) errors.push("no periods");
	if (grid.rows.length !== 2) errors.push(`expected 2 user roots, got ${grid.rows.length}`);

	const alice = grid.rows[0];
	if (!alice || alice.id !== "user:alice@example.com") {
		errors.push(`bad alice id: ${alice && alice.id}`);
	}
	if (alice && alice.hours_workload_2026_week_1 !== 16) {
		errors.push(`hours mismatch: ${alice && alice.hours_workload_2026_week_1}`);
	}
	if (alice && alice.fact_hours_workload_2026_week_1 !== 10) {
		errors.push(`fact mismatch: ${alice && alice.fact_hours_workload_2026_week_1}`);
	}
	if (alice && !alice.hasChildren) errors.push("alice should hasChildren");
	if (alice && alice.children && alice.children.length !== 0) {
		errors.push("alice children should be empty (lazy)");
	}

	if (children.length !== 1) errors.push(`expected 1 project child, got ${children.length}`);
	if (children[0] && children[0].id !== "project:alice@example.com:PROJ-1") {
		errors.push(`bad project id: ${children[0] && children[0].id}`);
	}

	const ok = errors.length === 0;
	if (ok) {
		console.log("[workload.api.selfCheck] OK", { grid, children });
	} else {
		console.warn("[workload.api.selfCheck] FAIL", errors, { grid, children });
	}
	return { ok, grid, children, errors };
}
