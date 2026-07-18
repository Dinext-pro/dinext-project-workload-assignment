/* ISS-2026-00002 Phase 3b: Project Workload tab — AG Grid columns and cell handlers. */
(function () {
	const NS = project_workload_assignment.pwrProject;
	const WL_DEBUG = NS.WL_DEBUG;
	const pwrShared = NS.pwrShared;

	function getColumnWidthForViewType() {
		switch (NS.state.currentViewType) {
			case "daily":
				return 50;
			case "weekly":
				return 70;
			case "monthly":
				return 80;
			default:
				return 55;
		}
	}

	function handleProjectWorkloadCellDoubleClick(rowData) {
		if (!rowData || !window.cur_frm) {
			return;
		}

		if (rowData.level === "user" && rowData.email) {
			if (WL_DEBUG) {
				console.log("User double-clicked:", rowData.email);
			}
			sessionStorage.setItem("workload_report_filter_user", rowData.email);
			sessionStorage.setItem("workload_report_should_filter", "true");
			frappe.set_route("Form", "Projects Workload Report", "Projects Workload Report");
			return;
		}

		if (rowData.level === "task" && rowData.task_id) {
			if (WL_DEBUG) {
				console.log("Task double-clicked:", rowData);
			}

			const taskData = {
				name: rowData.task_id,
				value: rowData.task_id,
				project: window.cur_frm.doc.name,
				subject: rowData.task_subject,
				exp_start_date: rowData.exp_start_date,
				exp_end_date: rowData.exp_end_date,
			};

			if (typeof start_pwa_dialog === "function") {
				start_pwa_dialog(() => {
					if (WL_DEBUG) {
						console.log("PWA saved, refreshing data...");
					}
					if (NS.debouncedLoadProjectWorkloadData) {
						NS.debouncedLoadProjectWorkloadData(window.cur_frm, true, true);
					}
				}, taskData);
			} else {
				console.error("start_pwa_dialog function not found");
				frappe.msgprint(__("Функция открытия диалога PWA не найдена"));
			}
		}
	}

	function setupTaskDoubleClickHandler(frm) {
		if (!frm || !frm.project_workload_dt) {
			return;
		}

		NS.state.dblClickHandler = handleProjectWorkloadCellDoubleClick;
		if (typeof frm.project_workload_dt.setCellDoubleClickHandler === "function") {
			frm.project_workload_dt.setCellDoubleClickHandler(NS.state.dblClickHandler);
		}
	}

	function get_project_workload_columns_definition(periods) {
		const columns = [];

		columns.push({
			name: __("Participant / Role / Task"),
			id: "participant",
			width: 250,
			sortable: true,
			editable: false,
			focusable: false,
			dropdown: false,
			treeView: true,
			format: (value, row, column, data) => {
				if (!data) {
					return `<div class="project-workload-cell pwr-participant-cell"></div>`;
				}

				if (data.level === "user") {
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
							"project-user-avatar"
						);
					}
					const avatarHtml = data._cachedAvatarHtml;

					return `<div class="project-workload-cell pwr-participant-cell">
                    <div class="project-user-display">
                        ${avatarHtml}
                        <div class="project-user-info">
                            <div class="project-user-fullname" title="${fullName}">${fullName}</div>
                            <div class="project-user-email" title="${email}">${email}</div>
                        </div>
                    </div>
                </div>`;
				}

				if (data.level === "role") {
					return `<div class="project-workload-cell pwr-participant-cell project-role-display">
                    <div class="project-role-name" title="${data.roleName || __("No Role")}">
                        ${data.roleName || __("No Role")}
                    </div>
                </div>`;
				}

				if (data.level === "task") {
					return `<div class="project-workload-cell pwr-participant-cell project-task-display">
                    <div class="project-task-name" title="${data.task_subject || __("Task")}">
                        ${data.task_subject || __("Task")}
                    </div>
                </div>`;
				}

				return `<div class="project-workload-cell pwr-participant-cell"></div>`;
			},
		});

		(periods || []).forEach((period) => {
			const columnName = NS.formatPeriodHeader(period);

			columns.push({
				name: columnName,
				id: period.key,
				width: getColumnWidthForViewType(),
				sortable: false,
				dropdown: false,
				editable: false,
				focusable: false,
				format: (value, row, column, data) => {
					if (!data) {
						return `<div class="project-workload-cell"></div>`;
					}

					const metadata = window.projectWorkloadMetadata || {};
					const projectHolidays = metadata.project_holidays || [];
					const userHolidays = metadata.user_holidays || {};
					const userAbsences = metadata.user_absences || {};
					const userDailyHours = metadata.user_daily_hours || {};

					let hours = parseFloat(value) || 0;
					let availableHours = 0;
					let percentage = 0;
					const tooltipDetails = [];

					if (NS.state.currentViewType === "daily") {
						let isNonWorking = false;

						if (data.level === "user") {
							const allHolidays = [
								...projectHolidays,
								...(userHolidays[data.email] || []),
							];
							isNonWorking = NS.isNonWorkingDay(
								period.date,
								allHolidays,
								data.email
							);
						} else {
							isNonWorking = NS.isNonWorkingDay(
								period.date,
								projectHolidays,
								data.email
							);
						}

						if (isNonWorking) {
							return `<div class="project-workload-cell project-weekend-cell"></div>`;
						}

						const userAbsence = NS.isUserAbsentOnDate(
							data.email,
							period.date,
							userAbsences
						);
						if (userAbsence && userAbsence.isAbsent) {
							if (userAbsence.isPartial) {
								const baseHours =
									userDailyHours[data.email]?.[period.date] || 8;
								const availableOnDate = NS.getAvailableHoursOnDate(
									data,
									period.date,
									baseHours
								);
								tooltipDetails.push(
									`${__("Partial absence")}: ${(baseHours - availableOnDate).toFixed(1)}h`
								);
							} else {
								return `<div class="project-workload-cell project-absence-cell">
                                <div class="project-absence-text">${NS.formatAbsenceText(userAbsence.type)}</div>
                            </div>`;
							}
						}

						const baseHours = userDailyHours[data.email]
							? userDailyHours[data.email][period.date] || 8
							: 8;
						availableHours = NS.getAvailableHoursOnDate(data, period.date, baseHours);

						tooltipDetails.push(`${__("Base working hours")}: ${baseHours.toFixed(1)}h`);

						if (availableHours !== baseHours) {
							const absenceHours = baseHours - availableHours;
							tooltipDetails.push(`${__("Absence hours")}: ${absenceHours.toFixed(1)}h`);
							tooltipDetails.push(
								`${__("Available hours")}: ${availableHours.toFixed(1)}h`
							);
						}
					} else {
						availableHours = NS.calculateAvailableHoursForPeriod(
							data,
							period,
							userDailyHours,
							userAbsences,
							projectHolidays
						);
						tooltipDetails.push(
							`${__("Period available hours")}: ${availableHours.toFixed(1)}h`
						);
					}

					if (availableHours > 0) {
						percentage = Math.round((hours / availableHours) * 100);
					}

					tooltipDetails.push(`${__("Workload")}: ${hours.toFixed(1)}h (${percentage}%)`);
					const tooltip = tooltipDetails.join("\n");
					const levelClass = `level-${data.level || "unknown"}`;

					if (NS.isPwrShowFactEnabled()) {
						const periodKey = (column && column.id) || period.key;
						const actualHours = parseFloat(data[`${periodKey}_actual`]) || 0;
						const planFactHtml = NS.renderPwrPlanFactCell({
							planHours: hours,
							actualHours,
							availableHours,
							tooltip,
							cellClass: `project-workload-cell ${levelClass}`,
							visualPrefix: "project-workload",
						});
						if (planFactHtml) {
							return planFactHtml;
						}
					}

					const renderPlanOnly = pwrShared().renderPlanOnlyWorkloadCell;
					if (renderPlanOnly) {
						return renderPlanOnly({
							planHours: hours,
							percentage,
							tooltip,
							cellClass: `project-workload-cell ${levelClass}`,
							visualPrefix: "project-workload",
						});
					}
				},
			});
		});

		return columns;
	}

	Object.assign(NS, {
		getColumnWidthForViewType,
		handleProjectWorkloadCellDoubleClick,
		setupTaskDoubleClickHandler,
		get_project_workload_columns_definition,
	});
})();
