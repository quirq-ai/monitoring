import {
  Check,
  CircleHelp,
  Clock,
  History,
  OctagonX,
  Pause,
  type LucideIcon,
} from "lucide-react";

export const states = [
  "green",
  "red",
  "held",
  "pending",
  "unknown",
  "stale",
] as const;

export type State = (typeof states)[number];

const icons: Record<State, LucideIcon> = {
  green: Check,
  red: OctagonX,
  held: Pause,
  pending: Clock,
  unknown: CircleHelp,
  stale: History,
};

export function StateBadge({ state }: { state: State }) {
  const Icon = icons[state];
  return (
    <span className={`state-badge state-${state}`} data-state={state}>
      <Icon aria-hidden="true" />
      <span>{state}</span>
    </span>
  );
}
