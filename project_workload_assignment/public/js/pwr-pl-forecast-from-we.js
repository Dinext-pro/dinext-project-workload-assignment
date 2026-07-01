/* ISS-2025-03107 / ISS-2025-02857: P&L «Add forecast» from work efforts forecast. */
frappe.provide("dinext_projects");

const PWR_PL_FORECAST_FROM_WE_MENU_FLAG = "__pwr_pl_forecast_from_we";
const PWR_PL_FORECAST_COST_LABEL = __("Cost forecast from work efforts");
const PWR_PL_FORECAST_REVENUE_LABEL = __("Revenue forecast from work efforts");

function loadForecastFromWeCss() {
	const href = "/assets/project_workload_assignment/css/pwr-pl-forecast-from-we.css";
	if (document.querySelector(`link[href="${href}"]`)) {
		return;
	}
	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.href = href;
	document.head.appendChild(link);
}

loadForecastFromWeCss();

function pwr_pl_is_tm_project(frm) {
	return frm.doc.custom_payment_scheme === "Время и затраты (T&M)";
}

function pwr_pl_register_forecast_from_we_menu(frm) {
	if (!frm || frm.is_new()) {
		return;
	}
	frappe.provide("dinext_projects.project_pl_forecast_menu");
	if (!Array.isArray(dinext_projects.project_pl_forecast_menu)) {
		dinext_projects.project_pl_forecast_menu = [];
	}
	dinext_projects.project_pl_forecast_menu = dinext_projects.project_pl_forecast_menu.filter(
		(item) => !item[PWR_PL_FORECAST_FROM_WE_MENU_FLAG]
	);
	dinext_projects.project_pl_forecast_menu.push({
		label: PWR_PL_FORECAST_COST_LABEL,
		action: (frm) => add_forecast_from_work_efforts_handler(frm, "cost"),
		[PWR_PL_FORECAST_FROM_WE_MENU_FLAG]: true,
	});
	if (pwr_pl_is_tm_project(frm)) {
		dinext_projects.project_pl_forecast_menu.push({
			label: PWR_PL_FORECAST_REVENUE_LABEL,
			action: (frm) => add_forecast_from_work_efforts_handler(frm, "revenue"),
			[PWR_PL_FORECAST_FROM_WE_MENU_FLAG]: true,
		});
	}
	if (typeof dinext_projects.refresh_pl_forecast_dropdown === "function") {
		dinext_projects.refresh_pl_forecast_dropdown(frm);
	}
}

