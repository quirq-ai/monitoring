// Failure records planted on purpose to exercise the pipeline. They carry no demo flag, so the
// dashboard recognises them by subject. A demo record is shown with a label but never counted.
export const DEMO_SUBJECTS: readonly string[] = ["planted-canary-demo-v0"];

export function isDemoSubject(subject: string | undefined): boolean {
  return Boolean(subject && DEMO_SUBJECTS.includes(subject));
}
