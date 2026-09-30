import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { COMMON_RFQ_DOCUMENTS, rfqDocumentLines, rfqDocumentsLead } from "@/lib/rfq-format";

/**
 * The letter's "…together with the following documents" part, editable in place: it reads exactly
 * as it will print (none, one inline such as the TOR, or a numbered list), with a remove button on
 * each document and an "Add document" menu of the usual ones plus anything typed in.
 */
export function RfqDocumentsEditor({ value, onChange }: { value: string[]; onChange: (documents: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const lines = rfqDocumentLines(value);
  const suggestions = COMMON_RFQ_DOCUMENTS.filter((d) => !value.includes(d));

  const add = (document: string) => {
    const text = document.trim();
    if (!text || value.includes(text)) return;
    onChange([...value, text]);
    setCustom("");
    setOpen(false);
  };
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));

  return (
    <div>
      <p className="mt-1">{rfqDocumentsLead(value)}</p>
      {/* One document is named inline in the sentence above; it still gets a remove button here. */}
      {value.length === 1 && (
        <p className="no-print mt-0.5 pl-4">
          <DocumentChip label={value[0]} onRemove={() => remove(0)} />
        </p>
      )}
      {lines.length > 0 && (
        <ol className="mt-1 space-y-0.5 pl-4">
          {lines.map((line, i) => (
            <li key={`${i}-${line}`} className="group flex items-center gap-1">
              <span>{line}</span>
              <button type="button" onClick={() => remove(i)} className="no-print rounded p-0.5 text-red-400 opacity-0 hover:text-red-600 group-hover:opacity-100" aria-label={`Remove ${value[i]}`}>
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ol>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="no-print mt-1 ml-4 inline-flex items-center gap-1 rounded px-1 text-[10px] font-medium text-primary hover:bg-primary/10" style={{ fontFamily: "var(--font-sans)" }}>
            <Plus className="h-3 w-3" /> Add document
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-2" style={{ fontFamily: "var(--font-sans)" }}>
          <p className="px-1 pb-1 text-xs font-semibold text-muted-foreground">Documents the supplier submits</p>
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {suggestions.map((d) => (
              <button key={d} type="button" onClick={() => add(d)} className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-secondary">
                {d}
              </button>
            ))}
            {suggestions.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">All the usual documents are listed.</p>}
          </div>
          <form
            className="mt-2 flex gap-1.5 border-t border-border pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              add(custom);
            }}
          >
            <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Another document…" className="h-8 text-sm" />
            <Button type="submit" size="sm" className="h-8" disabled={!custom.trim()}>Add</Button>
          </form>
          {value.length > 0 && (
            <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 w-full text-xs text-muted-foreground" onClick={() => { onChange([]); setOpen(false); }}>
              Ask for no documents
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function DocumentChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[10px]" style={{ fontFamily: "var(--font-sans)" }}>
      {label}
      <button type="button" onClick={onRemove} className="text-red-400 hover:text-red-600" aria-label={`Remove ${label}`}>
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
