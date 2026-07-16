const states = new WeakMap();

export function createState(ctx) {
	if (!ctx) {
		throw new Error("workload.createState: ctx required");
	}
	let state = states.get(ctx);
	if (!state) {
		state = {
			table: null,
			rows: [],
			periods: [],
			meta: {},
			filters: {},
			surface: null,
			loadedProjectDetailsByUser: Object.create(null),
			participantWidth: null,
			isLoadingMore: false,
		};
		states.set(ctx, state);
	}
	return state;
}

export function getState(ctx) {
	if (!ctx) {
		return null;
	}
	return states.get(ctx) || null;
}
