export default function Docs() {
  return (
    <main className="docs-page">
      <h1>CaféOS local edition</h1>
      <p>
        A compact café workspace for orders, kitchen preparation, manually
        recorded payments and recipe stock. This build serves one outlet on your
        local machine.
      </p>
      <h2>Start a shift</h2>
      <ul>
        <li>
          Sign in using the starter credentials file, then change the password
          in Staff.
        </li>
        <li>
          Tap products to add their regular defaults. Customise a cart line for
          sizes, extras and notes.
        </li>
        <li>
          For dine-in, choose an available table. Hold saves the order for
          later.
        </li>
        <li>
          Send to kitchen consumes recipe ingredients once and creates station
          tickets.
        </li>
        <li>
          Record cash, or verify UPI/card externally and enter its reference.
          Add parts for split payments.
        </li>
        <li>Open the receipt to print or save PDF through your browser.</li>
      </ul>
      <h2>Important boundaries</h2>
      <p>
        No payment gateway, card credentials, aggregator integration, fiscal
        device or proprietary Petpooja API is used. UPI/card and refunds are
        staff-confirmed external transactions. The sample 5% tax is configurable
        demo data; GST registration details, invoice compliance and applicable
        rates need review before live trading.
      </p>
      <p>
        Offline drafts persist in IndexedDB on this browser. Hold while
        disconnected creates a pending local order. Reconnect, sign in if
        needed, and use Sync. A conflicting server version is rejected rather
        than overwritten. Kitchen actions and payment settlement require
        connection. Full offline payment and cross-device synchronization are
        not implemented.
      </p>
      <p>
        Prepared quantities cannot be reduced. Add a new line for changes;
        managers can cancel a whole order with a reason. Cancellation and
        refunds do not return consumed ingredients to stock. Reconcile any waste
        or physical stock through Inventory.
      </p>
      <p>
        Loyalty tracks points by optional customer name; names can collide, and
        rewards are not redeemable yet. Stock predictions use today’s paid-order
        recipe usage with a 20% buffer. The question box is a deterministic
        report lookup, not an LLM.
      </p>
      <h2>Database & security</h2>
      <p>
        The running local edition uses transactional SQLite in{" "}
        <code>data/cafeos.sqlite</code>. PostgreSQL design and a reference
        migration are supplied separately; the production Prisma adapter is not
        wired. Back up the database using a consistent SQLite backup before
        operational use. Do not copy only the main file while writes are active.
      </p>
      <p>
        Passwords are salted and hashed. Sessions use HttpOnly cookies;
        sensitive actions are checked on the server and audited. The app binds
        to loopback. Deploying for other devices requires HTTPS, backup policy,
        staff provisioning, durable hosting and outlet isolation work.
      </p>
      <a href="/">Back to your café →</a>
    </main>
  );
}
