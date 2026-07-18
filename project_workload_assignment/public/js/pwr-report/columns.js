/* ISS-2026-00002 Phase 3a: AG Grid column definitions for Projects Workload Report. */
frappe.provide("project_workload_assignment.pwrReport");

(function () {
	const NS = project_workload_assignment.pwrReport;
	const S = () => NS.state;

	function formatMonthHeader(year, month) {
		const monthNames = [
			__("Jan"),
			__("Feb"),
			__("Mar"),
			__("Apr"),
			__("May"),
			__("Jun"),
			__("Jul"),
			__("Aug"),
			__("Sep"),
			__("Oct"),
			__("Nov"),
			__("Dec"),
		];

		return `${monthNames[month - 1]}<br><small>${year}</small>`;
	}

	function formatWeekHeader(period) {
		const startDate = frappe.datetime.str_to_obj(period.start_date);
		const endDate = frappe.datetime.str_to_obj(period.end_date);

		const formatDayMonth = (date) => {
			const day = date.getDate();
			const month = date.getMonth() + 1;
			return `${day}.${month}`;
		};

		const startStr = formatDayMonth(startDate);
		const endStr = formatDayMonth(endDate);

		return `${startStr}<br><small>${endStr}</small>`;
	}

	function formatDateHeader(dateString) {
		if (!dateString) return "";

		const dateObj = frappe.datetime.str_to_obj(dateString);
		const dayNames = [
			__("Sun"),
			__("Mon"),
			__("Tue"),
			__("Wed"),
			__("Thu"),
			__("Fri"),
			__("Sat"),
		];

		const dayMonth = frappe.datetime.str_to_user(dateString).split("-").slice(0, 2).join(".");
		const weekday = dayNames[dateObj.getDay()];

		return `${dayMonth}<br><small>${weekday}</small>`;
	}

	function get_projects_workload_columns_definition(periods) {
		const columns = [];
		const viewType = S().viewType;

		columns.push({
			name: __("Participant / Project"),
			id: "participant",
			width: 220,
			sortable: true,
			editable: false,
			focusable: false,
			treeView: true,
			format: (value, row, column, data) => {
				if (!data) {
					return `<div class="projects-workload-cell pwr-participant-cell"></div>`;
				}

				if (data._isProject) {
					return `<div class="projects-workload-cell pwr-participant-cell project-display">
						<div class="project-name">${data.project || __("No Project")}</div>
					</div>`;
				} else if (data._isLazyPlaceholder) {
					return `<div class="projects-workload-cell pwr-participant-cell project-display projects-workload-lazy-placeholder">
						<div class="project-name text-muted">${__("Loading projects...")}</div>
					</div>`;
				} else if (data._isAbsenceRow) {
					return `<div class="projects-workload-cell pwr-participant-cell project-display">
						<div class="project-name">${__("Absences")}</div>
					</div>`;
				} else {
					const userData = data.user_data || {};
					const fullName = userData.full_name || value;
					const email = userData.email || value;
					const userImage = userData.user_image;
					const buildAvatar =
						(window.ProjectsWorkloadAgGrid &&
							window.ProjectsWorkloadAgGrid.buildUserAvatarHtml) ||
						function (name, image, prefix) {
							const initial = ((name && name.charAt(0)) || "U").toUpperCase();
							if (!image) {
								return `<div class="${prefix}-placeholder">${initial}</div>`;
							}
							return `<span class="${prefix}-wrap"><img src="${image}" class="${prefix}" alt="${name}" onerror="this.style.display='none';var p=this.parentElement&&this.parentElement.querySelector('.${prefix}-placeholder');if(p)p.classList.add('pwr-avatar-visible');"><div class="${prefix}-placeholder">${initial}</div></span>`;
						};
					if (!data._cachedAvatarHtml || data._cachedAvatarSrc !== userImage) {
						data._cachedAvatarSrc = userImage;
						data._cachedAvatarHtml = buildAvatar(
							fullName,
							userImage,
							"projects-user-avatar"
						);
					}
					const avatarHtml = data._cachedAvatarHtml;

					return `<div class="projects-workload-cell pwr-participant-cell">
						<div class="projects-user-display">
							${avatarHtml}
							<div class="projects-user-info">
								<div class="projects-user-fullname" title="${fullName}">${fullName}</div>
								<div class="projects-user-email" title="${email}">${email}</div>
							</div>
						</div>
					</div>`;
				}
			},
		});

		periods.forEach((period) => {
			let columnName = "";

			if (viewType === "daily") {
				columnName = formatDateHeader(period.date);
			} else if (viewType === "weekly") {
				columnName = formatWeekHeader(period);
			} else {
				columnName = formatMonthHeader(period.year, period.month);
			}

			columns.push({
				name: columnName,
				id: period.key,
				width: 55,
				sortable: false,
				editable: false,
				focusable: false,
				format: (value, row, column, data) => {
					if (!data) {
						return `<div class="projects-workload-cell"></div>`;
					}

					if (data._isLazyPlaceholder) {
						return `<div class="projects-workload-cell"></div>`;
					}

					if (viewType === "daily") {
						const holidaysToUse = NS.getHolidaysForRow(data, period);
						const isNonWorking = NS.isNonWorkingDay(period.date, holidaysToUse);

						if (isNonWorking) {
							const projectHolidays = data._projectHolidays || [];
							const userHolidays = data._userHolidays || [];

							const isProjectHoliday = NS.isNonWorkingDay(
								period.date,
								projectHolidays
							);
							const isUserHoliday = NS.isNonWorkingDay(period.date, userHolidays);

							let tooltip = __("Project Holiday");

							if (isUserHoliday && !isProjectHoliday) {
								tooltip = __("User Holiday");
							} else if (isUserHoliday && isProjectHoliday) {
								tooltip = __("Project & User Holiday");
							}

							return `<div class="projects-workload-cell projects-weekend-cell" title="${tooltip}"></div>`;
						}
					}

					if (data._isAbsenceRow) {
						if (data._email && data._absences && data._absences.length > 0) {
							const userAbsence = NS.isUserAbsentOnDate(data._email, period.date, {
								[data._email]: data._absences,
							});
							if (userAbsence && userAbsence.isAbsent) {
								const displayText = NS.formatAbsenceText(userAbsence.type);
								const tooltipText = userAbsence.type || __("Absence");
								return `
									<div class="projects-workload-cell projects-absence-cell" title="${tooltipText}">
										<div class="projects-absence-text">${displayText}</div>
									</div>
								`;
							}
						}

						return `<div class="projects-workload-cell"></div>`;
					}

					let hours = parseFloat(value) || 0;
					let percentage = 0;
					let tooltip = "";
					let availableHours = 0;

					if (viewType === "daily") {
						const workingHours = data._workingHours || {};
						const baseHours = workingHours[period.date] || 8;
						availableHours = NS.getAvailableHoursOnDate(
							data,
							period.date,
							baseHours
						);

						if (availableHours > 0) {
							percentage = Math.round((hours / availableHours) * 100);
						}

						const tooltipParts = [];
						tooltipParts.push(
							`${__("Base working hours")}: ${baseHours.toFixed(1)}h`
						);

						if (availableHours !== baseHours) {
							const absenceHours = baseHours - availableHours;
							tooltipParts.push(
								`${__("Absence hours")}: ${absenceHours.toFixed(1)}h`
							);
							tooltipParts.push(
								`${__("Available hours")}: ${availableHours.toFixed(1)}h`
							);
						}

						tooltipParts.push(
							`${__("Workload")}: ${hours.toFixed(1)}h (${percentage}%)`
						);

						tooltip = tooltipParts.join("\n");
					} else if (viewType === "weekly") {
						availableHours = 40;

						if (data._workingHours && period.start_date && period.end_date) {
							let calculatedHours = 0;
							let currentDate = new Date(period.start_date);
							const endDate = new Date(period.end_date);
							const holidaysToUse = NS.getHolidaysForRow(data, period);

							while (currentDate <= endDate) {
								const dateString = frappe.datetime.obj_to_str(currentDate);

								const isNonWorking = NS.isNonWorkingDay(
									dateString,
									holidaysToUse
								);

								if (!isNonWorking) {
									const workingHours = data._workingHours || {};
									const userHoursOnDate = workingHours[dateString];
									const baseHours =
										userHoursOnDate !== undefined ? userHoursOnDate : 8;
									const availableOnDate = NS.getAvailableHoursOnDate(
										data,
										dateString,
										baseHours
									);
									calculatedHours = calculatedHours + availableOnDate;
								}
								currentDate.setDate(currentDate.getDate() + 1);
							}

							if (calculatedHours > 0) {
								availableHours = calculatedHours;
							}
						}

						if (availableHours > 0) {
							percentage = Math.round((hours / availableHours) * 100);
						}
						tooltip = `${__("Weekly available hours")}: ${availableHours.toFixed(1)}h\n${__("Workload")}: ${hours.toFixed(1)}h (${percentage}%)`;
					} else {
						availableHours = 160;

						if (data._workingHours && period.start_date && period.end_date) {
							let calculatedHours = 0;
							let currentDate = new Date(period.start_date);
							const endDate = new Date(period.end_date);
							const holidaysToUse = NS.getHolidaysForRow(data, period);

							while (currentDate <= endDate) {
								const dateString = frappe.datetime.obj_to_str(currentDate);

								const isNonWorking = NS.isNonWorkingDay(
									dateString,
									holidaysToUse
								);

								if (!isNonWorking) {
									const workingHours = data._workingHours || {};
									const userHoursOnDate = workingHours[dateString];
									const baseHours =
										userHoursOnDate !== undefined ? userHoursOnDate : 8;
									const availableOnDate = NS.getAvailableHoursOnDate(
										data,
										dateString,
										baseHours
									);
									calculatedHours = calculatedHours + availableOnDate;
								}
								currentDate.setDate(currentDate.getDate() + 1);
							}

							if (calculatedHours > 0) {
								availableHours = calculatedHours;
							}
						}

						if (availableHours > 0) {
							percentage = Math.round((hours / availableHours) * 100);
						}
						tooltip = `${__("Monthly available hours")}: ${availableHours.toFixed(1)}h\n${__("Workload")}: ${hours.toFixed(1)}h (${percentage}%)`;
					}

					if (NS.isPwrShowFactEnabled()) {
						const periodKey = (column && column.id) || period.key;
						const actualHours = parseFloat(data[`${periodKey}_actual`]) || 0;
						const planFactHtml = NS.renderPwrPlanFactCell({
							planHours: hours,
							actualHours,
							availableHours,
							tooltip,
							cellClass: "projects-workload-cell",
							visualPrefix: "projects-workload",
						});
						if (planFactHtml) {
							return planFactHtml;
						}
					}

					const shared = NS.pwrShared();
					if (shared.renderPlanOnlyWorkloadCell) {
						return shared.renderPlanOnlyWorkloadCell({
							planHours: hours,
							percentage,
							tooltip,
							cellClass: "projects-workload-cell",
							visualPrefix: "projects-workload",
						});
					}
				},
			});
		});

		return columns;
	}

	Object.assign(NS, {
		formatMonthHeader,
		formatWeekHeader,
		formatDateHeader,
		get_projects_workload_columns_definition,
	});
	project_workload_assignment.pwrBoot?.log?.("pwr-report/columns.js");
})();
