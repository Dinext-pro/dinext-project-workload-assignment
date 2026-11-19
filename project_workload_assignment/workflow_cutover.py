"""Contribution to the shared Workflow cutover from this application."""


def configuration():
    return {"preflight": (10, _preflight),
     "migrate_settings": (30, _migrate_settings)}



def _preflight():
    from project_workload_assignment.legacy_absences import plan_legacy_absence_query

    plan_legacy_absence_query()


def _migrate_settings():
    from project_workload_assignment.legacy_absences import migrate_legacy_absence_query

    migrate_legacy_absence_query()
