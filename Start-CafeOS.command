#!/bin/zsh
cd "${0:A:h}" || exit 1
cafeos_node="$(command -v node)"
if [[ -z "$cafeos_node" ]]; then
  cafeos_node="/Users/bhupendra/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [[ ! -x "$cafeos_node" ]]; then
  print 'Node.js 24.15 or newer is required. See README.md.'
  exit 1
fi
print 'Open http://127.0.0.1:3100 · Ctrl+C to stop CaféOS.'
if [[ -f .next/BUILD_ID ]]; then
  exec "$cafeos_node" node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100
else
  exec "$cafeos_node" node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3100
fi
