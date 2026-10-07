/** A 7-character commit id in mono, linked to the full commit. */
export function Sha({ sha, url }: { sha: string; url: string }) {
  return (
    <a href={url} className="font-mono text-sm underline-offset-2 hover:underline" rel="noreferrer">
      {sha.slice(0, 7)}
    </a>
  );
}
