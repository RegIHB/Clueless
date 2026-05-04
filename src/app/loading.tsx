import { Skeleton } from "./components/ui/skeleton";

export default function Loading() {
  return (
    <div
      className="min-h-screen flex flex-col gap-8 px-6 md:px-12 lg:px-20 py-10"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <span className="sr-only">Loading…</span>

      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>

      <div className="grid lg:grid-cols-2 gap-10 items-center pt-6">
        <div className="space-y-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-12 w-[80%]" />
          <Skeleton className="h-12 w-[65%]" />
          <Skeleton className="h-5 w-[90%] mt-4" />
          <Skeleton className="h-5 w-[70%]" />
          <div className="flex gap-3 pt-4">
            <Skeleton className="h-11 w-36 rounded-full" />
            <Skeleton className="h-11 w-32 rounded-full" />
          </div>
        </div>
        <Skeleton className="aspect-[4/5] w-full rounded-2xl" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
