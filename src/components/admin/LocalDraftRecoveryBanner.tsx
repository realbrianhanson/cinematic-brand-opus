export type LocalDraftRecovery = {
  pending: boolean;
  canRestore: boolean;
  restore: () => void;
  discard: () => void;
  download: () => void;
  message: string;
  notice: string;
  copies: Array<{ id: string; savedAt: number; canRestore: boolean }>;
  selectedCopyId: string;
  selectCopy: (id: string) => void;
};

export default function LocalDraftRecoveryBanner({
  recovery,
  disabled = false,
}: {
  recovery: LocalDraftRecovery;
  disabled?: boolean;
}) {
  if (!recovery.message && !recovery.pending) return null;
  return (
    <div className="admin-card mb-4 p-4 space-y-3" aria-label="Draft recovery">
      {recovery.notice && (
        <p role="status" className="text-sm">
          {recovery.notice}
        </p>
      )}
      {recovery.pending ? (
        <>
          {recovery.copies.length > 1 && (
            <label className="block text-sm">
              {recovery.copies.length} working copies found. Choose the copy to
              review.
              <select
                className="admin-input mt-2 w-full"
                disabled={disabled}
                value={recovery.selectedCopyId}
                onChange={(event) => recovery.selectCopy(event.target.value)}
              >
                {recovery.copies.map((copy, index) => (
                  <option key={copy.id} value={copy.id}>
                    Copy {index + 1} · {new Date(copy.savedAt).toLocaleString()}{" "}
                    ·{" "}
                    {copy.canRestore
                      ? "Matches saved version"
                      : "Older saved version"}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p role="status" className="text-sm">
            {recovery.canRestore
              ? "An unsaved working copy was found on this device. Restore it to review your edits, or discard the backup and keep the saved version."
              : "A working copy was found, but the saved version has changed. Download the backup to compare and copy the edits you still want; direct restore is blocked to protect the newer version."}
          </p>
          <div className="flex flex-wrap gap-2">
            {recovery.canRestore && (
              <button
                type="button"
                className="admin-btn-secondary"
                disabled={disabled}
                onClick={recovery.restore}
              >
                Restore working copy
              </button>
            )}
            <button
              type="button"
              className="admin-btn-ghost"
              disabled={disabled}
              onClick={recovery.download}
            >
              Download working copy
            </button>
            <button
              type="button"
              className="admin-btn-ghost"
              disabled={disabled}
              onClick={recovery.discard}
            >
              Discard backup
            </button>
          </div>
        </>
      ) : null}
      {recovery.message && (
        <p className="text-xs opacity-70">{recovery.message}</p>
      )}
    </div>
  );
}
