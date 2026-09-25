import {
  pendingBackendUpdate,
  type AdminBackendScope,
} from "@/lib/adminBackendUpdate";

export default function QueryNotice({
  loading,
  error,
  retry,
  backendScope,
}: {
  loading?: boolean;
  error?: unknown;
  retry?: () => void;
  backendScope?: AdminBackendScope;
}) {
  const backendUpdate = pendingBackendUpdate(error, backendScope);
  if (error)
    return (
      <div role="alert" className="admin-notice admin-notice-error">
        {backendUpdate ? (
          <div>
            <strong>{backendUpdate.title}</strong>
            <p className="mt-1">{backendUpdate.description}</p>
          </div>
        ) : (
          "This information could not be loaded."
        )}{" "}
        {retry && (
          <button className="admin-btn-ghost" onClick={retry}>
            {backendUpdate ? "Check again" : "Try again"}
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
