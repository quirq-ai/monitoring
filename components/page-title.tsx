export function PageTitle({ title, lead, children }: { title: string; lead: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl text-foreground">{title}</h1>
        <p className="text-muted-foreground">{lead}</p>
      </div>
      {children}
    </div>
  );
}
