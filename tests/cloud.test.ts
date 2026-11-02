import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const enabled = process.env.CAFEOS_CLOUD_TESTS === "1";
const { subscriptionAllowed } = await import("../lib/cloud/access");
test("subscription boundary rejects expired, suspended and invalid dates", () => {
  for (const [status, date] of [
    ["active", new Date(Date.now() - 1).toISOString()],
    ["suspended", new Date(Date.now() + 100000).toISOString()],
    ["active", "broken"],
  ])
    assert.throws(() => subscriptionAllowed(status, date), /expired/);
  subscriptionAllowed("active", new Date(Date.now() + 100000).toISOString());
});
test("concurrent in-memory outlet engines never share data", async () => {
  const { createOutletState, withOutletState, put, get } = await import(
    "../lib/db"
  );
  const run = (marker: string) =>
    withOutletState(
      createOutletState(marker, "disposable-password"),
      undefined,
      async () => {
        put("metadata", "isolation", { marker });
        await new Promise((r) => setTimeout(r, 5));
        assert.deepEqual(get("metadata", "isolation"), { marker });
      },
    );
  await Promise.all([run("outlet-one"), run("outlet-two")]);
});
if (enabled) {
  process.env.CAFEOS_STORAGE = "cloud";
  const { cloudSQL } = await import("../lib/cloud/client");
  const { createOutletState, get, put } = await import("../lib/db");
  const {
    subscriberLogin,
    outletRequest,
    platformLogin,
    platformAdmin,
    credential,
    manageStaff,
  } = await import("../lib/cloud/access");
  const { authenticate, hash } = await import("../lib/auth");
  const { execute, snapshot } = await import("../lib/service");
  const sql = cloudSQL(),
    id = randomUUID(),
    a = randomUUID(),
    b = randomUUID(),
    adminId = "test-" + randomUUID(),
    code = ("TEST-" + randomUUID().slice(0, 8)).toUpperCase(),
    password = "disposable-test-password-123";
  const keyValues = [
    "test-key-one-123456",
    "test-key-two-123456",
    "test-key-three-123456",
  ];
  const request = (token = "") =>
    new Request("http://localhost", {
      headers: { cookie: "cafeos_session=" + token },
    });
  let tokenA = "",
    tokenB = "",
    order: any;
  const command = (action: string, payload: unknown) =>
    execute(authenticate(request(tokenA)), {
      action,
      payload,
      operationId: randomUUID(),
    });
  after(async () => {
    await sql`DELETE FROM cafeos_cloud.sessions WHERE outlet_id IN (${a},${b})`;
    await sql`DELETE FROM cafeos_cloud.outlets WHERE id IN (${a},${b})`;
    await sql`DELETE FROM cafeos_cloud.tenants WHERE id=${id}`;
    await sql`DELETE FROM cafeos_cloud.admin_sessions WHERE admin_id=${adminId}`;
    await sql`DELETE FROM cafeos_cloud.admins WHERE id=${adminId}`;
    await sql`DELETE FROM cafeos_cloud.attempts WHERE id IN (${"subscriber:" + hash(code + ":owner")},${"subscriber:" + hash(code + "B:owner")},${"platform:" + hash(adminId)})`;
    await sql.end({ timeout: 5 });
  });
  test("cloud fixtures are isolated and login creates durable scoped sessions", async () => {
    await sql`INSERT INTO cafeos_cloud.tenants(id,name,status,expires_at) VALUES(${id},'Disposable cloud QA','active',now()+interval '1 day')`;
    for (const [oid, oc] of [
      [a, code],
      [b, code + "B"],
    ])
      await sql`INSERT INTO cafeos_cloud.outlets(id,tenant_id,code,name,state) VALUES(${oid},${id},${oc},'Disposable test outlet',${sql.json(createOutletState("QA", password) as any)})`;
    tokenA = (
      await subscriberLogin(request(), {
        outletCode: code,
        id: "owner",
        password,
      })
    ).token;
    tokenB = (
      await subscriberLogin(request(), {
        outletCode: code + "B",
        id: "owner",
        password,
      })
    ).token;
    assert.equal(
      (
        await outletRequest(request(tokenA), false, () =>
          snapshot(authenticate(request(tokenA))),
        )
      ).orders.length,
      0,
    );
  });
  test("billing, kitchen, stock and idempotency persist across independent requests", async () => {
    order = await outletRequest(request(tokenA), true, () =>
      command("saveOrder", {
        id: randomUUID(),
        version: 0,
        mode: "Dine-in",
        tableNo: 1,
        customer: "Cloud QA",
        lines: [
          {
            id: randomUUID(),
            productId: "samosa",
            qty: 1,
            size: "Regular",
            addons: [],
            note: "",
          },
        ],
      }),
    );
    order = await outletRequest(request(tokenA), true, () =>
      command("sendKitchen", { id: order.id, version: order.version }),
    );
    const stock = await outletRequest(
      request(tokenA),
      false,
      () => snapshot(authenticate(request(tokenA))).ingredients,
    );
    const op = randomUUID();
    const payload = {
      id: order.id,
      version: order.version,
      payments: [{ method: "cash", amount: order.total }],
    };
    const first = await outletRequest(request(tokenA), true, () =>
      execute(authenticate(request(tokenA)), {
        action: "checkout",
        payload,
        operationId: op,
      }),
    );
    const replay = await outletRequest(request(tokenA), true, () =>
      execute(authenticate(request(tokenA)), {
        action: "checkout",
        payload,
        operationId: op,
      }),
    );
    assert.deepEqual(first, replay);
    assert.deepEqual(
      await outletRequest(
        request(tokenA),
        false,
        () => snapshot(authenticate(request(tokenA))).ingredients,
      ),
      stock,
    );
  });
  test("outlet IDs in guessed requests do not cross scopes; database RLS blocks alternate outlet", async () => {
    assert.equal(
      await outletRequest(request(tokenB), false, () =>
        get("orders", order.id),
      ),
      undefined,
    );
    await assert.rejects(
      outletRequest(request(tokenB), true, () =>
        execute(authenticate(request(tokenB)), {
          action: "sendKitchen",
          payload: { id: order.id, version: order.version },
          operationId: randomUUID(),
        }),
      ),
      /not found/,
    );
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('cafeos.outlet_id',${a},true)`;
      await tx.unsafe("SET LOCAL ROLE cafeos_outlet_runtime");
      assert.equal(
        (await tx`SELECT id FROM cafeos_cloud.outlets WHERE id=${b}`).length,
        0,
      );
      await assert.rejects(
        tx`UPDATE cafeos_cloud.outlets SET state=state WHERE id=${b} RETURNING id`.then(
          (rows) => {
            assert.equal(rows.length, 0);
            throw Error("blocked");
          },
        ),
        /blocked/,
      );
    });
  });
  test("concurrent mutations serialize without dropping changes and rollback failures", async () => {
    await Promise.all(
      ["alpha", "beta"].map((marker) =>
        outletRequest(request(tokenA), true, () =>
          put("metadata", marker, { marker }),
        ),
      ),
    );
    for (const marker of ["alpha", "beta"])
      assert.deepEqual(
        await outletRequest(request(tokenA), false, () =>
          get("metadata", marker),
        ),
        { marker },
      );
    await assert.rejects(
      outletRequest(request(tokenA), true, () => {
        put("metadata", "rollback", { bad: true });
        throw Error("test rollback");
      }),
      /rollback/,
    );
    assert.equal(
      await outletRequest(request(tokenA), false, () =>
        get("metadata", "rollback"),
      ),
      undefined,
    );
  });
  test("expiry and suspension block existing sessions and renewal preserves state", async () => {
    const [before] =
      await sql`SELECT state FROM cafeos_cloud.outlets WHERE id=${a}`;
    await sql`UPDATE cafeos_cloud.tenants SET expires_at=now()-interval '1 second' WHERE id=${id}`;
    await assert.rejects(
      outletRequest(request(tokenA), false, () => true),
      /expired/,
    );
    await assert.rejects(
      subscriberLogin(request(), { outletCode: code, id: "owner", password }),
      /expired/,
    );
    await sql`UPDATE cafeos_cloud.tenants SET expires_at=now()+interval '1 day',status='suspended' WHERE id=${id}`;
    await assert.rejects(
      outletRequest(request(tokenA), true, () => true),
      /expired/,
    );
    await sql`UPDATE cafeos_cloud.tenants SET status='active' WHERE id=${id}`;
    const [after] =
      await sql`SELECT state FROM cafeos_cloud.outlets WHERE id=${a}`;
    assert.deepEqual(after.state, before.state);
    assert.ok(
      await outletRequest(request(tokenA), false, () =>
        get("orders", order.id),
      ),
    );
  });
  test("three alternative platform keys work and missing/wrong keys reject", async () => {
    const digest = credential(password),
      keys = keyValues.map((k) => ({ ...credential(k), active: true }));
    await sql`INSERT INTO cafeos_cloud.admins(id,name,salt,password_hash,keys) VALUES(${adminId},'Disposable test admin',${digest.salt},${digest.hash},${sql.json(keys)})`;
    for (const key of keyValues) {
      const t = await platformLogin({ id: adminId, password, key });
      assert.equal(
        (
          await platformAdmin(
            new Request("http://localhost", {
              headers: { cookie: "cafeos_platform=" + t },
            }),
          )
        ).id,
        adminId,
      );
    }
    await assert.rejects(
      platformLogin({ id: adminId, password, key: "wrong" }),
      /incorrect/,
    );
    keys[0].active = false;
    await sql`UPDATE cafeos_cloud.admins SET keys=${sql.json(keys)} WHERE id=${adminId}`;
    await assert.rejects(
      platformLogin({ id: adminId, password, key: keyValues[0] }),
      /incorrect/,
    );
    assert.ok(
      await platformLogin({ id: adminId, password, key: keyValues[1] }),
    );
  });
  test("staff reset revokes old sessions and role permissions stay enforced", async () => {
    await outletRequest(request(tokenA), true, () =>
      manageStaff(authenticate(request(tokenA)), {
        id: "counter",
        name: "QA Counter",
        role: "cashier",
        password,
      }),
    );
    const staff = (
      await subscriberLogin(request(), {
        outletCode: code,
        id: "counter",
        password,
      })
    ).token;
    await assert.rejects(
      outletRequest(request(staff), true, () =>
        manageStaff(authenticate(request(staff)), {
          id: "other",
          name: "Other",
          role: "manager",
          password,
        }),
      ),
      /role/,
    );
    await outletRequest(request(tokenA), true, () =>
      manageStaff(authenticate(request(tokenA)), {
        id: "counter",
        name: "QA Counter",
        role: "cashier",
        password,
      }),
    );
    await assert.rejects(
      outletRequest(request(staff), false, () => authenticate(request(staff))),
      /sign in/,
    );
  });
  test("HTTP routes enforce login, exports, receipt scope and admin controls", async () => {
    const { NextRequest } = await import("next/server");
    const api = await import("../app/api/[...path]/route");
    const platform = await import("../app/api/platform/route");
    const req = (path: string, body?: unknown, cookie = "") =>
      new NextRequest("http://localhost" + path, {
        method: body ? "POST" : "GET",
        headers: {
          host: "localhost",
          cookie,
          origin: "http://localhost",
          "content-type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const login = await api.POST(
      req("/api/login", { outletCode: code, id: "owner", password }),
    );
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.equal(
      (await api.GET(req("/api/state", undefined, cookie))).status,
      200,
    );
    assert.equal(
      (
        await api.GET(
          req("/api/export?kind=orders&format=csv", undefined, cookie),
        )
      ).status,
      200,
    );
    const wrongOrigin = req("/api/command", { action: "anything" }, cookie);
    wrongOrigin.headers.set("origin", "http://evil.invalid");
    assert.equal((await api.POST(wrongOrigin)).status, 403);
    const adminToken = await platformLogin({
        id: adminId,
        password,
        key: keyValues[1],
      }),
      adminCookie = "cafeos_platform=" + adminToken;
    assert.equal((await platform.GET(req("/api/platform"))).status, 401);
    assert.equal(
      (await platform.GET(req("/api/platform", undefined, adminCookie))).status,
      200,
    );
    const limit = await platform.POST(
      req(
        "/api/platform",
        {
          action: "outlet",
          tenantId: id,
          name: "Third",
          code: code + "C",
          ownerPassword: password,
        },
        adminCookie,
      ),
    );
    assert.equal(limit.status, 400);
    const expired = await platform.POST(
      req(
        "/api/platform",
        {
          action: "subscription",
          tenantId: id,
          plan: "QA",
          status: "active",
          expiresAt: new Date(Date.now() - 1000).toISOString(),
          maxOutlets: 2,
        },
        adminCookie,
      ),
    );
    assert.equal(expired.status, 200);
    assert.equal(
      (await api.GET(req("/api/state", undefined, cookie))).status,
      403,
    );
    assert.equal(
      (
        await api.GET(
          req("/api/export?kind=orders&format=csv", undefined, cookie),
        )
      ).status,
      403,
    );
    await platform.POST(
      req(
        "/api/platform",
        {
          action: "subscription",
          tenantId: id,
          plan: "QA",
          status: "active",
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          maxOutlets: 2,
        },
        adminCookie,
      ),
    );
    const reset = await platform.POST(
      req(
        "/api/platform",
        { action: "resetOwner", outletId: a, password: password + "new" },
        adminCookie,
      ),
    );
    assert.equal(reset.status, 200);
    assert.equal(
      (await api.GET(req("/api/state", undefined, cookie))).status,
      401,
    );
    assert.equal(
      (
        await api.POST(
          req("/api/login", {
            outletCode: code,
            id: "owner",
            password: password + "new",
          }),
        )
      ).status,
      200,
    );
    const replacement = await platform.POST(
      req(
        "/api/platform",
        { action: "replaceKey", slot: 2, password, key: keyValues[1] },
        adminCookie,
      ),
    );
    assert.equal(replacement.status, 200);
    const response = await replacement.json();
    assert.ok(response.key.length >= 24);
    assert.equal(
      (await platform.GET(req("/api/platform", undefined, adminCookie))).status,
      401,
    );
    assert.ok(
      await platformLogin({ id: adminId, password, key: response.key }),
    );
    await assert.rejects(
      platformLogin({ id: adminId, password, key: keyValues[2] }),
      /incorrect/,
    );
  });
}
