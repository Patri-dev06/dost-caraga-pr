import type { ReactNode } from "react";
import { LinkIcon } from "lucide-react";

/** Frame for the public Supplier Portal: agency header, no app navigation, printable. */
export function PortalShell({ agency, children }: { agency?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background print:bg-white">
      <header className="border-b border-border bg-card print:border-black">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 py-3">
          <img src="/dost-seal.svg" alt="" className="h-9 w-9" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-navy">{agency || "Department of Science and Technology - Caraga"}</p>
            <p className="text-xs text-muted-foreground">Supplier Portal</p>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl px-4 py-6">{children}</main>
      <footer className="mx-auto w-full max-w-4xl px-4 pb-8 text-xs text-muted-foreground print:hidden">
        This page was sent to you by the DOST Caraga Supply Unit. Keep the link private — anyone with it can open this request.
      </footer>
    </div>
  );
}

export function PortalError({ message }: { message: string }) {
  return (
    <PortalShell>
      <div className="mx-auto max-w-md py-20 text-center">
        <LinkIcon className="mx-auto h-8 w-8 text-muted-foreground" />
        <h1 className="mt-4 text-lg font-semibold text-navy">This link can't be opened</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <p className="mt-4 text-xs text-muted-foreground">If you think this is a mistake, contact the DOST Caraga Supply Unit for a new link.</p>
      </div>
    </PortalShell>
  );
}