function show_tasks_selection_dialog(frm, forecastMode = "cost") {
	let periods = get_budget_display_periods(frm, "month");

	frappe.show_alert({
		message: __("Loading work effort data..."),
		indicator: 'orange'
	}, 5);

	frappe.call({
		method: "get_tasks_forecast_and_workload_v2",
		args: {
			project: frm.doc.name,
			periods: periods,
			view_options: frm.budget_view_options
		},
		freeze: true,
		freeze_message: __("Loading work effort data..."),
		callback: function(r) {
			if (r.message && r.message.tasks) {
				let tasks = r.message.tasks;
				let tasksDetails = r.message.tasks_details;

				if (tasks.length === 0) {
					frappe.msgprint(__("No tasks with forecast work efforts or workload"));
					return;
				}

				let allTasks = frm.aggregatedTasks ? Object.values(frm.aggregatedTasks) : [];
				let tasksMap = {};
				tasks.forEach(task => {
					tasksMap[task.task] = task;
				});

				let tasksWithData = new Set();
				allTasks.forEach(task => {
					if (tasksMap[task.value] && (tasksMap[task.value].total_forecast > 0 || tasksMap[task.value].total_assigned > 0)) {
						tasksWithData.add(task.value);
					}
				});

				let tasksToShow = new Set(tasksWithData);
				tasksWithData.forEach(taskId => {
					let current = allTasks.find(t => t.value === taskId);
					while (current && current.parent_task) {
						tasksToShow.add(current.parent_task);
						current = allTasks.find(t => t.value === current.parent_task);
					}
				});

				let table_data = [];
				let processedTasks = new Set();

				function addTaskToTable(taskId, parentId, level) {
					if (processedTasks.has(taskId)) return;

					let task = allTasks.find(t => t.value === taskId);
					if (!task) return;

					let taskData = tasksMap[taskId] || { total_forecast: 0, total_assigned: 0 };
					let hasData = taskData.total_forecast > 0 || taskData.total_assigned > 0;

					table_data.push({
						'id': taskId,
						'value': taskId,
						'parent': parentId,
						'subject': task.subject || taskId,
						'total_forecast': taskData.total_forecast || 0,
						'total_assigned': taskData.total_assigned || 0,
						'has_data': hasData,
						'indent': level
					});

					processedTasks.add(taskId);

					let children = allTasks.filter(t => t.parent_task === taskId && tasksToShow.has(t.value));
					children.sort((a, b) => (a.subject || '').localeCompare(b.subject || ''));
					children.forEach(child => addTaskToTable(child.value, taskId, level + 1));
				}

				let rootTasks = allTasks.filter(t => !t.parent_task && tasksToShow.has(t.value));
				rootTasks.sort((a, b) => (a.subject || '').localeCompare(b.subject || ''));
				rootTasks.forEach(task => addTaskToTable(task.value, null, 0));

				let tableHeight = Math.min(500, Math.max(200, table_data.length * 30 + 40));

				const is_revenue = forecastMode === "revenue";

				function open_tasks_selection_dialog(income_accounts) {
				let dialog_fields = [
					{
						fieldtype: "HTML",
						fieldname: "table_container",
						options: `<div class="tasks-datatable-container pwr-pl-forecast-tasks-datatable-container" style="height: ${tableHeight}px;"></div>`
					}
				];

				if (is_revenue) {
					dialog_fields.push({
						fieldtype: "Link",
						fieldname: "income_account",
						label: __("Income account"),
						options: "Account",
						reqd: true,
						get_query: function() {
							let filters = {
								company: frm.doc.company,
								root_type: "Income",
								is_group: 0
							};
							if (income_accounts.length) {
								filters.name = ["in", income_accounts];
							} else {
								filters.name = ["=", "__no_income_accounts__"];
							}
							return { filters: filters };
						}
					});
				}

				dialog_fields.push({
					fieldtype: "HTML",
					fieldname: "info_html",
					options: `
						<div class="text-muted pwr-pl-forecast-info-box">
							<i class="fa fa-info-circle"></i>
							<strong>${__("Select tasks to add forecast to budget")}</strong>
							<br><small>${__("Forecast will be added for all roles")}</small>
						</div>
					`
				});

				let dialog = new frappe.ui.Dialog({
					title: __("Select tasks for adding forecast to budget"),
					size: "large",
					fields: dialog_fields,
					primary_action_label: __("Add forecast"),
					primary_action: function() {
						let checkedRows = dialog.datatable.rowmanager.getCheckedRows();

						if (!checkedRows || checkedRows.length === 0) {
							frappe.msgprint(__("Select at least one task"));
							return;
						}

						let selectedTasks = [];
						checkedRows.forEach(rowIndex => {
							let rowData = dialog.datatable.datamanager.getData(rowIndex);
							if (rowData && rowData.has_data) {
								selectedTasks.push(rowData.value);
							}
						});

						if (selectedTasks.length === 0) {
							frappe.msgprint(__("Select tasks with data"));
							return;
						}

						let income_account = is_revenue ? dialog.get_value("income_account") : null;

						if (is_revenue && !income_account) {
							frappe.msgprint(__("Select income account"));
							return;
						}

						dialog.hide();
						add_forecast_to_budget(frm, selectedTasks, tasksDetails, false, forecastMode, income_account);
					},
					secondary_action_label: __("Cancel"),
					secondary_action: function() {
						dialog.hide();
					}
				});

				dialog.show();

				if (is_revenue) {
					if (income_accounts.length === 1) {
						dialog.set_value("income_account", income_accounts[0]);
					} else {
						frappe.db.get_value("Company", frm.doc.company, "default_income_account", function(r) {
							if (!r || !r.default_income_account) {
								return;
							}
							if (!income_accounts.length || income_accounts.includes(r.default_income_account)) {
								dialog.set_value("income_account", r.default_income_account);
							}
						});
					}
				}

				setTimeout(() => {
					let container = dialog.$wrapper.find('.tasks-datatable-container');

					let columns = [
						{
							name: __("Task"),
							id: "subject",
							width: 450,
							treeView: true,
							sortable: false,
							format: (value) => value || ''
						},
						{
							name: __("Forecast, h"),
							id: "total_forecast",
							width: 100,
							sortable: false,
							format: (value, row, column, data) => {
								if (data && data.total_forecast > 0) {
									return data.total_forecast.toFixed(1);
								}
								return '—';
							}
						},
						{
							name: __("Workload, h"),
							id: "total_assigned",
							width: 120,
							sortable: false,
							format: (value, row, column, data) => {
								if (data && data.total_assigned > 0) {
									return `<span class="pwr-pl-forecast-assigned-hours">${data.total_assigned.toFixed(1)}</span>`;
								}
								return '—';
							}
						}
					];

					dialog.datatable = new StickyDataTable(container[0], {
						columns: columns,
						data: table_data,
						treeView: true,
						checkboxColumn: true,
						checkedRowStatus: false,
						layout: "fixed",
						inlineFilters: false,
						disableReorderColumn: true,
						serialNoColumn: true,
						cellHeight: 30
					});

					setTimeout(() => {
						container.find('.dt-row').each(function() {
							let rowIndex = $(this).data('row-index');
							if (rowIndex !== undefined && dialog.datatable.datamanager) {
								let rowData = dialog.datatable.datamanager.getData(rowIndex);

								if (rowData && !rowData.has_data) {
									$(this).find('.dt-cell--col-0 input[type="checkbox"]').hide();
									$(this).addClass('pwr-pl-forecast-row-no-data');
								}
							}
						});
					}, 100);

				}, 200);

				}

				if (is_revenue) {
					frappe.call({
						method: "frappe.desk.search.search_link",
						args: {
							doctype: "Account",
							txt: "",
							query: "project_workload_assignment.project_workload_assignment.project_workload.forecast_utils.get_income_accounts_with_task_dimension",
							filters: { company: frm.doc.company },
							page_length: 9999
						},
						callback: function(account_r) {
							let income_accounts = (account_r.message || []).map((row) => row.value);
							open_tasks_selection_dialog(income_accounts);
						},
						error: function() {
							frappe.msgprint(__("Failed to load income accounts list"));
						}
					});
				} else {
					open_tasks_selection_dialog([]);
				}

			} else if (r.message && r.message.error) {
				frappe.msgprint(__("Error: {0}", [r.message.error]));
			} else {
				frappe.msgprint(__("No work effort data"));
			}
		},
		error: function(err) {
			console.error("AJAX Error:", err);
			frappe.msgprint(__("Error loading work effort data"));
		}
	});
}

