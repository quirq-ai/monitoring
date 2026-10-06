import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <h1 className="text-3xl">Not found</h1>
      <p className="text-muted-foreground">No registry names a repo by that name, so nothing was read for it.</p>
      <Link href="/board" className="underline-offset-2 hover:underline">
        Back to the board
      </Link>
    </div>
  );
}
