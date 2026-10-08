import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while a page's snapshot is being built, so a tap on a phone answers at once. Each page
 * segment has its own loading.tsx that renders this; the repo page has none, because a Suspense
 * boundary would stream a 200 before `notFound()` can answer 404.
 */
export function PageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40 rounded-lg" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
      </div>
    </div>
  );
}
