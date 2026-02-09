/** Kills spawned servers and cleans up the isolated test HOME. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const STATE_FILE = path.join(os.tmpdir(), "milaidy-e2e-live-state.json");

interface State { apiPid: number | null; vitePid: number | null; testHome: string | null; reusedApi: boolean; reusedUi: boolean }

function kill(pid: number, label: string): void {
  for (const sig of ["SIGTERM", "SIGKILL"] as const) {
    try { process.kill(pid, sig); } catch { /* dead */ }
    if (sig === "SIGTERM") {
      console.log(`  [e2e-live] SIGTERM → ${label} (${pid})`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
    }
  }
}

export default async function globalTeardown(): Promise<void> {
  if (!fs.existsSync(STATE_FILE)) return;
  const s: State = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as State;

  if (s.vitePid && !s.reusedUi) kill(s.vitePid, "Vite");
  if (s.apiPid && !s.reusedApi) kill(s.apiPid, "API");

  if (s.testHome?.startsWith(os.tmpdir()))
    fs.rmSync(s.testHome, { recursive: true, force: true });

  fs.unlinkSync(STATE_FILE);
  console.log("  [e2e-live] Teardown done");
}
