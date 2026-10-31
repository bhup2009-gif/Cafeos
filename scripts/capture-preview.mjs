import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const mobile = process.argv.includes("--mobile");
const password = readFileSync("data/starter-credentials.txt", "utf8")
  .split("\n")
  .find((x) => x.startsWith("owner: "))
  ?.slice(7);
const scenario = mobile
  ? "docs/preview-mobile-scenario.json"
  : "docs/preview-scenario.json";
const result = spawnSync(
  process.execPath,
  [
    resolve("../AI Agent/rea/scripts/rea.mjs"),
    "capture-browser-scenario",
    resolve(scenario),
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
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120000,
  },
);
writeFileSync(
  mobile ? "docs/rea-mobile-result.json" : "docs/rea-preview-result.json",
  result.stdout,
);
if (result.status !== 0) process.exit(1);
const evidence = JSON.parse(result.stdout);
const artifacts = evidence.normalized_result.steps.at(-1).artifacts;
const screenshot = artifacts.screenshot.value;
writeFileSync(
  mobile
    ? "docs/screenshots/pos-mobile.png"
    : "docs/screenshots/pos-desktop.png",
  Buffer.from(screenshot.data_base64, "base64"),
);
const shortcut = artifacts.accessibility.value.text.includes("View order");
if (mobile && !shortcut)
  throw Error("The mobile View order shortcut was not found");
console.log(
  JSON.stringify({
    evidence_id: evidence.evidence_id,
    cleanup: evidence.normalized_result.browser.cleanup,
    mobile,
    mobileOrderShortcut: shortcut,
  }),
);
