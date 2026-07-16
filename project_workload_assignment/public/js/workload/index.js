import { onPageLoad } from "./report/page.js";
import { ReportSession } from "./session/report.js";
import {
	ProjectSession,
	mountProjectSession,
	refreshProjectSession,
} from "./session/project.js";
import { getSession } from "./session/base.js";
import { SURFACE_REPORT, SURFACE_PROJECT } from "./constants.js";
import * as api from "./api/index.js";
import { useLegacyWorkload } from "./project/legacy-gate.js";

frappe.provide("project_workload_assignment.workload");

let ready = false;

project_workload_assignment.workload = {
	ReportSession,
	ProjectSession,
	getSession,
	report: {
		onPageLoad,
		refresh(ctx) {
			const host = ctx?.host || ctx?.state?.wrapper || ctx?.wrapper;
			const session = getSession(host);
			if (session instanceof ReportSession) {
				return session.reload(ctx?.filterArgs);
			}
			return null;
		},
	},
	project: {
		mount: mountProjectSession,
		refresh: refreshProjectSession,
		useLegacyWorkload,
	},
	constants: {
		SURFACE_REPORT,
		SURFACE_PROJECT,
	},
	api,
	isReady() {
		return ready;
	},
};

ready = true;

export { onPageLoad, ReportSession, ProjectSession, getSession };
