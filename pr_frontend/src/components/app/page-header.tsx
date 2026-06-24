import { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 border-b border-border/60 pb-5 sm:flex-row sm:items-end sm:justify-between sm:pb-6">
      <div className="min-w-0">
        {eyebrow && <p className="label-eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-xl font-bold text-navy sm:text-2xl lg:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex w-full flex-col gap-2 min-[420px]:flex-row min-[420px]:flex-wrap min-[420px]:[&>*]:w-auto sm:w-auto sm:items-center [&>*]:w-full">{actions}</div>}
    </div>
  );
}
