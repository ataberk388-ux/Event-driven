/**
 * Runs once when the Next.js server boots. We validate the environment here so a
 * misconfigured deployment fails immediately with a clear message instead of
 * throwing vague 500s on the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEnv } = await import("@synapse/env");
    getEnv();
  }
}
