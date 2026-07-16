export function useLegacyWorkload() {
	try {
		return localStorage.getItem("pwr_workload_legacy") === "1";
	} catch (_err) {
		return false;
	}
}
