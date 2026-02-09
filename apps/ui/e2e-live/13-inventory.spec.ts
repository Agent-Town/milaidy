import { test, expect, navigateToTab, ensureAgentRunning } from "./fixtures.js";

test.describe("Inventory & Wallet", () => {
  test.beforeEach(async ({ appPage: page }) => { await ensureAgentRunning(page); });

  test("wallet addresses", async ({ appPage: page }) => {
    const d = (await (await page.request.get("/api/wallet/addresses")).json()) as { evmAddress: string | null; solanaAddress: string | null };
    expect("evmAddress" in d).toBe(true);
    expect("solanaAddress" in d).toBe(true);
  });

  test("wallet config key status", async ({ appPage: page }) => {
    const d = (await (await page.request.get("/api/wallet/config")).json()) as Record<string, unknown>;
    for (const k of ["alchemyKeySet", "heliusKeySet", "birdeyeKeySet"]) expect(typeof d[k]).toBe("boolean");
    expect(Array.isArray(d.evmChains)).toBe(true);
  });

  test("update wallet API keys", async ({ appPage: page }) => {
    expect((await page.request.put("/api/wallet/config", { data: { ALCHEMY_API_KEY: "test-key-e2e" } })).status()).toBe(200);
    expect(((await (await page.request.get("/api/wallet/config")).json()) as { alchemyKeySet: boolean }).alchemyKeySet).toBe(true);
  });

  test("wallet balances responds", async ({ appPage: page }) => {
    const d = (await (await page.request.get("/api/wallet/balances")).json()) as Record<string, unknown>;
    expect("evm" in d && "solana" in d).toBe(true);
  });

  test("wallet NFTs responds", async ({ appPage: page }) => {
    const d = (await (await page.request.get("/api/wallet/nfts")).json()) as Record<string, unknown>;
    expect("evm" in d && "solana" in d).toBe(true);
  });

  test("export requires confirmation", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/wallet/export", { data: {} });
    expect(resp.status()).toBe(403);
    const body = (await resp.json()) as { error: string };
    expect(body.error).toMatch(/confirm/i);
  });

  test("export with confirmation returns keys", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/wallet/export", { data: { confirm: true } });
    expect(resp.status()).toBe(200);
    const d = (await resp.json()) as { evm: { privateKey: string } | null; solana: { privateKey: string } | null };
    if (d.evm) expect(d.evm.privateKey.length).toBeGreaterThan(0);
    if (d.solana) expect(d.solana.privateKey.length).toBeGreaterThan(0);
  });

  test("inventory page navigates", async ({ appPage: page }) => {
    await navigateToTab(page, "Inventory");
    await expect(page).toHaveURL(/\/inventory/);
  });

  test("wallet addresses have valid format", async ({ appPage: page }) => {
    const d = (await (await page.request.get("/api/wallet/addresses")).json()) as {
      evmAddress: string | null; solanaAddress: string | null;
    };
    if (d.evmAddress) expect(d.evmAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    if (d.solanaAddress) expect(d.solanaAddress.length).toBeGreaterThan(30);
  });

  test("generate new wallets", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/wallet/generate", { data: { chain: "both" } });
    expect(resp.status()).toBe(200);
    const d = (await resp.json()) as { ok: boolean; wallets: Array<{ chain: string; address: string }> };
    expect(d.ok).toBe(true);
    expect(d.wallets.length).toBeGreaterThanOrEqual(1);
    for (const w of d.wallets) {
      expect(typeof w.address).toBe("string");
      expect(w.address.length).toBeGreaterThan(10);
      expect(["evm", "solana"]).toContain(w.chain);
    }
  });

  test("wallet balances deep shape when keys set", async ({ appPage: page }) => {
    const d = (await (await page.request.get("/api/wallet/balances")).json()) as {
      evm: { address: string; chains: Array<{ chain: string; nativeBalance: string }> } | null;
      solana: { address: string; solBalance: string } | null;
    };
    if (d.evm) {
      expect(typeof d.evm.address).toBe("string");
      expect(Array.isArray(d.evm.chains)).toBe(true);
      for (const c of d.evm.chains) {
        expect(typeof c.chain).toBe("string");
        expect(typeof c.nativeBalance).toBe("string");
      }
    }
    if (d.solana) {
      expect(typeof d.solana.address).toBe("string");
      expect(typeof d.solana.solBalance).toBe("string");
    }
  });

  test("export keys have valid private key format", async ({ appPage: page }) => {
    const d = (await (await page.request.post("/api/wallet/export", { data: { confirm: true } })).json()) as {
      evm: { privateKey: string; address: string } | null;
      solana: { privateKey: string; address: string } | null;
    };
    if (d.evm) {
      expect(d.evm.privateKey).toMatch(/^(0x)?[a-fA-F0-9]{64}$/);
      expect(d.evm.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    }
    if (d.solana) {
      expect(d.solana.privateKey.length).toBeGreaterThan(40);
      expect(d.solana.address.length).toBeGreaterThan(30);
    }
  });
});
