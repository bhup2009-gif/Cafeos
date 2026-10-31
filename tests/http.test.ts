import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const base = process.env.CAFEOS_TEST_URL;
test(
  "HTTP: anonymous access, CSRF checks, login session and server-side role enforcement",
  { skip: !base },
  async () => {
    const origin = new URL(base!).origin;
    assert.equal((await fetch(`${base}/api/state`)).status, 401);
    const password = readFileSync("data/starter-credentials.txt", "utf8")
      .split("\n")
      .find((x) => x.startsWith("cashier: "))!
      .slice(9);
    const cross = await fetch(`${base}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://example.invalid",
      },
      body: JSON.stringify({ id: "cashier", password }),
    });
    assert.equal(cross.status, 403);
    const signed = await fetch(`${base}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ id: "cashier", password }),
    });
    assert.equal(signed.status, 200);
    const cookie = signed.headers.get("set-cookie")!.split(";")[0];
    assert.ok(signed.headers.get("set-cookie")!.includes("HttpOnly"));
    const state = await fetch(`${base}/api/state`, {
      headers: { Cookie: cookie },
    });
    assert.equal(state.status, 200);
    assert.equal((await state.json()).user.role, "cashier");
    const denied = await fetch(`${base}/api/command`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operationId: crypto.randomUUID(),
        action: "refund",
        payload: {
          id: "any",
          reason: "Synthetic test refund",
          confirmed: true,
        },
      }),
    });
    assert.equal(denied.status, 403);
    const receipt = await fetch(`${base}/receipt/unknown`);
    assert.ok((await receipt.text()).includes("Sign in to view receipts"));
    const logout = await fetch(`${base}/api/logout`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: origin,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(logout.status, 200);
    assert.equal(
      (await fetch(`${base}/api/state`, { headers: { Cookie: cookie } }))
        .status,
      401,
    );
  },
);
