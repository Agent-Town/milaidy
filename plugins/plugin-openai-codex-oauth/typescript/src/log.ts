export function dbg(runtime: any, msg: string) {
  try {
    // Prefer runtime logger when present.
    runtime?.logger?.debug?.(msg);
  } catch {}
  try {
    // eslint-disable-next-line no-console
    console.log(msg);
  } catch {}
}
