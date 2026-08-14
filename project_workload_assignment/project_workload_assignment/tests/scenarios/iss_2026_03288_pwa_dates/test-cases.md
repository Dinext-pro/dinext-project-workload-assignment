# ISS-2026-03288 PWA dates (слой 4a)

Порт runnable-кейсов ISS-2025-02606 TC-17, TC-18 и метода Issue-без-virtual. TC-25 остаётся UI smoke, как в оригинале.

- issue: `ISS-2026-03288` (источник кейсов: `ISS-2025-02606`)
- site: `dev.dinext.localhost`
- owner_app: `project_workload_assignment`
- dependent_apps:
  - `erpnext`
  - `dinext_projects` (TC-17: UTP rollup)
  - `dinext_project_tasks_gantt` (live-site: virtual Task / Actual на `Task.save`)
- primary_surface: `Python`
- secondary_surfaces:
  - `UI smoke` (TC-25)
- scenario_dir: `frappe-bench/apps/project_workload_assignment/project_workload_assignment/project_workload_assignment/tests/scenarios/iss_2026_03288_pwa_dates`
- data_helper: `data_setup.py`
- source_of_truth:
  - `project_workload_assignment/pwa_dates/task_sync.py`
  - `project_workload_assignment/pwa_dates/issue_sync.py`
  - `project_workload_assignment/hooks.py` → Task/Issue `on_update`
- sync_required: `no`
- run_targets:
  - `project_workload_assignment.project_workload_assignment.tests.scenarios.iss_2026_03288_pwa_dates.test_pwa_dates`
- actors:
  - setup_user: `Administrator`
  - business_user: `test.iss-2026-03288-p@example.com`
  - ui_actor: `Administrator` (только TC-25)
- runtime_inputs:
  - PWA-эффект только при `Project Workload Assignment.task_dates = 1`
  - virtual Task есть → `issue_sync` no-op; даты PWA с `Task.exp_*`
  - virtual Task нет → fallback `Issue.opening_date` / `custom_expected_resolution_date` на Task, связанные через `Task.issue`
- reset_scope:
  - prefix `TEST ISS-2026-03288-P`
  - user `test.iss-2026-03288-p@example.com`
- primary_test_artifacts:
  - `test_pwa_dates.py`
- last_run: 2026-08-12 — `dev.dinext.localhost`, `dinext-frappe-local-backend-1`, модуль `test_pwa_dates` **3/3 OK**; smoke `pwa_dates._smoke_4a` TC0–TC4 PASS

## Status Legend

- ⚪ не составлен
- 🟡 не запущен
- 🟢 пройден
- 🔴 не пройден

## Test Cases

- 🟢 TC-17: PWA обычной Task получает итоговые `exp_*` при `task_dates = 1`
  - surface: `Python`
  - setup: PWA на regular Task; согласовать UTP с часами вне текущего плана
  - assert: `PWA.date_from/to` = `Task.exp_start/end`
  - artifacts: `test_task_pwa_receives_final_expected_dates_after_regular_fact_sync`

- 🟢 TC-18: PWA virtual task берёт финальные `Task.exp_*`, не сырые даты Issue
  - surface: `Python`
  - setup: virtual task с `act_*`; Issue `custom_expected_resolution_date` расходится
  - action: `Issue.save()`
  - assert: PWA = `Task.exp_*`, не `2026-04-16` с Issue
  - artifacts: `test_virtual_task_pwa_receives_final_task_dates_not_raw_issue_dates`

- 🟢 extra: Issue без virtual Task обновляет PWA связанной обычной Task
  - surface: `Python`
  - notes: метод был в 02606, отдельного TC-номера в md не имел
  - artifacts: `test_issue_without_virtual_task_updates_issue_linked_task_pwa`

- ⚪ TC-25: UI smoke PWA после virtual-task сценария
  - surface: `UI smoke`
  - notes: в 02606 подтверждено вручную на `erp-dev`; в `run_targets` не входит. Layer 5 / `_smoke_4a` покрывают seed+sync, не этот TC.

## Last run

- date: `2026-08-12`
- site: `dev.dinext.localhost`
- command: `docker exec dinext-frappe-local-backend-1 bench --site dev.dinext.localhost run-tests --module project_workload_assignment.project_workload_assignment.tests.scenarios.iss_2026_03288_pwa_dates.test_pwa_dates`
- result: **3/3 OK**
- extra smoke: `project_workload_assignment.pwa_dates._smoke_4a.run` — TC0–TC4 PASS (в т.ч. `task_dates=0` skip)
