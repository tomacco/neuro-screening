# Neuro-Screening

Digital, tablet-friendly versions of several neurodevelopmental screening questionnaires.
Static site — **no server, no accounts, no personal data leaves the device**. Runs on GitHub Pages.

The whole app is **access-gated**: every questionnaire ships **encrypted**, and only holders of
a per-user key can unlock it. This keeps the tool private (it is not meant for the open public) and
keeps the instrument text out of the public repository as plaintext. See **NOTICE.md** for copyright.

## How the gate works
- Each test module is encrypted (AES-256-GCM) under a single **content key (CEK)**.
- `assets/enc/grants.json` holds the CEK **wrapped once per user** (PBKDF2-SHA256). It is ciphertext —
  safe to publish. Without a passphrase it is opaque.
- On first visit the user enters their passphrase → it unwraps the CEK → the encrypted modules are
  fetched, decrypted, and run in the browser. The CEK is cached in `localStorage` (a **Cerrar acceso**
  button clears it).
- The keys, plaintext sources, and build tooling live in a **separate private repo**
  (`neuro-screening-admin`). This public repo only ever contains ciphertext.

> Threat model: keep the general public out and keep a defensible copyright posture — **not** bank-grade
> security. A determined key-holder can extract the plaintext; that is an accepted trade-off.

## Features
- Unified, calm, high-contrast UI; large tap targets for iPad/tablet.
- One generic runner (`test.html?t=<id>`) driven by per-test data modules.
- **Three language variants** per item, switchable live: `Original` (verbatim), `LatAm`, `España`.
- Autosave to `localStorage`, per user (multiple profiles on one device).
- **Share by link (keyless):** a shared result is fully self-contained — ciphertext in `?s=`, decode
  key in the URL `#fragment` (never sent to a server). The recipient needs **no** access key; they see
  only that one result, rendered read-only on `resultados.html`.
- **Export to PDF** via the browser print dialog.
- **Interpretation** (cutoff bands) behind an optional toggle — *never* included in the PDF.

## Tests
| id | Instrument | Items |
|----|-----------|-------|
| `aq` | Autism Spectrum Quotient (adult) | 50 |
| `asrs` | Adult ADHD Self-Report Scale v1.1 | 18 |
| `catq` | Camouflaging Autistic Traits Questionnaire | 25 |
| `alexitimia` | Online Alexithymia Questionnaire (OAQ-G2) | 37 |
| `sensorial` | Adolescent/Adult Sensory Profile ⚠️ *copyrighted* | 60 |

## Run locally
```
python serve.py     # → http://127.0.0.1:8000/  (no-cache static server)
```
You need a valid access key to get past the lock screen. Content decryption uses WebCrypto, which
requires a secure context — `127.0.0.1`/`localhost` and HTTPS both qualify.

## Structure
```
index.html / test.html      access-gated landing + generic runner
resultados.html             keyless, self-contained shared-results viewer
assets/js/crypto.js         WebCrypto helpers (interop with the admin build)
assets/js/gate.js           lock screen + unlock + encrypted-module loader
assets/js/engine.js         registry, runner, share-bundle builder/renderer
assets/enc/*.enc            encrypted test modules (built by the admin repo)
assets/enc/grants.json      per-user wrapped content key
assets/enc/manifest.json    module load order
.nojekyll                   serve files verbatim on GitHub Pages
```

Plaintext sources, keys, and the encryption build script are **not** here — they live in the private
`neuro-screening-admin` repo.
