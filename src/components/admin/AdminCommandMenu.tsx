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
export default function AdminCommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden">
        <DialogTitle className="sr-only">Find a page or action</DialogTitle>
        <DialogDescription className="sr-only">
          Search your workspace. Use the arrow keys to select a result and Enter
          to open it.
        </DialogDescription>
        <Command>
          <CommandInput
            aria-label="Search admin pages and actions"
            placeholder="Where would you like to go?"
          />
          <CommandList className="max-h-[65dvh] p-2">
            <CommandEmpty>
              No matching pages. Try “offers”, “articles”, or “settings”.
            </CommandEmpty>
            {[
              { label: "Create", items: adminCreateActions },
              ...adminNavigation,
            ].map((group) => (
              <CommandGroup key={group.label} heading={group.label}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.to}
                    value={`${group.label} ${item.label}`}
                    onSelect={() => {
                      onOpenChange(false);
                      navigate(item.to);
                    }}
                    className="gap-3 py-3"
                  >
                    <item.icon size={17} aria-hidden="true" />
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
