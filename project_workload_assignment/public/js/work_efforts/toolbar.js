/**
 * Domain chrome for DinextTable toolbar — same visuals as former `.work-efforts-controls`.
 * Mount once into stable custom host (id reused across toolbar refreshes).
 *
 * @param {WorkEffortsForm} frm
 */
export function buildToolbarItems(frm) {
	return [
		{
			id: "we-controls",
			type: "custom",
			render: ({ host }) => {
				project_workload_assignment.work_efforts.mount_toolbar_controls(frm, $(host));
			},
		},
	];
}
