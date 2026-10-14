// A line diff for the review screen: the changed lines with one line of context around each run,
// numbered as in the old and new file. Settings files are a few hundred lines, so a plain LCS
// table is small enough.

export type DiffLine = { kind: "same" | "del" | "add" | "gap"; text: string; old?: number; new?: number };

export function lineDiff(before: string, after: string, context = 1): DiffLine[] {
  const a = before === "" ? [] : before.split("\n");
  const b = after === "" ? [] : after.split("\n");
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const all: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      all.push({ kind: "same", text: a[i], old: i + 1, new: j + 1 });
      i++;
      j++;
    } else if (i < n && (j === m || lcs[i + 1][j] >= lcs[i][j + 1])) {
      all.push({ kind: "del", text: a[i], old: i + 1 });
      i++;
    } else {
      all.push({ kind: "add", text: b[j], new: j + 1 });
      j++;
    }
  }
  const keep = all.map((l) => l.kind !== "same");
  const near = all.map((_, k) => {
    for (let d = -context; d <= context; d++) if (keep[k + d]) return true;
    return false;
  });
  const out: DiffLine[] = [];
  all.forEach((line, k) => {
    if (near[k]) out.push(line);
    else if (out.length && out.at(-1)!.kind !== "gap") out.push({ kind: "gap", text: "" });
  });
  if (out.at(-1)?.kind === "gap") out.pop();
  return out;
}
