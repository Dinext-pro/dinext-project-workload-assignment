/**
 * Shared mutable filter args for top row, chart gutter, and table toolbar.
 */

export function createFilterSession(args, { onReload, onShift, onResetWindow }) {
	const reload = () => onReload();
	return {
		args,
		getArgs: () => ({ ...args }),
		reload,
		shiftPeriod(dir) {
			onShift(args, dir);
			reload();
		},
		resetWindowAndReload() {
			onResetWindow(args);
			reload();
		},
	};
}
