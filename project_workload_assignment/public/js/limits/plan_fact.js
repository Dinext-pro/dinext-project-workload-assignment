(function () {
	frappe.provide("project_workload_assignment.plan_fact_details");
	const details = project_workload_assignment.plan_fact_details;
	if (details.show) return;

	const escape = (value) => frappe.utils.escape_html(String(value ?? ""));
	const number = (value) => {
		const parsed = Number.parseFloat(value);
		return Number.isFinite(parsed) ? parsed : 0;
	};
	const hours = (value) => number(value).toFixed(1);
	const translated = (key, args) => escape(__(key, args));

	const statusOrder = ["Approved", "Pending Approval", "Editing", "Rejected"];
	function compareStatus(left, right) {
		const a = statusOrder.indexOf(left);
		const b = statusOrder.indexOf(right);
		return (
			(a < 0 ? statusOrder.length : a) - (b < 0 ? statusOrder.length : b) ||
			left.localeCompare(right)
		);
	}

	function percentCell(result, status) {
		if (number(result.planned_hours) <= 0) return '<span class="text-muted">—</span>';
		const value =
			status === "total"
				? result.display_completion_percentage ?? result.completion_percentage
				: result.status_percentages?.[status];
		if (value == null) return '<span class="text-muted">—</span>';
		const percent = number(value);
		const width = Math.max(0, Math.min(percent, 100));
		return `<div class="progress pwa-plan-fact-progress" role="progressbar"
			aria-valuenow="${width}" aria-valuemin="0" aria-valuemax="100" aria-valuetext="${escape(
			percent
		)}%">
			<div class="progress-bar ${percent > 100 ? "progress-bar-danger" : "progress-bar-success"}"
				style="width: ${width}%">${escape(percent)}%</div>
		</div>`;
	}

	function completionTable(result, showForecast) {
		const rows = [
			{ status: "total", value: number(result.total_hours ?? result.hours_data?.total) },
		];
		for (const [status, raw] of Object.entries(result.hours_data || {})) {
			if (["total", "users", "user_hours"].includes(status)) continue;
			if (!["number", "string"].includes(typeof raw) || !Number.isFinite(Number(raw)))
				continue;
			rows.push({ status, value: number(raw) });
		}
		rows.sort((left, right) => {
			if (left.status === "total") return -1;
			if (right.status === "total") return 1;
			return compareStatus(left.status, right.status);
		});
		return `<div class="pwa-plan-fact-scroll">
			<table class="table table-bordered pwa-plan-fact-table">
				<colgroup>${(showForecast ? [25, 15, 15, 15, 30] : [30, 20, 20, 30])
					.map((width) => `<col style="width: ${width}%">`)
					.join("")}</colgroup>
				<thead><tr><th>${translated("Status")}</th><th>${translated("Plan")}</th>
				${showForecast ? `<th>${translated("Forecast")}</th>` : ""}
				<th>${translated("Fact")}</th><th>${translated("% Complete")}</th></tr></thead>
				<tbody>${rows
					.map(
						({ status, value }) => `<tr data-status="${escape(status)}"${
							status === "total" ? ' class="pwa-plan-fact-total"' : ""
						}>
					<td>${translated(status === "total" ? "All" : status)}</td>
					<td>${hours(result.planned_hours)}</td>
					${showForecast ? `<td>${hours(result.forecast_hours)}</td>` : ""}
					<td>${hours(value)} ${translated("h.")}</td>
					<td>${percentCell(result, status)}</td>
				</tr>`
					)
					.join("")}</tbody>
			</table>
		</div>`;
	}

	function warning(result) {
		if (result.plan_required && number(result.planned_hours) <= 0) {
			return `<div class="alert alert-danger pwa-plan-fact-warning">
				<strong>${translated("Attention!")}</strong>
				${translated("Planned work efforts are required for this task!")}
			</div>`;
		}
		if (
			!["block", "warning", "message"].includes(result.status) ||
			number(result.planned_hours) <= 0
		)
			return "";
		const severity = result.status === "block" ? "danger" : "warning";
		return `<div class="alert alert-${severity} pwa-plan-fact-warning">
			<strong>${translated("Work effort limit exceeded")}</strong>
			<span>${hours(result.total_hours)} ${translated("h.")} (${escape(
			result.display_completion_percentage ?? result.completion_percentage
		)}%)</span>
			${
				number(result.limit) > 0
					? `<span>${translated("Limit")}: ${hours(
							(number(result.planned_hours) * number(result.limit)) / 100
					  )} ${translated("h.")} (${escape(result.limit)}%)</span>`
					: ""
			}
		</div>`;
	}

	function ownerHours(result, ownerName) {
		if (!ownerName) return "";
		const values = result.hours_data?.user_hours?.[ownerName] || {};
		const statuses = Object.entries(values).filter(
			([key, value]) => key !== "total" && typeof value === "number"
		);
		statuses.sort(([left], [right]) => compareStatus(left, right));
		const summary = result.user_totals?.[ownerName];
		const total = number(summary?.total_hours);
		if (!total) return "";
		const percent =
			number(result.planned_hours) > 0
				? ` (${escape(summary.completion_percentage)}% ${translated("of plan")})`
				: "";
		return `<div class="pwa-plan-fact-owner">
			<strong>${escape(ownerName)}:</strong> ${hours(total)} ${translated("h.")}${percent}
			${
				statuses.length
					? `<small>${statuses
							.map(
								([key, value]) =>
									`${translated(key)}: ${hours(value)} ${translated("h.")}`
							)
							.join(" · ")}</small>`
					: ""
			}
		</div>`;
	}

	function notes(result) {
		const scope = result.used_children_for_actual
			? translated("Fact data: including other child tasks ({0})", [
					result.child_tasks_count,
			  ])
			: translated("Fact data: current task only");
		const users = Array.isArray(result.hours_data?.users)
			? [...new Set(result.hours_data.users)].sort((a, b) =>
					String(a).localeCompare(String(b))
			  )
			: [];
		let html = `<p class="pwa-plan-fact-note">${scope}</p>`;
		if (users.length)
			html += `<p class="pwa-plan-fact-note">${translated("Hours included from:")} ${users
				.map(escape)
				.join(", ")}</p>`;
		if (number(result.planned_hours) > 0) {
			html += `<p class="pwa-plan-fact-note">${translated(
				"Planned data is defined at:"
			)} ${escape(result.plan_task_subject || result.task_subject)}</p>`;
			const sources = Array.isArray(result.plan_sources) ? result.plan_sources : [];
			if (sources.length)
				html += `<div class="pwa-plan-fact-note">${translated("Plan sources:")}
				<ul>${sources
					.map(
						(source) =>
							`<li>${escape(source.subject || source.task_name)}: ${hours(
								source.planned_hours
							)} ${translated("h.")}</li>`
					)
					.join("")}</ul>
			</div>`;
		}
		return html;
	}

	details.show = async function ({ results, title, ownerName = "" }) {
		const data = Array.isArray(results)
			? results.filter((row) => row && typeof row === "object")
			: [];
		if (!data.length) {
			frappe.msgprint(__("No work efforts data"));
			return null;
		}
		data.sort((a, b) => String(a.role || "").localeCompare(String(b.role || "")));
		await frappe.require("/assets/project_workload_assignment/css/limits_dialog.css");
		const forecast = Boolean(frappe.boot?.dinext_timesheet_show_forecast);
		const dialog = new frappe.ui.Dialog({
			title: escape(title || data[0].task_subject || __("Plan / Fact")),
			size: "large",
			fields: [{ fieldname: "body", fieldtype: "HTML" }],
			primary_action_label: __("Close"),
			primary_action() {
				dialog.hide();
				document.activeElement?.blur?.();
			},
		});
		dialog.$wrapper.addClass("pwa-plan-fact-dialog");
		dialog.fields_dict.body.$wrapper.html(`<div class="pwa-plan-fact">
			${data
				.map(
					(result) => `<section class="pwa-plan-fact-role" data-role="${escape(
						result.role
					)}">
				<div class="pwa-plan-fact-context">
					${result.role ? `<strong>${translated("Role")}: ${escape(result.role)}</strong>` : ""}
					${result.project ? `<span>${translated("Project")}: ${escape(result.project)}</span>` : ""}
				</div>
				${warning(result)}${completionTable(result, forecast)}${ownerHours(result, ownerName)}${notes(
						result
					)}
			</section>`
				)
				.join("")}
		</div>`);
		dialog.$wrapper.on("hidden.bs.modal", () => dialog.$wrapper.remove());
		dialog.show();
		return dialog;
	};
})();
