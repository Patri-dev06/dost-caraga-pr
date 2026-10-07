import type { MouseEvent } from "react";

/**
 * Lets a whole list row open its document, not just the number in it. Links, buttons and other
 * controls inside the row keep their own behaviour, selecting text doesn't navigate, and
 * Cmd/Ctrl-click opens the document in a new tab.
 */
export function rowClick(open: () => void, href?: string) {
  return (event: MouseEvent<HTMLElement>) => {
    // Pop-overs and dialogs opened from a row render elsewhere in the page but still bubble here.
    if (!event.currentTarget.contains(event.target as Node)) return;
    if ((event.target as HTMLElement).closest("a, button, input, select, textarea, label, [role='button'], [role='checkbox'], [data-row-click-ignore]")) return;
    if (window.getSelection()?.toString()) return;
    if ((event.metaKey || event.ctrlKey) && href) {
      window.open(href, "_blank", "noopener");
      return;
    }
    open();
  };
}
