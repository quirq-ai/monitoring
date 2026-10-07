// The person the "waiting on you" question is about. One GitHub login, from the environment so
// the dashboard can be run for someone else without a code change.
export const OWNER = process.env.MONITORING_OWNER?.trim() || "sharmasuraj0123";

export function assertLogin(login: string): void {
  if (!/^[A-Za-z0-9-]{1,39}$/.test(login)) throw new Error(`not a GitHub login: ${login}`);
}
