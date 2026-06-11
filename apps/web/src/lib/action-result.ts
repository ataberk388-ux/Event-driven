/** Standard return shape for server actions so the client can toast cleanly. */
export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}
