import { StateBadge } from "@/components/state-badge";

const counts = [
  { label: "Waiting on you" },
  { label: "Red or held" },
  { label: "Unknown or stale" },
] as const;

export default function TodayPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl text-foreground">Today</h1>
        <p className="text-muted-foreground">What changed since you last looked.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {counts.map((item) => (
          <li
            key={item.label}
            className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
          >
            <span className="text-sm text-card-foreground">{item.label}</span>
            <StateBadge state="unknown" />
            <span className="text-sm text-muted-foreground">sources not connected</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
