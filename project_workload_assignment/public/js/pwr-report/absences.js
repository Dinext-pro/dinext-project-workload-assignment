/* ISS-2026-00002 Phase 3a: absence UI and row helpers for Projects Workload Report. */
frappe.provide("project_workload_assignment.pwrReport");

(function () {
	const NS = project_workload_assignment.pwrReport;

	async function openUserAbsence(userEmail, dateStr) {
		if (!userEmail || !dateStr) {
			console.log("No user email or date provided");
			frappe.msgprint(
				__("User and date must be specified to open absence request")
			);
			return;
		}

		console.log("Opening user absence for:", userEmail, "on date:", dateStr);

		try {
			const absences = await frappe.db.get_list("Application For Leave", {
				fields: ["name", "alfrom_date", "alto_date"],
				filters: [
					["lauser", "=", userEmail],
					["status", "=", "Согласовано"],
					["alfrom_date", "<=", dateStr],
					["alto_date", ">=", dateStr],
				],
				limit: 1,
			});

			if (absences && absences.length > 0) {
				const absence = absences[0];
				console.log("Found absence:", absence.name, "for date:", dateStr);
				frappe.set_route("Form", "Application For Leave", absence.name);
			} else {
				console.log("No absence found for user:", userEmail, "on date:", dateStr);
				frappe.msgprint(
					__("No absence request found for user {0} on date {1}", [
						userEmail,
						dateStr,
					])
				);
			}
		} catch (error) {
			console.error("Error fetching absence data:", error);
			frappe.msgprint(__("Error searching for absence request"));
		}
	}

	function isUserAbsentOnDate(userEmail, date, userAbsences) {
		if (!userAbsences || !userAbsences[userEmail]) {
			return null;
		}

		const userAbsenceList = userAbsences[userEmail];
		const targetDate = date;

		for (const absence of userAbsenceList) {
			if (!absence.from_date || !absence.to_date) continue;

			if (targetDate >= absence.from_date && targetDate <= absence.to_date) {
				return {
					isAbsent: true,
					type: absence.type || __("Absence"),
					alfrom_hours: absence.alfrom_hours,
					alto_hours: absence.alto_hours,
				};
			}
		}

		return null;
	}

	function formatAbsenceText(absenceType) {
		return __("Abs.");
	}

	function createAbsenceRow(userRow, userAbsenceData) {
		return {
			participant: __("Absences"),
			_isAbsenceRow: true,
			_email: userRow._email,
			_absences: userAbsenceData || [],
			_parent: userRow.participant,
			_treeDepth: 1,
			indent: 1,
			expandable: false,
		};
	}

	function addAbsenceRowsToTableData(table_data, userAbsences) {
		if (!table_data || !userAbsences) return table_data;

		const newTableData = [];
		let currentUser = null;
		let userProjects = [];

		console.log("Adding absence rows to table data as child elements...");

		for (let i = 0; i < table_data.length; i++) {
			const row = table_data[i];

			if (row._isUser && row._email) {
				if (currentUser) {
					newTableData.push(...userProjects);

					if (
						userAbsences[currentUser._email] &&
						userAbsences[currentUser._email].length > 0
					) {
						const absenceRow = createAbsenceRow(
							currentUser,
							userAbsences[currentUser._email]
						);
						newTableData.push(absenceRow);
					}
				}

				currentUser = row;
				userProjects = [];
				newTableData.push(row);
			} else if (row._isProject && currentUser) {
				row._absences = userAbsences[currentUser._email] || [];
				row._email = currentUser._email;
				userProjects.push(row);
			} else {
				newTableData.push(row);
			}
		}

		if (currentUser) {
			newTableData.push(...userProjects);

			if (
				userAbsences[currentUser._email] &&
				userAbsences[currentUser._email].length > 0
			) {
				const absenceRow = createAbsenceRow(
					currentUser,
					userAbsences[currentUser._email]
				);
				newTableData.push(absenceRow);
			}
		}

		console.log(
			"Added absence rows as child elements. Original rows:",
			table_data.length,
			"New rows:",
			newTableData.length
		);
		return newTableData;
	}

	function hasInformativeAbsences(absences) {
		return absences.some(
			(absence) => absence.alfrom_hours || absence.alto_hours
		);
	}

	function findUserAbsencesInCache(userEmail) {
		const tableData = NS.state.tableData;
		if (!tableData || !userEmail) return null;

		const userRow = tableData.find(
			(row) =>
				row._isUser &&
				row._email === userEmail &&
				row._absences &&
				row._absences.length > 0
		);

		return userRow ? userRow._absences : null;
	}

	function getAvailableHoursOnDate(data, dateStr, baseHours) {
		if (!data || !data._email) {
			return baseHours;
		}

		let userAbsences = data._absences || [];

		if (userAbsences.length === 0 || !hasInformativeAbsences(userAbsences)) {
			const userAbsencesFromCache = findUserAbsencesInCache(data._email);
			if (userAbsencesFromCache && userAbsencesFromCache.length > 0) {
				userAbsences = userAbsencesFromCache;
			}
		}

		if (!userAbsences || userAbsences.length === 0) {
			return baseHours;
		}

		const targetDate = dateStr;

		for (const absence of userAbsences) {
			if (!absence.from_date || !absence.to_date) continue;

			if (targetDate >= absence.from_date && targetDate <= absence.to_date) {
				if (targetDate === absence.from_date && absence.alfrom_hours) {
					const absenceHours = parseFloat(absence.alfrom_hours) || 0;
					return Math.max(0, baseHours - absenceHours);
				} else if (targetDate === absence.to_date && absence.alto_hours) {
					const absenceHours = parseFloat(absence.alto_hours) || 0;
					return Math.max(0, baseHours - absenceHours);
				} else {
					console.log(`   ✅ Full absence in middle: 0h available`);
					return 0;
				}
			}
		}

		return baseHours;
	}

	Object.assign(NS, {
		openUserAbsence,
		isUserAbsentOnDate,
		formatAbsenceText,
		createAbsenceRow,
		addAbsenceRowsToTableData,
		hasInformativeAbsences,
		findUserAbsencesInCache,
		getAvailableHoursOnDate,
	});
	project_workload_assignment.pwrBoot?.log?.("pwr-report/absences.js");
})();
