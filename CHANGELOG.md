# Changelog

All notable changes to ReMemory are documented here.

## Unreleased

- **Time-delayed recovery** — You can now set a waiting period when creating bundles. Even if your friends combine their pieces early, the files stay locked until the date you chose. Uses the [League of Entropy](https://www.cloudflare.com/en-ca/leagueofentropy/) — a distributed randomness beacon run by organizations around the world, not a single company. This is experimental: recovery requires a brief internet connection, and relies on the beacon continuing to operate. CLI: `rememory seal --timelock 30d`. Also available in the web maker under "Advanced options."

## v0.0.15 — 2026-02-21

- **ZIP archive format** — Encrypted payloads now use ZIP instead of tar.gz. ZIP is understood by every operating system without extra tools, which makes manual inspection easier if someone ever needs it. Existing bundles created with earlier versions still work — the recovery tool detects the format automatically.
- **Recover directly from bundles** — `rememory recover` now accepts bundle ZIP files. You can pass the ZIPs your friends send you without unzipping them first, and the manifest is extracted automatically. `rememory recover bundle-alice.zip bundle-bob.zip` just works.

## v0.0.14 — 2026-02-19

- **Improved Docs**: improve guides on the website. Also updated demo bundles so it contains 5 friends instead of 3.

## v0.0.13 — 2026-02-18

- **Simpler recovery tool** — The recovery tool (`recover.html`) no longer relies on WebAssembly. It now uses plain JavaScript, making it smaller, faster to load, and more likely to work in browsers for decades to come. The CLI and bundle creation still use Go, but recovery — the part your friends will use — is now built on simpler, more universal technology.
- **Bigger files, simpler recovery** — Encrypted archives up to 10 MB (up from 5 MB) are now embedded directly in `recover.html`. More people will be able to recover by just opening the HTML file, without needing the separate `MANIFEST.age`.
- **PDF import in recovery** — PDFs from bundles now contain a machine-readable share appended to the file. You can drop a PDF directly into the recovery tool instead of typing or scanning — it just works.
- **QR scanning on more browsers** — Added a polyfill for browsers that don't support the BarcodeDetector API, so QR code scanning works in more places.
- **Tappable email addresses** — Email addresses in the contact list are now `mailto:` links, so you can tap them on a phone instead of copying and pasting. Thanks @vnykmshr!
- **Accessibility improvements** — Keyboard users can now see where they are when tabbing through the recovery tool (focus indicators). Improved contrast for muted text to meet WCAG AA. Added ARIA attributes for screen readers.
- **Safer sealing** — Running `seal` on a project where you haven't added any files to the manifest (only the template README) now gives a clear error instead of creating a useless encrypted bundle.
- **Better drop zones** — Improved the look and behavior of file drop areas in the recovery tool.
- **Language detection fix** — Regional browser locales (like `en-GB` or `es-MX`) are now detected correctly instead of falling back to English.
- **Updated Slovenian translations** — Thanks @h200101!

## v0.0.12 — 2026-02-13

- **Chinese (Traditional) support** — Added zh-TW as a seventh language for the recovery tool, maker, and bundle instructions. Thank you @JasonHK!
- **Portuguese translations** — Added Portuguese as a sixth supported language.
- **Language picker** — Both the recovery tool and maker now have a language switcher, so people can choose their language themselves.
- **Named and anonymous toggle in maker** — The maker UI now has a clear selector for choosing between named and anonymous bundles, instead of burying the option.
- **Security hardening** — Added Content Security Policy headers to prevent XSS. Added size limits to ZIP extraction in the browser path (thanks @vnykmshr). Applied additional safety validations from a [security review](docs/security-review.md).
- **PDF polish** — Updated colours to better match the palette, added a coloured identity bar, and tweaked the header layout.

## v0.0.11 — 2026-02-11

- **PDF redesign** — The README PDF has a clearer visual hierarchy and now shows the recovery rule ("2 of 3 required") prominently, so friends know at a glance how many people need to come together.
- **Consistent colour palette** — Standardized colours across the website, recovery tool, and PDF to use the same warm, low-contrast palette throughout.
- **PDF screenshots in README** — The project README now shows example PDF pages so people can see what friends receive before trying the tool.

## v0.0.10 — 2026-02-11

- **Embedded manifest in recovery bundles** — If your encrypted manifest is under 5 MB, it's now embedded directly inside `recover.html`. Friends can recover secrets without needing the separate `MANIFEST.age` file at all — just open the HTML file and go.
- **Per-friend language support** — Each friend can now have their own language preference. READMEs and BIP39 word lists in bundles are translated to their language using official translated word lists.
- **Intro card in the recovery tool** — A welcome card now explains what `recover.html` is and how it works, making the first-time experience less confusing for non-technical friends.
- **Improved recovery navigation** — The top navigation adapts based on whether the recovery tool is personalized (from a bundle) or generic (standalone download).
- **PDF layout fix** — QR codes no longer break across page boundaries in PDFs.
- **Guidance on revoking access** — Added documentation on what to do if you need to cut someone out of your recovery group.

## v0.0.9 — 2026-02-10

- **PDF word list fix** — Fixed a bug where BIP39 word lists in the PDF could split awkwardly across many pages, making them hard to read.

## v0.0.8 — 2026-02-10

The biggest release so far — a new protocol version, word-based shares, QR codes, and a more flexible contact system.

- **Protocol V2** — Shamir secret sharing now operates on raw bytes instead of base64-encoded strings. This produces shorter, more efficient shares. V1 bundles remain fully recoverable.
- **BIP39 word lists** — Each share can now be represented as 24 human-readable words (similar to Bitcoin seed phrases). Supports English, Spanish, French, German, and Slovenian. This makes it possible to write a share on paper, print it, or read it over the phone — no digital device required.
- **QR codes in PDFs** — Each friend's PDF now includes a QR code containing their share. Scanning the code is the fastest way to enter a share during recovery.
- **Compact share format** — A new shorter encoding for shares, used in QR codes and other space-constrained contexts.
- **Flexible contact field** — The separate "phone" and "email" fields have been replaced with a single free-text "contact" field. Put whatever you want in it — phone, email, Signal handle, physical address.
- **Recovery UX improvements** — Better messaging when only one more share is needed to reach the threshold. Improved flow after real-world testing with printed PDFs.
- **Standalone recovery tool** — A generic `recover.html` (not tied to any specific bundle) is now available for download from GitHub Releases. QR codes in PDFs link to it.
- **Backward compatibility testing** — Added golden test fixtures for V1 to ensure old bundles remain recoverable as the protocol evolves.

## v0.0.7 — 2026-02-08

- **Slovenian language support** — Added Slovenian as a fifth supported language for the recovery UI and instructions. Thanks to @h200101!
- **Unicode name fix** — Fixed an issue where non-ASCII characters in friend names (accents, umlauts, etc.) could cause problems when creating bundle folders.
- **Path traversal protection** — Hardened tar.gz extraction against directory traversal attacks. Thanks to @vnykmshr!

## v0.0.6 — 2026-02-05

- **Release fix** — Resolved an issue with GitHub release publishing.

## v0.0.5 — 2026-02-05

- **Anonymous mode** — New option to create bundles without identifying information, for privacy-conscious setups where you don't want friend names in the bundles.
- **Redesigned website** — The homepage got a visual refresh with a cleaner layout.
- **Improved error handling** — Better error messages and guidance throughout the recovery flow.

## v0.0.4 — 2026-02-04

- **Web-based bundle creation** — You can now create recovery bundles entirely in the browser using `maker.html`, no CLI needed. Available on the project website.
- **Project website** — A proper landing page with documentation, hosted on GitHub Pages.
- **Smaller, faster recovery tool** — The WebAssembly payload in `recover.html` is now gzip-compressed and stripped down to only what's needed for recovery, making the file smaller and faster to load.
- **Bug fix: files lost when adding more** — Fixed a bug in the web UI where adding more files would cause previously added files to disappear.
- **Better translations** — Improved localization across supported languages.
- **Apache 2.0 license** — The project is now licensed under Apache 2.0.

## v0.0.3 — 2026-02-03

- **Personalized recovery bundles** — Each friend now gets a customized `recover.html` with their share pre-loaded and contact information for the other friends embedded. No more copying and pasting shares — just open the file and follow the steps.
- **Share verification** — The recovery tool now validates shares before attempting decryption, catching typos and errors early with a clear message instead of a cryptic failure.
- **Security hardening** — Tightened file permissions on generated bundles and added warnings when attempting to encrypt symlinks (which could lead to unexpected behavior).

## v0.0.2 — 2026-02-03

- **Auto-bundling** — Running `seal` now automatically generates friend bundles in one step, instead of requiring a separate `bundle` command.
- **Documentation cleanup** — Reorganized and improved the guides and README.

## v0.0.1 — 2026-02-03

The first release of ReMemory.

- **Encrypt and split** — Encrypt files with [age](https://github.com/FiloSottile/age) and split the decryption key among trusted friends using [Shamir's Secret Sharing](https://en.wikipedia.org/wiki/Shamir%27s_secret_sharing) (via HashiCorp Vault's implementation).
- **Offline browser recovery** — Each friend receives a self-contained `recover.html` that works offline in any browser. No servers, no internet, no installation — just open the file.
- **PDF instructions** — Each friend's bundle includes a PDF with clear recovery instructions and their share.
- **Multi-language support** — Recovery instructions available in English, Spanish, German, and French.
- **CLI tool** — Commands to initialize a project, seal secrets, generate bundles, and recover.
