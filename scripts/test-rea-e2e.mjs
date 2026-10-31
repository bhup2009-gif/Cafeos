import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const cli = process.env.REA_CLI || resolve("../AI Agent/rea/scripts/rea.mjs");
const password = readFileSync("data/starter-credentials.txt", "utf8")
  .split("\n")
  .find((x) => x.startsWith("owner: "))
  ?.slice(7);
if (!password)
  throw Error(
    "The local starter owner account is needed for this disposable demo test.",
  );
const result = spawnSync(
  process.execPath,
  [
    cli,
    "capture-browser-scenario",
    resolve("tests/e2e-scenario.json"),
    "--format",
    "json",
  ],
  {
    env: {
      ...process.env,
      CAFEOS_E2E_PASSWORD: password,
      REA_DARWIN_SWIFTC_PATH:
        "/Library/Developer/CommandLineTools/usr/bin/swiftc",
      SDKROOT: "/Library/Developer/CommandLineTools/SDKs/MacOSX15.5.sdk",
      REA_DARWIN_MODULE_CACHE_PATH: "/private/tmp/cafeos-rea-module-cache",
    },
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: 120000,
  },
);
writeFileSync("docs/rea-e2e-result.json", result.stdout);
if (result.status !== 0) {
  console.error("REA E2E capture failed. Inspect docs/rea-e2e-result.json.");
  process.exit(1);
}
const evidence = JSON.parse(result.stdout),
  capture = evidence.normalized_result;
const final = capture.steps.at(-1).artifacts.accessibility?.value?.text || "";
if (
  capture.steps.some((s) => s.status !== "completed") ||
  !final.includes("Your receipt") ||
  !final.includes("₹315")
)
  throw Error("The final cash receipt was not verified.");
console.log(
  JSON.stringify(
    {
      passed: true,
      evidence_id: evidence.evidence_id,
      steps: capture.steps.length,
      cleanup: capture.browser.cleanup,
      two_item_cash_checkout_clicks_excluding_login: 4,
    },
    null,
    2,
  ),
);
