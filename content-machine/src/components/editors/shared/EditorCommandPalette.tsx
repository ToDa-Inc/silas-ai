"use client";

/**
 * EditorCommandPalette — ⌘K command palette for editor actions.
 *
 * Wraps `cmdk` (Vercel's headless command-menu primitive used by Linear,
 * Cal.com, etc). Shows the actions registered for the current selection,
 * grouped by category, with fuzzy search.
 *
 * Discoverability: the host renders a "Search actions… ⌘K" pill at the top
 * of the inspector (`InspectorForSelection`) that calls `setOpen(true)`.
 * The palette also opens on global ⌘K / Ctrl+K when mounted.
 *
 * No sparkles, no emoji slop. Plain text labels with optional lucide icons.
 */

import { useEffect } from "react";
import { Command } from "cmdk";

import type { EditorAction } from "./actionRegistry";
import { actionsForSelection, groupActions } from "./actionRegistry";
import type { EditorSelection } from "./useEditorSelection";

export type EditorCommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selection: EditorSelection;
  actions: EditorAction[];
  /** Label rendered as the empty/intro placeholder. Defaults to "Search actions…" */
  placeholder?: string;
};

export function EditorCommandPalette({
  open,
  onOpenChange,
  selection,
  actions,
  placeholder = "Search actions…",
}: EditorCommandPaletteProps) {
  // Bind ⌘K / Ctrl+K globally while the host editor is mounted.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const available = actionsForSelection(actions, selection).filter((a) => !a.disabled);
  const grouped = groupActions(available);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Editor command palette"
      className="fixed left-1/2 top-[18%] z-[100] w-[min(560px,90vw)] -translate-x-1/2 overflow-hidden rounded-2xl border border-app-divider bg-app-bg shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
      overlayClassName="fixed inset-0 z-[99] bg-black/40 backdrop-blur-sm"
    >
      <Command.Input
        placeholder={placeholder}
        className="w-full border-b border-app-divider/60 bg-transparent px-4 py-3 text-sm text-app-fg placeholder:text-app-fg-subtle focus:outline-none"
      />
      <Command.List className="max-h-[60vh] overflow-y-auto p-2 [scrollbar-width:thin]">
        <Command.Empty className="py-6 text-center text-[12px] text-app-fg-subtle">
          No matching actions.
        </Command.Empty>
        {Array.from(grouped.entries()).map(([group, items]) => (
          <Command.Group
            key={group}
            heading={group}
            className="px-1 pb-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-app-fg-subtle"
          >
            {items.map((a) => (
              <Command.Item
                key={a.id}
                value={`${a.label} ${a.keywords?.join(" ") ?? ""}`}
                onSelect={() => {
                  onOpenChange(false);
                  void a.run();
                }}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-[12px] text-app-fg aria-selected:bg-amber-500/15 aria-selected:text-amber-100"
              >
                {a.icon ? <span className="shrink-0">{a.icon}</span> : null}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a.label}</span>
                  {a.description ? (
                    <span className="block truncate text-[10px] text-app-fg-subtle">
                      {a.description}
                    </span>
                  ) : null}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        ))}
      </Command.List>
      <div className="flex items-center justify-between border-t border-app-divider/60 bg-app-chip-bg/30 px-3 py-2 text-[10px] text-app-fg-subtle">
        <span>Action runs immediately</span>
        <span className="flex items-center gap-1.5">
          <kbd className="rounded border border-app-divider bg-app-bg px-1 py-px font-mono text-[9px]">↑↓</kbd>
          navigate
          <kbd className="ml-1.5 rounded border border-app-divider bg-app-bg px-1 py-px font-mono text-[9px]">↵</kbd>
          run
          <kbd className="ml-1.5 rounded border border-app-divider bg-app-bg px-1 py-px font-mono text-[9px]">esc</kbd>
          close
        </span>
      </div>
    </Command.Dialog>
  );
}
