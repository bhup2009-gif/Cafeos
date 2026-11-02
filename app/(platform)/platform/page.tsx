"use client";
import { useEffect, useState, type FormEvent } from "react";
type Tenant = {
  id: string;
  name: string;
  plan: string;
  status: string;
  expires_at: string;
  max_outlets: number;
  outlets: { id: string; code: string; name: string }[];
};
export default function Platform() {
  const [state, setState] = useState<{
      admin: { id: string; name: string };
      tenants: Tenant[];
      audit: {
        actor: string;
        action: string;
        detail: string;
        created_at: string;
      }[];
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [key, setKey] = useState("");
  const load = async () => {
    const r = await fetch("/api/platform", { cache: "no-store" });
    if (r.status === 401) {
      setState(null);
      return;
    }
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    setState(d);
  };
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  const run = async (action: string, body: unknown) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(body as object) }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (d.key) {
        setKey(d.key);
        setState(null);
      } else {
        await load();
        setNotice("Saved");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submit = (action: string) => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = Object.fromEntries(f.entries()) as Record<string, unknown>;
    if (body.expiresAt)
      body.expiresAt = new Date(
        `${body.expiresAt}T23:59:59+05:30`,
      ).toISOString();
    if (action === "replaceKey") body.slot = Number(body.slot);
    run(action, body);
  };
  return (
    <main className="platform-page">
      <header>
        <a href="/">CaféOS</a>
        <h1>Platform administration</h1>
        <p>Subscribers, outlets and access</p>
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {key && (
        <section className="panel">
          <h2>Save your replacement key</h2>
          <p>This is shown once. Your previous key in this slot is revoked.</p>
          <code className="private-key">{key}</code>
          <button onClick={() => setKey("")}>I saved this key</button>
        </section>
      )}
      {!state ? (
        <form className="panel platform-form" onSubmit={submit("login")}>
          <h2>Admin login</h2>
          <label>
            Admin ID
            <input name="id" required autoComplete="username" />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
          <label>
            Any one access key
            <input name="key" type="password" required autoComplete="off" />
          </label>
          <button className="primary" disabled={busy}>
            Sign in
          </button>
          <p>
            Account recovery is available through your authorized server
            operator.
          </p>
        </form>
      ) : (
        <>
          <div className="platform-toolbar">
            <span>{state.admin.name}</span>
            <button onClick={() => run("logout", {})}>Sign out</button>
          </div>
          <details className="panel">
            <summary>Add subscriber</summary>
            <form className="platform-form" onSubmit={submit("create")}>
              <label>
                Business name
                <input name="name" required maxLength={80} />
              </label>
              <label>
                First outlet name
                <input name="outletName" required maxLength={80} />
              </label>
              <label>
                Outlet ID
                <input name="code" required pattern="[A-Za-z0-9_-]{3,30}" />
              </label>
              <label>
                Plan
                <input name="plan" defaultValue="Trial" required />
              </label>
              <label>
                Outlet limit
                <input
                  name="maxOutlets"
                  type="number"
                  min="1"
                  max="500"
                  defaultValue="1"
                  required
                />
              </label>
              <label>
                Access through (India date)
                <input name="expiresAt" type="date" required />
              </label>
              <label>
                Owner password
                <input
                  name="ownerPassword"
                  type="password"
                  required
                  minLength={12}
                  autoComplete="new-password"
                />
              </label>
              <button className="primary" disabled={busy}>
                Create subscriber & outlet
              </button>
              <p>
                Owner staff ID: <strong>owner</strong>. Share credentials
                privately.
              </p>
            </form>
          </details>
          <section>
            <h2>Subscribers ({state.tenants.length})</h2>
            {!state.tenants.length && (
              <p>No subscribers yet. Add the first subscriber above.</p>
            )}
            {state.tenants.map((t) => (
              <article className="panel" key={t.id}>
                <h3>{t.name}</h3>
                <p>
                  {t.status === "suspended"
                    ? "Suspended"
                    : new Date(t.expires_at).getTime() <= Date.now()
                      ? "Expired"
                      : "Active"}{" "}
                  · {t.plan} · {t.outlets.length} outlets
                </p>
                <form
                  className="platform-form inline-form"
                  onSubmit={submit("subscription")}
                >
                  <input type="hidden" name="tenantId" value={t.id} />
                  <label>
                    Plan
                    <input name="plan" defaultValue={t.plan} required />
                  </label>
                  <label>
                    Access through (India date)
                    <input
                      name="expiresAt"
                      type="date"
                      defaultValue={new Date(
                        new Date(t.expires_at).getTime() + 19800000,
                      )
                        .toISOString()
                        .slice(0, 10)}
                      required
                    />
                  </label>
                  <label>
                    Outlet limit
                    <input
                      name="maxOutlets"
                      type="number"
                      min="1"
                      max="500"
                      defaultValue={t.max_outlets}
                      required
                    />
                  </label>
                  <label>
                    Status
                    <select name="status" defaultValue={t.status}>
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                    </select>
                  </label>
                  <button disabled={busy}>Save subscription</button>
                </form>
                <p>
                  Expiry and suspension block access. All saved data is
                  retained.
                </p>
                <ul>
                  {t.outlets.map((o) => (
                    <li key={o.id}>
                      <strong>{o.code}</strong> · {o.name}
                      <details>
                        <summary>Reset owner access</summary>
                        <form
                          className="platform-form"
                          onSubmit={submit("resetOwner")}
                        >
                          <input type="hidden" name="outletId" value={o.id} />
                          <label>
                            Replacement owner password
                            <input
                              name="password"
                              type="password"
                              required
                              minLength={12}
                              autoComplete="new-password"
                            />
                          </label>
                          <button disabled={busy}>
                            Reset owner password & revoke owner sessions
                          </button>
                        </form>
                      </details>
                    </li>
                  ))}
                </ul>
                <details>
                  <summary>Add outlet</summary>
                  <form className="platform-form" onSubmit={submit("outlet")}>
                    <input type="hidden" name="tenantId" value={t.id} />
                    <label>
                      Outlet name
                      <input name="name" required />
                    </label>
                    <label>
                      Outlet ID
                      <input
                        name="code"
                        pattern="[A-Za-z0-9_-]{3,30}"
                        required
                      />
                    </label>
                    <label>
                      Owner password
                      <input
                        name="ownerPassword"
                        type="password"
                        minLength={12}
                        required
                        autoComplete="new-password"
                      />
                    </label>
                    <button disabled={busy}>Add outlet</button>
                  </form>
                </details>
              </article>
            ))}
          </section>
          <details className="panel">
            <summary>Replace an access key</summary>
            <form className="platform-form" onSubmit={submit("replaceKey")}>
              <label>
                Key slot
                <select name="slot">
                  <option value="0">Key 1</option>
                  <option value="1">Key 2</option>
                  <option value="2">Key 3</option>
                </select>
              </label>
              <label>
                Current password
                <input type="password" name="password" required />
              </label>
              <label>
                Any current valid key
                <input type="password" name="key" required />
              </label>
              <button disabled={busy}>
                Replace key & sign out all admin sessions
              </button>
            </form>
          </details>
          <section className="panel">
            <h2>Platform activity</h2>
            {state.audit.map((a, i) => (
              <p key={i}>
                <strong>{a.action}</strong> · {a.detail} · {a.actor} ·{" "}
                {new Date(a.created_at).toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                })}
              </p>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
