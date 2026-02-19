# AGENTS.md

This file provides guidance for contributors and coding agents in this repository.

## What is ReMemory

ReMemory encrypts files with [age](https://github.com/FiloSottile/age), splits the decryption key among trusted friends using Shamir's Secret Sharing (via HashiCorp Vault's implementation), and gives each friend a self-contained offline recovery tool (`recover.html`) that works in any browser without servers or internet.

## Ownership Mindset

**You own the outcome, not just the task.** This isn't typical software where bugs get patched next sprint. A recovery bundle might sit in a drawer for ten years, then be opened by someone who just lost a loved one. You won't be there to fix it. The code you write today must work perfectly for someone you'll never meet, in circumstances you can't predict.

This changes how you work:

- **Search before creating.** Before adding a constant, helper, or type, grep for where it might already exist. Data should have one source of truth. If you need a list of values, find where the authoritative list lives and derive from it — don't create a second copy that will drift.
- **Trace all connections.** When removing or changing something, find every reference: code, styles, translations, types, tests, comments, build config. Use grep. Removing a feature means removing the HTML elements, the CSS classes, the translation keys, the JS functions, the tests — all of it. If you're surprised by leftover references after making a change, you didn't trace thoroughly enough.
- **Delete, don't hide.** If something shouldn't exist, remove it completely. Don't comment it out, don't hide it with CSS, don't wrap it in a conditional. Dead code is confusing code.
- **Verify before claiming done.** After any change, grep for related terms, rebuild, run tests. You should never be surprised by leftover references — you should have found them first.
- **Understand the system before changing it.** Read the existing implementation. Understand why it works the way it does. Match its patterns and standards.

The goal is simple: when someone opens `recover.html` years from now, everything should just work. That requires code written by someone who cared enough to get every detail right.

## Development Principles

- **Care and attention to detail.** This software protects important information for real people. Mistakes can mean lost secrets, failed recoveries, or leaked data. Being thorough means checking your own work, matching the standards already in the codebase, and not leaving loose ends for others to find.
- **Empathy.** The people recovering secrets may be non-technical, stressed, or grieving. Every message, instruction, and UI choice should be clear, patient, and helpful. Lend a hand, don't assume expertise.
- **Stand the test of time.** Recovery bundles may sit untouched for years or decades before they're needed. Avoid dependencies on external services, ephemeral formats, or assumptions about the future. The bundles must work even if this project disappears.
- **Universality.** The recovery experience must work across platforms, browsers, and languages.
- **Considered tone.** When writing user-facing copy, every word should feel placed, not emitted. Stay honest about what this tool is and isn't. Don't oversell or make grand claims. See the **Voice & Copy** section below for detailed guidance.
- **Shared logic across CLI and browser.** Cryptographic operations and core logic live in `internal/core/` and are reused by both the CLI and browser paths. Don't duplicate — centralize. Before creating a new constant or helper, grep to see if it already exists elsewhere. Data should have one source of truth.
- **Tests verify safety.** Write a failing test first, then make it pass. This applies everywhere — Go unit tests, integration tests, and Playwright browser tests alike. If you can't demonstrate the test failing without your change, you can't be sure it's actually testing anything. Any change that touches `recover.html` or `maker.html` needs a corresponding Playwright test. Run the tests yourself before calling something done — don't leave verification to others.
- **Keep docs current.** When changing behavior, update the relevant docs, README, and this AGENTS.md file in the same change.
- **No network in recovery.** `recover.html` must not make network requests. Avoid adding dependencies that could pull remote resources (fonts, CDNs, analytics, etc.).
- **Stable formats.** The share format, bundle layout, and recovery steps are part of the protocol. Changing them requires migration thinking, updated test fixtures, and clear rationale.

## Feel

Remember who is reading this. Someone creating bundles may be confronting their own mortality, planning for the worst, or already dealing with loss. Someone recovering files may have just lost a person they love. They may be scared, overwhelmed, or grieving. They are not "users" in the normal sense. They are people in a hard moment, trying to do something important.

The design should make them feel safe, guided, not rushed, not judged. Soft, warm, paper-like, non-corporate. Low contrast by design: easy on stressed eyes.

### Voice & Copy

The voice is **quiet presence**. The copy should feel like it was written by someone who cares — you just shouldn't be able to point at any one sentence and say "that's the caring sentence." The kindness is structural: it's in the clarity, the pacing, the fact that someone thought about what you'd need to hear.

**What to avoid is not friendliness — it's *performed* friendliness.** "Don't worry, you got this!" is performing. A sentence that simply tells you what to do next, clearly and without rushing you, is kind. A proverb someone chose because they believe it is kind. "We're here for you!" is not.

**The core principle:** write like someone who took time to choose these words. Not like someone filling in a template, not like someone trying to sound warm. Just a person who cares, writing carefully.

**Cadence:**
- Sentences that don't rush. Short is fine. But not clipped.
- Phrasing that doesn't feel mechanical.
- Words that feel placed, not emitted.
- Leave room for a human touch — a subtitle that means something, a phrase that only a person would choose. Not every line needs to be minimal.

**Concrete rules:**
- Say "people you trust" in outward-facing copy, not "trusted friends." But in documents addressed *to* those people (the README in a bundle), they are friends — call them that. Say "pieces" not "shares" in user-facing text.
- Prefer human words over technical ones. "Unlocking..." not "Decrypting..." "Opening archive..." not "Reading archive..." "Decide how many friends must agree" not "Choose a threshold appropriate for your needs."
- Address people directly, not passively. "You'll need to combine this with other shares." not "This must be combined with other shares."
- Minimal doesn't mean stripped. A quiet "Done." before a result count is human. "Everything's ready" is warmer than "Ready" without being verbose. "All bundles are ready." says the bundles are ready for their purpose, not just that a process completed.
- No exclamation marks. Period.
- Use em dashes ( — ) not double hyphens (--) or unspaced dashes.
- Drop filler: "simply", "just", "easily", "basically." (But "please" is fine when it's genuine, not reflexive — asking someone to wait is a good place for it.)
- Don't start guidance with "Make sure you're..." — say what to do: "Use the README.txt file from a bundle."
- Contractions are fine where they sound natural ("don't", "can't", "won't"). Don't force them and don't avoid them.
- Status messages should be concise but human. "Loading..." not "Preparing the recovery tool..." But "Unlocking..." is better than "Decrypting..." — use the word a person would use.
- Success should be quiet, not silent. "All bundles are ready." not "All bundles created successfully!"

**The vibe:**
- Not: "Don't worry, you got this!" (performed warmth)
- Not: "Execute the following procedure." (mechanical)
- Not: "Here is what to do." (correct but cold)
- But: "Here's what to do." — and then instructions so clear they feel like kindness.

Calm, steady, human. Considered. Kind.

### Color palette

| Role                | Hex       | RGB             | Use                                              |
|---------------------|-----------|-----------------|--------------------------------------------------|
| Paper (background)  | `#f5f5f5` | (245, 245, 245) | Page background. Clean, neutral.                 |
| Paper light (cards) | `#ffffff` | (255, 255, 255) | Cards, elevated surfaces.                        |
| Text                | `#2E2A26` | (46, 42, 38)    | Primary text. Warm dark brown, not black.         |
| Text secondary      | `#6B6560` | (107, 101, 96)  | Hints, captions, secondary text.                 |
| Text muted          | `#8A8480` | (138, 132, 128) | Timestamps, metadata, least-prominent text.      |
| Sage (accent)       | `#55735A` | (85, 115, 90)   | Primary accent: buttons, step numbers, banners.  |
| Sage dark           | `#466B4A` | (70, 107, 74)   | Hover/active state for sage elements.            |
| Sage tint           | `#E8EFEA` | (232, 239, 234) | Soft info blocks, section headers, code blocks.  |
| Sage light          | `#E8F2EA` | (232, 242, 234) | Subtitle bars, success backgrounds.              |
| Sand                | `#f0f0ee` | (240, 240, 238) | Neutral highlight blocks, procedure cards.       |
| Rose                | `#F3E6E6` | (243, 230, 230) | Gentle emphasis. Not alarm — just "hey, read this." |
| Dusty blue          | `#7A8FA6` | (122, 143, 166) | Secondary accent: links, diagrams, step badges.  |
| Dusty blue dark     | `#647A8F` | (100, 122, 143) | Hover/active state for dusty blue elements.      |
| Border              | `#ddd`    | (221, 221, 221) | Card borders, dividers.                          |
| Border light        | `#eee`    | (238, 238, 238) | Subtle separators.                               |

**Avoid:** pure black (`#000000`), bright red, corporate blue, high-contrast anything.

These values apply to the PDF (`internal/pdf/readme.go`), website CSS (`internal/html/assets/styles.css`), HTML templates. The only exception is the dataflow animation (`internal/html/assets/dataflow.js`).

## Non-goals

- No server-side component.
- No network calls in the recovery path.
- No telemetry or analytics.
- No dependency on external CDNs or remote resources.
- No runtime dependency on Node/npm for end users or recovery.
- No promise of "revocation" once shares are distributed — you can't unsend data.
- No custom cryptographic primitives — composition of established tools only (age, Shamir via HashiCorp Vault).
- No "guaranteed to work forever" claims — the goal is durability, not certainty.

## Security Invariants

These must not regress. Reference them in reviews.

- `recover.html` must work offline, from a local `file://` open, without installation.
- Bundles must be self-contained and must not require this repo, any server, or the internet to function.
- Below-threshold shares must not leak information about the secret (information-theoretic security). Don't add metadata to shares that could weaken this.
- Manifest encryption must remain age-based. No custom crypto.
- Any cryptographic change requires tests, review, and clear rationale.

## Build & Development Commands

```bash
make build          # Compile TypeScript, build create.wasm, then build CLI binary
make test           # Run all Go tests (go test -v ./...)
make lint           # Run go vet + gofmt check
make test-e2e       # Run Playwright browser tests (requires: npm install, npx playwright install)
make html           # Generate static site into dist/ (index.html, maker.html, docs.html, recover.html)
make serve          # Build static site and serve at localhost:8000
```

Run a single test:
```bash
go test -v -run TestName ./internal/core/
```

The build pipeline is: **TypeScript (esbuild) -> WASM (for maker.html) -> Go binary**. Always use `make test` instead of bare `go test ./...` — the Go build embeds compiled `.wasm` and `.js` files via `//go:embed`, so `go test` will fail if those assets haven't been generated first.

## Architecture

### WASM and Native JS

- **`recover.html`** uses **native JavaScript crypto** (no WASM). Dependencies like `age-encryption`, `shamir-secret-sharing`, `fflate`, and `tarparser` are bundled via esbuild into `app.js`. This keeps bundles small (~170KB) and avoids WASM compatibility issues.
- **`maker.html`** uses **WASM** (`create.wasm`) for bundle creation. Built with `-tags create` from `internal/wasm/`. Entry point: `main_create.go`.
  `GOOS=js GOARCH=wasm go build -tags create -o internal/html/assets/create.wasm ./internal/wasm`

The WASM module exposes Go functions to JavaScript via `syscall/js` (registered in `main_create.go`), with the JS bridge in `js_wrappers.go`.

`make html` generates self-contained HTML files into `dist/` (`index.html`, `maker.html`, `docs.html`, `recover.html`).

### HTML generation with embedded assets

`internal/html/embed.go` uses `//go:embed` to bundle all assets (HTML templates, CSS, JS) into the Go binary. The `recover.go`, `maker.go`, `docs.go`, and `index.go` files in `internal/html/` generate self-contained HTML by string-replacing `{{PLACEHOLDER}}` tokens with embedded assets.

For `maker.html`, WASM is gzip-compressed and base64-encoded inline. **Circular dependency avoidance:** `create.wasm` itself embeds the html package (for bundle creation), so `create.wasm` cannot be embedded via `//go:embed` in the html package. Instead, the CLI binary loads `create.wasm` at init time and injects it via `html.SetCreateWASMBytes()`.

For `recover.html`, no WASM is needed — all crypto is native JavaScript bundled in `app.js`.

### Bundle generation

Each friend's ZIP bundle contains: `README.txt`, `README.pdf`, `MANIFEST.age`, and a personalized `recover.html` (with their share pre-loaded and contact list embedded). Generated by `internal/bundle/`.

When `MANIFEST.age` is 10 MB or less, it is also base64-encoded and embedded in the personalization JSON inside `recover.html` (`PersonalizationData.ManifestB64`). This lets recovery work without the separate file. The CLI flag `--no-embed-manifest` on `seal` and `bundle` commands disables this. The WASM/maker path always embeds when small enough.

- `internal/bundle/readme.go` — Generates README.txt (Go string builder, not a template)
- `internal/pdf/readme.go` — Generates README.pdf (via go-pdf/fpdf)
- `internal/project/templates/manifest-readme.md` — Go template for the README.md placed inside `manifest/` when a project is initialized (the guide users fill in with their secrets)

### Key packages

- `internal/core/` — Cryptographic primitives: Shamir split/combine, age encrypt/decrypt, share encoding (PEM-like `BEGIN REMEMORY SHARE` format), tar.gz archive
- `internal/project/` — Project config (`project.yml`), friend definitions, template rendering
- `internal/manifest/` — Archive/extract the manifest directory
- `internal/cmd/` — Cobra CLI commands (init, seal, bundle, recover, verify, demo, html, status, doc)
- `internal/wasm/` — WASM entry points exposing Go crypto to the browser
- `internal/html/` — HTML generation with embedded assets, asset embedding
- `e2e/` — Playwright tests for browser-based recovery and creation flows

### TypeScript

Frontend code lives in `internal/html/assets/src/`. Compiled via esbuild to IIFE bundles (not ES modules):
- `shared.ts` — Common utilities (toast notifications, formatting)
- `app.ts` — Recovery UI (`recover.html`), uses native JS crypto from `crypto/` subdirectory
- `create-app.ts` — Bundle creation UI (`maker.html`), uses WASM

The `crypto/` subdirectory contains the native JavaScript crypto implementations for recovery: Shamir combining, age decryption, tar.gz extraction, share parsing, BIP39 word encoding. These replace the WASM module that was previously used.

## Testing

- **Go unit tests:** Standard `_test.go` files alongside packages. `internal/integration_test.go` has end-to-end Go tests covering the full seal-and-recover flow.
- **Playwright E2E tests:** `e2e/` directory tests the browser-based recovery and creation tools. Requires building the binary first (`make test-e2e` handles this).

## CI/CD (GitHub Actions)

Three workflows in `.github/workflows/`:

- **`ci.yml`** — Runs on push/PR to `main`. Builds WASM, runs Go tests, lints, builds the binary, then runs Playwright E2E tests. Requires both Go and Node 22.
- **`pages.yml`** — Runs on push to `main`. Builds the CLI, generates static HTML files (`index.html`, `maker.html`, `docs.html`) and deploys to GitHub Pages. Does not include `recover.html` (that's only distributed in bundles and releases).
- **`release.yml`** — Triggered by `v*` tags. Runs tests, cross-compiles for 5 platforms (`make build-all`), generates standalone `maker.html` + `recover.html`, creates demo bundles (3 friends, threshold 2), computes checksums, and publishes a GitHub release. Use `make bump-patch`, `bump-minor`, or `bump-major` to create version tags.

## Contributing

- **Small PRs, incremental improvements.** Keep pull requests focused and reviewable. A series of small, well-scoped PRs is better than one large change.
- **Discuss before building big things.** For major features, refactors, or architectural changes, open an issue to discuss the approach first. Once there's agreement on a plan, break the work into sub-issues and land it incrementally. Don't open a large PR out of the blue.
- **Bug fixes and small improvements can go straight to PR.** Not everything needs a discussion — use your judgment. If the change is self-contained and obvious, just open the PR.

### Changelog

`CHANGELOG.md` entries should focus on **what changed for the person using ReMemory**, not on implementation details. Lead with the user-facing outcome, then explain just enough context for it to make sense.

- **Good:** "Encrypted archives up to 10 MB are now embedded directly in `recover.html`. More people will be able to recover by just opening the HTML file."
- **Bad:** "Raised `MaxEmbeddedManifestSize` from 5 MB to 10 MB."

Think about what someone deciding whether to upgrade would want to know. Internal refactors, constant changes, and code reorganization don't belong unless they affect what people experience. Follow the voice and cadence of existing entries — read a few before writing a new one.

## Nix

This project uses a Nix flake for reproducible development environments. **When a command fails to find a dependency (e.g., `esbuild`, `go`), use `nix develop -c` — do not work around it with `npx` or other alternatives.**

```bash
nix develop -c make build    # Build everything
nix develop -c make test     # Run tests
nix develop -c make test-e2e # Run Playwright tests
```

If `make` itself doesn't resolve, use `/usr/bin/make` directly.
