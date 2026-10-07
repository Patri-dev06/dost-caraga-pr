import { X } from "lucide-react";
import { Toaster as Sonner, toast, useSonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  // Several messages stack into one group; a single "Clear all" above the stack dismisses them together.
  const { toasts } = useSonner();
  return (
    <>
      <Sonner
        className="toaster group"
        closeButton
        toastOptions={{
          classNames: {
            toast:
              "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
            description: "group-[.toast]:text-muted-foreground",
            actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
            cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          },
        }}
        {...props}
      />
      {toasts.length > 1 && (
        <button
          type="button"
          onClick={() => toast.dismiss()}
          className="fixed bottom-[7.5rem] right-6 z-[999999999] flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground shadow-md hover:bg-secondary print:hidden"
        >
          <X className="h-3.5 w-3.5" /> Clear all ({toasts.length})
        </button>
      )}
    </>
  );
};

export { Toaster };
