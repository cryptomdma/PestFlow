import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isOnList, matchListEntry } from "@shared/material-lists";

// Pass 20 (PLAN_ROADMAP_V2.md C3.4a): a multi-select over a settings list -
// the material line's Application Area and the product form's Allowed Areas.
// The list is the org's (or the product's); a value already on the row that
// the list does not name is KEPT and shown as a chip marked off the list,
// removable but never dropped (shared/material-lists.ts says why). Search
// filters the list; a tap toggles an entry. No typing of new values: the
// lists are edited in Settings, and the server keeps whatever a client sends.

interface ListMultiSelectProps {
  options: readonly string[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Shown beside a selected value that is not on `options`. */
  offListCaption?: string;
  disabled?: boolean;
  testId?: string;
}

export function ListMultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select",
  searchPlaceholder = "Search",
  offListCaption = "not on the list",
  disabled = false,
  testId,
}: ListMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = value.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  const offList = selected.filter((entry) => !isOnList(options, entry));
  const isSelected = (option: string) => selected.some((entry) => matchListEntry([option], entry) !== null);

  const toggle = (option: string) => {
    if (isSelected(option)) {
      onChange(selected.filter((entry) => matchListEntry([option], entry) === null));
    } else {
      onChange([...selected, option]);
    }
  };
  const remove = (entry: string) => onChange(selected.filter((current) => current !== entry));

  return (
    <div className="space-y-1.5" data-testid={testId}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className="w-full justify-between font-normal">
            <span className={selected.length ? "" : "text-muted-foreground"}>
              {selected.length ? `${selected.length} selected` : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>Nothing matches.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem key={option} value={option} onSelect={() => toggle(option)}>
                    <Check className={isSelected(option) ? "h-4 w-4 opacity-100" : "h-4 w-4 opacity-0"} />
                    <span>{option}</span>
                  </CommandItem>
                ))}
                {offList.map((entry) => (
                  <CommandItem key={`off-list-${entry}`} value={entry} onSelect={() => remove(entry)}>
                    <Check className="h-4 w-4 opacity-100" />
                    <span>{entry}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{offListCaption}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((entry) => {
            const onList = isOnList(options, entry);
            return (
              <Badge key={entry} variant={onList ? "secondary" : "outline"} className="gap-1 font-normal">
                {entry}
                {!onList && <span className="text-muted-foreground">({offListCaption})</span>}
                {!disabled && (
                  <button type="button" className="ml-0.5 rounded-full hover:text-destructive" onClick={() => remove(entry)} aria-label={`Remove ${entry}`}>
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
