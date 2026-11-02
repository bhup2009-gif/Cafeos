"use client";
import { useState, type FormEvent } from "react";
export default function StaffAccounts() {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      body = Object.fromEntries(new FormData(form));
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setMessage(
        "Staff account saved. Previous sessions for this staff ID were revoked.",
      );
      form.reset();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="panel">
      <summary>Manage outlet staff accounts</summary>
      <p>
        Create or reset a manager, cashier or kitchen account for this outlet.
      </p>
      <form className="platform-form" onSubmit={save}>
        <label>
          Staff ID
          <input name="id" required pattern="[a-zA-Z0-9_-]{1,80}" />
        </label>
        <label>
          Name
          <input name="name" required />
        </label>
        <label>
          Role
          <select name="role">
            <option value="cashier">Cashier</option>
            <option value="barista">Kitchen / barista</option>
            <option value="manager">Manager</option>
          </select>
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            minLength={12}
            required
            autoComplete="new-password"
          />
        </label>
        <button disabled={busy}>Save staff account</button>
      </form>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
