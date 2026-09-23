import { X } from "lucide-react";
import type { CSSProperties } from "react";

/** Removable chips with named, 24px remove targets. */
export function ChipList({
  items,
  onRemove,
  removeLabel,
  chipStyle,
}: {
  items: string[];
  onRemove: (index: number) => void;
  removeLabel: (item: string) => string;
  chipStyle?: CSSProperties;
}) {
  if (!items.length) return null;
  return (
    <ul
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        marginBottom: 8,
        listStyle: "none",
        padding: 0,
      }}
    >
      {items.map((item, i) => (
        <li
          key={`${item}-${i}`}
          className="font-body"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 2,
            maxWidth: "100%",
            overflowWrap: "anywhere",
            fontSize: 12,
            padding: "2px 4px 2px 10px",
            borderRadius: 999,
            backgroundColor: "hsl(var(--admin-surface-2))",
            color: "hsl(var(--admin-text-soft))",
            border: "1px solid hsl(var(--admin-border))",
            ...chipStyle,
          }}
        >
          {item}
          <button
            type="button"
            aria-label={removeLabel(item)}
            onClick={() => onRemove(i)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              minWidth: 24,
              minHeight: 24,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "inherit",
            }}
          >
            <X size={12} aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
