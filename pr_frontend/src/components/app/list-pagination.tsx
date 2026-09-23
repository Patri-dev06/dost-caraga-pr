import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Previous/Next control for a server-paginated list. Renders nothing on a single page, so it's
 * safe to drop at the bottom of any list without a conditional at the call site.
 */
export function ListPagination({
  page,
  lastPage,
  total,
  onPageChange,
  className,
}: {
  page: number;
  lastPage: number;
  total?: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (lastPage <= 1) return null;
  return (
    <div className={cn("flex items-center justify-between border-t border-border pt-3", className)}>
      <Button variant="outline" size="sm" className="gap-1 border-border" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        <ChevronLeft className="h-3.5 w-3.5" /> Previous
      </Button>
      <span className="text-xs text-muted-foreground">
        Page {page} of {lastPage}
        {total != null ? ` · ${total} total` : ""}
      </span>
      <Button variant="outline" size="sm" className="gap-1 border-border" disabled={page >= lastPage} onClick={() => onPageChange(page + 1)}>
        Next <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
