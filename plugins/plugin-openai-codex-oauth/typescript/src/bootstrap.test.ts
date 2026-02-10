import { describe, expect, test, vi } from "vitest";

import { initCodexOAuthTextDelegates } from "./bootstrap.js";

function makeRuntime() {
  const models = new Map<string, Array<{ handler: any }>>();
  return {
    models: {
      get: (k: string) => models.get(k),
    },
    _models: models,
    registerModel: (key: string, handler: any) => {
      const arr = models.get(key) ?? [];
      arr.push({ handler });
      models.set(key, arr);
    },
    useModel: async (key: string, params: any) => {
      const h = models.get(key)?.[0]?.handler;
      if (!h) throw new Error(`No handler found for delegate type: ${key}`);
      return await h({}, params);
    },
  } as any;
}

describe("initCodexOAuthTextDelegates", () => {
  test("does nothing when creds missing", async () => {
    const rt = makeRuntime();

    const storage = await import("./storage-codex.js");
    vi.spyOn(storage, "readCodexCreds").mockReturnValue(null as any);

    const res = await initCodexOAuthTextDelegates(rt);
    expect(res.enabled).toBe(false);
    expect(res.registered).toEqual([]);
    expect(rt._models.size).toBe(0);
  });

  test("registers TEXT_SMALL/TEXT_LARGE and returns strings (stub path)", async () => {
    const rt = makeRuntime();

    const storage = await import("./storage-codex.js");
    vi.spyOn(storage, "readCodexCreds").mockReturnValue({
      access: "fake",
      refresh: "fake",
      expires: Date.now() + 60_000,
      accountId: "acct",
    } as any);

    // Use stub output (no network)
    const stub = await import("./stub.js");
    vi.spyOn(stub, "stubText").mockResolvedValue("Pong!" as any);

    const res = await initCodexOAuthTextDelegates(rt);
    expect(res.enabled).toBe(true);
    expect(res.registered).toEqual(["TEXT_SMALL", "TEXT_LARGE"]);

    const small = await rt.useModel("TEXT_SMALL", { prompt: "ping" });
    const large = await rt.useModel("TEXT_LARGE", { prompt: "ping" });
    expect(typeof small).toBe("string");
    expect(typeof large).toBe("string");
    expect(small).toBe("Pong!");
    expect(large).toBe("Pong!");
  });

  test("only-if-missing: does not override existing handler", async () => {
    const rt = makeRuntime();
    rt.registerModel("TEXT_SMALL", async () => "existing");

    const storage = await import("./storage-codex.js");
    vi.spyOn(storage, "readCodexCreds").mockReturnValue({ access: "fake", refresh: "fake", expires: Date.now() + 60_000 } as any);

    const stub = await import("./stub.js");
    vi.spyOn(stub, "stubText").mockResolvedValue("Pong!" as any);

    const res = await initCodexOAuthTextDelegates(rt);
    expect(res.enabled).toBe(true);
    // TEXT_SMALL already existed, so we should only register TEXT_LARGE.
    expect(res.registered).toEqual(["TEXT_LARGE"]);

    const small = await rt.useModel("TEXT_SMALL", { prompt: "ping" });
    expect(small).toBe("existing");
  });
});