function reserveDimensionsKey(dimensions) {
	if (!dimensions || !dimensions.length) return "";
	return dimensions
		.filter(function(d) { return d && d.doc; })
		.map(function(d) { return (d.doc || '') + ':' + (d.docname || ''); })
		.sort()
		.join('|');
}

function reserveDimensionsEqual(dim1, dim2) {
	return reserveDimensionsKey(dim1) === reserveDimensionsKey(dim2);
}

function reloadForecastBudgetView(frm) {
	if (typeof load_budget_data === 'function') {
		load_budget_data(frm, 'month', true);
	}
}

function add_forecast_to_budget(frm, selectedTasks, tasksDetails, confirmRecalc = false, forecastType = "cost", incomeAccount = null) {
	if (!selectedTasks || selectedTasks.length === 0) {
		frappe.msgprint(__("No tasks selected"));
		return;
	}

	let serverForecastType = forecastType === "revenue" ? "revenue" : "cost";

	let filteredDetails = {};
	selectedTasks.forEach(task => {
		if (tasksDetails[task]) {
			filteredDetails[task] = tasksDetails[task];
		}
	});

	frappe.show_alert({
		message: __("Adding forecast from work efforts for {0} tasks...", [selectedTasks.length]),
		indicator: 'orange'
	}, 10);

	frappe.call({
		method: "add_forecast_from_work_efforts",
		args: {
			project: frm.doc.name,
			tasks: selectedTasks,
			forecast_details: filteredDetails,
			confirm_recalc: confirmRecalc,
			forecast_type: serverForecastType,
			income_account: incomeAccount || ""
		},
		freeze: true,
		freeze_message: __("Adding forecast to budget..."),
		callback: function(r) {
			if (r.message && r.message.success) {
				frappe.show_alert({
					message: __("Forecast added successfully. Updated {0} records.", [r.message.updated_count || 0]),
					indicator: 'green'
				}, 5);

				if (typeof buildParentAdjustments === 'function' && frm.aggregatedBudget && r.message.results) {
					var reserveUpdates = r.message.results.map(function(item) {
						var dimensions = [];
						if (item.task) {
							dimensions.push({ doc: 'Task', docname: item.task });
						}
						var periodKey = item.year + '_' + item.month;
						var periodAmountMap = {};
						periodAmountMap[periodKey] = item.total_amount;
						return {
							account: item.account,
							dimensions: dimensions,
							period_amount_map: periodAmountMap
						};
					});

					var parentResult = buildParentAdjustments(frm, reserveUpdates);
					if (parentResult.parent_adjustments && parentResult.parent_adjustments.length > 0) {
						frappe.call({
							method: 'dinext_risk_management.dinext_risk_management.bulk_save_reserve_budgets',
							args: {
								project: frm.doc.name,
								updates: [],
								parent_adjustments: parentResult.parent_adjustments
							},
							freeze: true,
							freeze_message: __("Updating parent accounts..."),
							callback: function(r2) {
								if (r2.exc) {
									frappe.msgprint({
										title: __('Error'),
										message: r2.exc && r2.exc[0] ? r2.exc[0] : __('Error updating parent accounts'),
										indicator: 'red'
									});
									reloadForecastBudgetView(frm);
									return;
								}
								if (parentResult.adjusted_parents && parentResult.adjusted_parents.length > 0) {
									frappe.show_alert({
										message: __('Forecast increased for parent accounts: {0}',
											[parentResult.adjusted_parents.map(function(a) { return a.account; }).join(', ')]),
										indicator: 'yellow'
									}, 5);
								}
								reloadForecastBudgetView(frm);
							}
						});
						return;
					}
				}

				reloadForecastBudgetView(frm);

			} else if (r.message && r.message.needs_confirmation) {
				frappe.dom.unfreeze();
				const isUnderload = r.message.total_pwa_hours < r.message.forecast_hours;
				const confirmMessage = r.message.message || (isUnderload
					? __("Forecast exceeds workload. Recalculate forecast based on virtual project team member data?")
					: __("Workload exceeds forecast. Recalculate forecast based on current forecast values?"));
				frappe.confirm(
					confirmMessage,
					() => {
						add_forecast_to_budget(frm, selectedTasks, tasksDetails, true, forecastType, incomeAccount);
					},
					() => {
						frappe.show_alert(__("Operation cancelled"), 3);
					}
				);
			} else if (r.message && r.message.error) {
				frappe.dom.unfreeze();
				frappe.msgprint(__("Error: {0}", [r.message.error]));
			} else {
				frappe.dom.unfreeze();
				frappe.msgprint(__("Unknown error"));
			}
		},
		error: function(err) {
			frappe.dom.unfreeze();
			console.error("AJAX Error:", err);
			frappe.msgprint(__("Error adding forecast"));
		}
	});
}

