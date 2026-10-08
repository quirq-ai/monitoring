export function PageTitle({ title, lead, children }: { title: string; lead: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl text-foreground sm:text-3xl">{title}</h1>
        <p className="text-sm text-muted-foreground sm:text-base">{lead}</p>
      </div>
      {children}
    </div>
  );
}
