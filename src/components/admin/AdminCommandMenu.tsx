import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { useNavigate } from "@/lib/router-compat";
import { adminCreateActions, adminNavigation } from "./adminNavigation";
import { rankCommands } from "./commandSearch";

type MenuItem = { to: string; label: string; icon: LucideIcon; group: string };

// Highlighted row: gold fill with dark text, readable in both admin themes.
const ITEM_CLASS =
  "gap-3 py-3 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground";

const GROUPS = [
  { label: "Create", items: adminCreateActions },
  ...adminNavigation,
];
const ENTRIES: MenuItem[] = GROUPS.flatMap((group) =>
  group.items.map(({ to, label, icon }) => ({
    to,
    label,
    icon,
    group: group.label,
  })),
);

export default function AdminCommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;
  const results = useMemo(
    () => (searching ? rankCommands(ENTRIES, query) : []),
    [query, searching],
  );

  const changeOpen = (next: boolean) => {
    if (!next) setQuery("");
    onOpenChange(next);
  };
  const renderItem = (item: MenuItem) => (
    <CommandItem
      key={item.to}
      value={item.to}
      onSelect={() => {
        changeOpen(false);
        navigate(item.to);
      }}
      className={ITEM_CLASS}
    >
      <item.icon size={17} aria-hidden="true" />
      {item.label}
    </CommandItem>
  );

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="p-0 overflow-hidden">
        <DialogTitle className="sr-only">Go to page</DialogTitle>
        <DialogDescription className="sr-only">
          Jump to an admin page. Use the arrow keys to select a page and Enter
          to open it.
        </DialogDescription>
        {/* Ranking is ours (strict prefixes + keywords); cmdk handles keys. */}
        <Command shouldFilter={false}>
          <CommandInput
            aria-label="Go to an admin page"
            placeholder="Go to page…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[65dvh] p-2">
            <CommandEmpty>
              No matching pages. Try “offers”, “articles”, or “settings”.
            </CommandEmpty>
            {searching
              ? results.length > 0 && (
                  <CommandGroup heading="Best matches">
                    {results.map(renderItem)}
                  </CommandGroup>
                )
              : GROUPS.map((group) => (
                  <CommandGroup key={group.label} heading={group.label}>
                    {ENTRIES.filter((item) => item.group === group.label).map(
                      renderItem,
                    )}
                  </CommandGroup>
                ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