function clearBudgetCache() {
	_sum_cache = {};
	if (cur_frm) {
		cur_frm.aggregatedBudget = null;
	}
}

function ensureProjectWorkEffortsTasks(frm) {
	return new Promise((resolve, reject) => {
		if (frm.aggregatedTasks && Object.keys(frm.aggregatedTasks).length > 0) {
			resolve(frm.aggregatedTasks);
			return;
		}

		frappe.call({
			method: "dinext_projects.dinext_projects.work_efforts_api.get_work_efforts_consolidated_data",
			args: {
				project: frm.doc.name,
				view_options: frm.view_options || frm.budget_view_options || __("Forecast and actual"),
			},
			freeze: true,
			freeze_message: __("Loading work effort data..."),
			callback(r) {
				if (!r.message) {
					frappe.msgprint(__("Failed to load work effort data"));
					reject();
					return;
				}

				frm.aggregatedTasks = {};
				(r.message || []).forEach((task) => {
					if (task && task.value) {
						frm.aggregatedTasks[task.value] = task;
					}
				});

				if (Object.keys(frm.aggregatedTasks).length === 0) {
					frappe.msgprint(__("No tasks with work efforts in project"));
					reject();
					return;
				}

				resolve(frm.aggregatedTasks);
			},
			error() {
				frappe.msgprint(__("Error loading work effort data"));
				reject();
			},
		});
	});
}

function add_forecast_from_work_efforts_handler(frm, forecastMode = "cost") {
	if (!frm.aggregatedBudget || Object.keys(frm.aggregatedBudget).length === 0) {
		frappe.msgprint(__("Wait for budget data to load first"));
		return;
	}

	ensureProjectWorkEffortsTasks(frm).then(() => {
		show_tasks_selection_dialog(frm, forecastMode);
	});
}

function escape_html(str) {
	if (!str) return '';
	return str.replace(/[&<>]/g, function(m) {
		if (m === '&') return '&amp;';
		if (m === '<') return '&lt;';
		if (m === '>') return '&gt;';
		return m;
	});
}

frappe.ui.form.on("Project", {
	refresh(frm) {
		pwr_pl_register_forecast_from_we_menu(frm);
	},
});
