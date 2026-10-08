import { states, type State } from "@/lib/signal";

export { states, type State };

const dots: Record<State, string> = {
  green: "bg-state-green",
  red: "bg-state-red",
  held: "bg-state-held",
  pending: "bg-state-pending",
  unknown: "border-[1.5px] border-state-unknown",
  stale: "bg-state-stale",
};

/**
 * The state's marker: an 8 px dot in the state color, at least 3:1 on every surface. Every state
 * is a filled circle except `unknown`, which is an outlined one, so a missing value never reads
 * like a quiet one from across the room. Used by StateBadge and by the count tiles.
 */
export function StateDot({ state, className = "" }: { state: State; className?: string }) {
  return <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dots[state]} ${className}`} />;
}

/**
 * The one way to show a state: the dot and the state word in the text color on a quiet muted
 * pill, so the word carries the meaning, the color only speeds it up, and a badge inside a
 * sentence ("held at verify since ...") does not run into the words after it.
 */
export function StateBadge({ state }: { state: State }) {
  return (
    <span data-state={state} className="state-badge inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium whitespace-nowrap text-foreground">
      <StateDot state={state} />
      <span>{state}</span>
    </span>
  );
}
