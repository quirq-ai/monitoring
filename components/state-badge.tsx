import { states, type State } from "@/lib/signal";

export { states, type State };

const dots: Record<State, string> = {
  green: "bg-state-green",
  red: "bg-state-red",
  held: "bg-state-held",
  pending: "bg-state-pending",
  unknown: "bg-state-unknown",
  stale: "bg-state-stale",
};

/**
 * The one way to show a state: a dot in the state's color (the 3:1 marker) and the state word in
 * the text color, so the word carries the meaning and the color only speeds it up. The dot is a
 * filled circle for every state except `unknown`, which is an outlined one, so a missing value
 * never reads like a quiet one from across the room.
 */
export function StateBadge({ state }: { state: State }) {
  return (
    <span data-state={state} className={`state-badge inline-flex w-fit shrink-0 items-center gap-1.5 text-xs font-medium whitespace-nowrap text-foreground`}>
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${state === "unknown" ? "border-[1.5px] border-state-unknown" : dots[state]}`} />
      <span>{state}</span>
    </span>
  );
}
