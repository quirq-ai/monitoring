import { Check, CircleHelp, Clock, History, OctagonX, Pause, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { states, type State } from "@/lib/signal";

export { states, type State };

const icons: Record<State, LucideIcon> = {
  green: Check,
  red: OctagonX,
  held: Pause,
  pending: Clock,
  unknown: CircleHelp,
  stale: History,
};

/** The one way to show a state: a shadcn outline Badge in the state's color, icon plus word. */
export function StateBadge({ state }: { state: State }) {
  const Icon = icons[state];
  return (
    <Badge variant="outline" data-state={state} className={`state-badge state-${state} border-current font-semibold`}>
      <Icon aria-hidden="true" />
      <span>{state}</span>
    </Badge>
  );
}
