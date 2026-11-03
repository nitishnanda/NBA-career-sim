#!/bin/bash
# Rebuild vendor/anthropic-sdk-<version>.min.js: the official Anthropic TypeScript SDK bundled for the browser (global window.AnthropicSDK).
# Only the GitHub Pages build (dist/index.html) includes it: there the player can paste their own API key in settings.
# The artifact build does not (inside Claude the page uses Claude directly). Usage: bash scripts/build-sdk.sh [version]
set -e; V="${1:-0.134.0}"; D=$(mktemp -d); cd "$D"; npm init -y >/dev/null
npm install --silent "@anthropic-ai/sdk@$V" esbuild@0.24.0
echo "import Anthropic from '@anthropic-ai/sdk'; globalThis.AnthropicSDK = Anthropic;" > entry.js
npx esbuild entry.js --bundle --minify --format=iife --platform=browser --target=es2020 --outfile=out.js
cd - >/dev/null; cp "$D/out.js" "vendor/anthropic-sdk-$V.min.js"; echo "wrote vendor/anthropic-sdk-$V.min.js"
