import {
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";

type ControlProps = {
  id?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
};

/**
 * Label + control + optional hint and inline error. The label is a real
 * <label htmlFor>, and the hint/error are wired to the control through
 * aria-describedby so screen readers announce them.
 */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactElement<ControlProps>;
}) {
  const generated = useId();
  const id = (isValidElement(children) && children.props.id) || generated;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy =
    [children.props["aria-describedby"], errorId, hintId]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="admin-label">
        {label}
      </label>
      <div style={{ marginTop: 6 }}>
        {cloneElement(children, {
          id,
          "aria-invalid": error ? true : undefined,
          "aria-describedby": describedBy,
        })}
      </div>
      {error && <FieldError id={errorId!}>{error}</FieldError>}
      {hint && (
        <p
          id={hintId}
          className="font-body"
          style={{
            fontSize: 11,
            color: "hsl(var(--admin-text-ghost))",
            marginTop: 6,
            lineHeight: 1.5,
          }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

export function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <p
      id={id}
      className="font-body"
      style={{
        fontSize: 12,
        color: "hsl(0 70% 50%)",
        marginTop: 6,
        lineHeight: 1.4,
      }}
    >
      {children}
    </p>
  );
}

export function SectionCard({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="admin-card min-w-0" style={{ padding: 24 }}>
      <h2
        className="font-body"
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "hsl(var(--admin-text))",
          marginBottom: intro ? 6 : 20,
        }}
      >
        {title}
      </h2>
      {intro && (
        <p
          className="font-body"
          style={{
            fontSize: 12,
            color: "hsl(var(--admin-text-ghost))",
            marginBottom: 20,
            lineHeight: 1.5,
          }}
        >
          {intro}
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {children}
      </div>
    </section>
  );
}
