import { useEffect, useState } from "react";

/**
 * Returns Date.now() that re-renders on a fixed interval. Pass enabled=false
 * (e.g. when no in-progress activity is visible) to skip the timer.
 */
export function useNow(intervalMs = 1000, enabled = true): number {
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		if (!enabled) return;
		const id = setInterval(() => setNow(Date.now()), intervalMs);
		return () => clearInterval(id);
	}, [intervalMs, enabled]);

	return now;
}
