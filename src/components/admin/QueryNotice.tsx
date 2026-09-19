export default function QueryNotice({
  loading,
  error,
  retry,
}: {
  loading?: boolean;
  error?: unknown;
  retry?: () => void;
}) {
  if (error)
    return (
      <div role="alert" className="admin-notice admin-notice-error">
        This information could not be loaded.{" "}
        {retry && (
          <button className="admin-btn-ghost" onClick={retry}>
            Try again
          </button>
        )}
      </div>
    );
  if (loading)
    return (
      <p role="status" className="admin-notice">
        Loading current information…
      </p>
    );
  return null;
}
