export interface GenerationDispatchSnapshot {
  id: string;
  status: string;
  updated_at: string;
  completed_count: number;
}

interface DispatchOptions {
  url: string;
  headers: HeadersInit;
  payload: unknown;
  expectedStatus: "pending" | "running";
  expectedCompleted: number;
  label: string;
  readSnapshot: (
    signal: AbortSignal,
  ) => Promise<GenerationDispatchSnapshot | null>;
  /** Must compare the captured status, version and progress atomically. */
  markStalled: (
    snapshot: GenerationDispatchSnapshot,
    message: string,
    signal: AbortSignal,
  ) => Promise<void>;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

/** One dispatch attempt only. An unacknowledged request may still have started. */
export async function dispatchGenerationRequest(options: DispatchOptions) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 20_000;
  const uncertainty = `Start of ${options.label} was not confirmed; check job progress before resuming. No automatic retry was made.`;
  let snapshot: GenerationDispatchSnapshot | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(uncertainty));
      }, timeoutMs);
    });
    const dispatch = async () => {
      snapshot = await options.readSnapshot(controller.signal);
      // A timed-out lookup cannot start a late request.
      if (controller.signal.aborted) throw new Error(uncertainty);
      if (
        !snapshot ||
        snapshot.status !== options.expectedStatus ||
        snapshot.completed_count !== options.expectedCompleted
      )
        return;
      const response = await (options.fetcher ?? fetch)(options.url, {
        method: "POST",
        headers: options.headers,
        body: JSON.stringify(options.payload),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(
          `Dispatch of ${options.label} returned HTTP ${response.status}. Start was not confirmed; check job progress and service status before resuming. No automatic retry was made.`,
        );
    };
    await Promise.race([dispatch(), expired]);
  } catch (error) {
    if (!snapshot) throw error;
    const message = controller.signal.aborted
      ? uncertainty
      : error instanceof Error && error.message.startsWith("Dispatch of")
        ? error.message
        : uncertainty;
    // Mark only the version observed before dispatch. A cancellation, resume,
    // completed step or newer activity must win over this delayed failure.
    const saveController = new AbortController();
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        options.markStalled(snapshot, message, saveController.signal),
        new Promise<never>((_, reject) => {
          saveTimer = setTimeout(() => {
            saveController.abort();
            reject(
              new Error(
                "Could not record the unconfirmed generation dispatch.",
              ),
            );
          }, timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(saveTimer);
      saveController.abort();
    }
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
