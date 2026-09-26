/** Bound waiting even when the storage SDK cannot cancel its underlying upload.
 * Cancellation/timeout never means the object was not written; callers must
 * ignore late completion and must not automatically retry an uncertain write.
 */
export async function waitForUpload<T>(
  upload: PromiseLike<T>,
  signal: AbortSignal,
  timeoutMs = 60000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    stop = () =>
      reject(
        new Error(
          "Upload cancelled. It may still finish in storage, but it will not change this draft. Check your files before trying again.",
        ),
      );
    if (signal.aborted) stop();
    else signal.addEventListener("abort", stop, { once: true });
    timer = setTimeout(
      () =>
        reject(
          new Error(
            "The upload timed out. It may still finish in storage, but it will not change this draft. Check your files before trying again.",
          ),
        ),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([upload, cancelled]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", stop);
  }
}
