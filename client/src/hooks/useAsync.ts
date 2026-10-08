import { useCallback, useEffect, useState } from "react";

export type AsyncState<T> =
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error };

/**
 * Runs `load` whenever `deps` change, cancelling the previous request, and
 * exposes a `retry` for error states.
 */
export function useAsync<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): AsyncState<T> & { retry: () => void } {
  const key = JSON.stringify(deps);
  const [state, setState] = useState<{ key: string; value: AsyncState<T> }>({
    key,
    value: { status: "loading" },
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ key, value: { status: "loading" } });
    load(controller.signal).then(
      (data) => setState({ key, value: { status: "success", data } }),
      (error: Error) => {
        if (!controller.signal.aborted) setState({ key, value: { status: "error", error } });
      },
    );
    return () => controller.abort();
    // `load` is a new closure every render, so `key` (not `load`) decides when to refetch.
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  // Data loaded for other deps is stale until the effect above catches up.
  const current: AsyncState<T> = state.key === key ? state.value : { status: "loading" };
  return { ...current, retry };
}
