# Project brief: "Offline Library" Windows app for a USB drive

Read this whole file before doing anything. Then do the **Phase 0 spikes** and report results before building the real app.

## 1. Who this is for and why it exists

- **The owner** is not a programmer. They will sell finished USB drives to preppers in their local community. Explain what you are doing in plain language, keep code simple and commented, and never assume they know a tool or term.
- **The customers** are non-technical. They plug in a drive, double-click one thing, and expect it to work with no internet, no installing, no editing files, and no setup. Support burden is the owner's main cost, so **fewer moving parts and clear error messages beat clever features**.
- **The product** is a single Windows application that runs entirely from the USB drive and gives the customer:
  1. A **Library**: Wikipedia plus other books stored as Kiwix ZIM files.
  2. **Maps**: offline OpenStreetMap maps stored as **StreetZim** ZIM files (they are ZIM books with a MapLibre-based viewer inside; they are served like any other book).
  3. An **AI assistant** that answers questions using only what is in the library (retrieval-augmented generation, "RAG"), shows its sources, and runs locally with no internet.
  4. A **Help** page and a safe **Shut down**.

## 2. Hard requirements (non-negotiable)

1. **Self-contained on the drive.** Everything needed to run is on the USB drive. No installers, no admin rights, no registry writes, no dependency on Python/Node/Java being installed on the customer's PC.
2. **Own window.** The app opens in its own application window. It must **not** open or depend on the customer's default browser. No visible address bar, no browser chrome. (Back, Forward and Home buttons inside the app are fine and wanted.)
3. **One double-click.** The top level of the drive shows only: the start file, `HELP.txt` (was `START-HERE.html`, see D12), and a few folders. No visible console/terminal window when running.
4. **Offline and private.** The app makes **zero** network requests except to `127.0.0.1`. Enforce this in code (block everything else) so a customer never gets surprise traffic and the content is guaranteed offline. No telemetry, no update checks, no analytics.
5. **Works from any drive letter and any path**, including paths with spaces and non-ASCII characters, and from both exFAT and NTFS volumes. Never hard-code a drive letter or absolute path.
6. **Never writes to the customer's PC outside the drive**, except what Windows itself requires for temp files. Configure any framework data/cache directories to live on the drive (or in `%TEMP%` if the drive is write-protected). The app **must still run if the drive is read-only.** Avoid heavy or constant writes to the drive (flash wear).
7. **Fails gracefully with plain-language messages.** Examples: not enough RAM for the AI, a missing model, no ZIM files found, a port conflict, a crashed engine. Every error says what happened and what the customer can do, in sentence case, with no jargon and no apologies.
8. **Clean shutdown.** Closing the window, the Shut down button, or ending the task must stop every child process (Kiwix, the AI engine). No orphans left running on the customer's PC. Do not rely on killing processes by image name globally; track the PIDs you started (and clean up stale ones from a crashed previous run by verifying the PID's executable path).
9. **Single instance.** A second launch focuses the existing window instead of starting a second copy.
10. **Windows 10 (64-bit) and Windows 11** are the targets. Assume ordinary consumer laptops, many old, some with 4 GB of RAM and no good graphics.

## 3. What already exists (prototype)

The owner has a working-in-theory prototype kit (unzip it into `prototype/`). It was written without the ability to run it, so **none of it has been tested against real binaries**. Treat it as a reference for intent, not as proven code. It consists of:

- `Start.bat` plus `_system/launcher.py` (standard-library Python): finds ZIMs in `library/`, starts `kiwix-serve.exe` and `llama-server.exe` hidden, picks the AI model by RAM, serves a home page and API, opens the default browser.
- `_system/portal/index.html`: the home page (buttons for Library, Maps, Help; an "Ask the AI" box; a Shut down button; AI status line).
- `START-HERE.html`: the customer guide.
- `PRODUCTION-CHECKLIST.md`: the drive layout and test routine for the owner.

Behaviors in the prototype worth keeping:

- Auto-detect every `*.zim` in `library/`; Maps appear as buttons for any book whose name contains `street`, `map` or `osm` (and is not Wikipedia).
- Model tiers by physical RAM: `models/small.gguf` (6 GB or more), `medium.gguf` (12 GB or more), `large.gguf` (24 GB or more, optional). Pick the best that fits and exists. Below 6 GB: AI off, with a friendly message, Library and Maps still work.
- Free ports chosen at runtime, bound to `127.0.0.1` only.
- RAG flow: turn the question into search keywords (via the model), search the library, read the top articles' text, answer using only the excerpts, show sources, add a safety note for medical or safety topics.

## 4. Target design ("Level B"): one packaged app

Replace the Python launcher + browser with **one packaged desktop application** that bundles the proven engines as child processes:

- **Kiwix-tools** (`kiwix-serve.exe`) serves ZIM content. Do not rewrite ZIM reading; Kiwix handles redirects, search, file types and the StreetZim viewer.
- **llama.cpp** (`llama-server.exe`) runs the AI (OpenAI-compatible HTTP API on localhost; ships a basic web UI that we will not use).
- The **app shell** (window, UI, process management, RAG logic) is the new code.

### Window technology: decide in Phase 0, with evidence

The hard requirement is independence from the customer's browser and setup. Evaluate and choose:

- **Option 1, bundled Chromium (e.g. Electron):** fully self-contained and the most predictable (same engine everywhere). Large (roughly 100 to 250 MB), which is fine on a 256 GB+ drive. **Default choice unless the spikes show a problem.**
- **Option 2, system WebView2 (e.g. Tauri):** much smaller, but depends on the Edge WebView2 runtime being present (it is on Windows 11 and most updated Windows 10 machines, but not guaranteed on old or offline ones). If chosen, a bundled fixed-version runtime or a clear failure message is required.

Pick one, justify in a short note in `docs/decisions.md`, and say what it means for the owner (size, risk). Avoid options that need Visual C++ redistributables or admin installs on the customer's PC unless those are bundled and verified.

### Process and UI architecture

- Main process: finds the drive root (relative to the executable; with portable-style builds use the real on-drive location, not the temp extraction folder), scans `library/` and `models/`, starts Kiwix and the AI, exposes status to the UI, runs the RAG pipeline, and handles shutdown.
- One window with a simple top bar: **Home, Back, Forward, Library, Maps, Ask, Help, Shut down**, plus a small AI status indicator (starting, ready, unavailable).
- The Library and Maps views embed the Kiwix pages (an embedded web view or iframe). Links that leave `127.0.0.1` are blocked. Make sure Back/Forward work across embedded navigation.
- Disable developer tools and the context menu in production builds. Allow page zoom (Ctrl +/-, and Ctrl+0 to reset); the audience includes older people.
- Rewrite the RAG logic in the app's own language so **Python is no longer needed on the drive.**

### Drive layout (target)

```
(drive root)
  Start.<ext>             the one thing customers double-click (no console window)
  HELP.txt                the customer guide (opens in Notepad; see docs/decisions.md D12)
  _system/                app, kiwix/, llama/, logs/, data/ (all on the drive)
  library/                *.zim (Wikipedia, guides, StreetZim maps, ...)
  models/                 small.gguf  medium.gguf  large.gguf
  LICENSES/
```

If the packaging tool forces the executable into a subfolder, put a tiny launcher at the root. Acceptance test: a customer sees one obvious thing to double-click and no console window flashes.

## 5. Functional requirements

### Startup
- Show a branded splash or loading screen immediately; do the slow work behind it.
- Scan `library/` for ZIMs. If none, show a plain "No books found on this drive" screen with what to do.
- Start `kiwix-serve` with all ZIMs; wait until it answers. Determine each book's **slug/name** from Kiwix's catalog (`/catalog/v2/entries`) and verify which name the `/search` endpoint expects (`books.name`); the prototype assumed the slug from `/content/<slug>`. Confirm, do not assume.
- Choose the AI model by RAM, start `llama-server`, poll its `/health` until ready, update the status indicator. Never block the UI on model loading.
- Ship (or detect and choose between) llama.cpp builds so older CPUs without newer instruction sets do not crash. If the engine dies at startup, show "The AI could not start on this computer. The Library and Maps still work."

### Ask the AI (RAG), the main "better than the prototype" area
Build this as a pluggable `retriever` so a vector index could be added later (out of scope for v1), and implement:
1. **Query rewrite:** a short model call that turns the question (and recent chat context) into search keywords; fall back to simple stop-word stripping.
2. **Retrieve broadly:** search all text ZIMs (not the map ZIMs), take the top N results (start with about 8), fetch article text, split into passages, **rank passages locally** (BM25 or similar) and keep the best few that fit the model's context window.
3. **Grounded answer:** the system prompt says to answer only from the supplied passages, say plainly when they do not contain the answer, cite sources as numbered references, and for medical or safety topics tell the person to verify in the cited articles and seek professional help if possible.
4. **Sources UI:** each answer shows numbered sources that open **inside the app**.
5. **Streaming:** stream tokens to the UI as they are generated, with a Stop button.
6. **Follow-up questions** in the same conversation (keep a short rolling history within the context limit), plus a "New question" reset.
7. **Context budgeting:** count or estimate tokens; never overflow the model's context (the prototype used 4096). Make context size a config value; consider larger for the medium and large tiers if RAM allows.
8. A permanent small notice near the input: the AI answers from the library and can still make mistakes.

### Maps
- Maps are StreetZim ZIMs served by Kiwix. **Verify early** that the StreetZim viewer works inside the embedded window (WebGL, web workers, service workers, large file range requests). Provide a fallback message when WebGL is unavailable (very old PCs) and try a software-rendering fallback if the framework supports it.
- Multiple map ZIMs: one clearly named entry each.

### Home and help
- Home: three big entries (Library, Maps, Help) and the Ask box, same plain-language style as the prototype page. Design tokens to carry over: paper `#e8ece9`, ink `#14202b`, blue `#1f4e79`, signal yellow `#f2c230`; headings in Bahnschrift (falls back to Segoe UI), body in Segoe UI; light and dark mode via system preference; large tap targets; visible focus outlines; left-aligned; no decorative animation.
- Help opens `START-HERE.html` inside the app.
- Copy rules: sentence case, plain verbs, specific errors that say what to do next. No jargon (never say "port", "server" or "model" to the customer; say "the AI").

### Support tools (for the owner)
- Rotating logs in `_system/logs/` (small, capped size).
- A **"Save support info"** button in Help that writes a plain text file: app version, Windows version, RAM, CPU model, which books and models were found (names and sizes only), engine start results, last errors. No personal data.
- Optional `_system/config.json` (hidden from customers) for owner overrides such as forcing a model tier or context size.

## 6. Build, packaging and licensing

- Provide a **reproducible build script** (PowerShell) that produces the `_system` output and a second **`assemble-drive` script** that takes the build plus the owner's downloaded engines/ZIMs/models and **verifies the drive is complete** (checks for `kiwix-serve.exe`, `llama-server.exe`, at least one model and ZIM, correct names and nesting) and prints plain-language fixes for anything missing.
- Pin every dependency to an exact version. **Choose versions that were published at least 14 days ago** (supply-chain safety). Prefer MIT/Apache/BSD dependencies. Report the license of anything new before adding it.
- Collect third-party license texts into `LICENSES/` with a script. Known obligations to surface to the owner (not legal advice): kiwix-tools is **GPL v3** (the owner must offer corresponding source for the bundled binary; include a note with the source location and exact version); llama.cpp is MIT; the chosen window framework and Chromium (if used) have notices that must ship; each AI model has its own license; Wikipedia and ZIM content are mostly CC BY-SA with per-ZIM terms; OpenStreetMap data (in StreetZim) is ODbL and needs attribution. Show attribution inside the app (Help page).
- Code signing: not required for v1 (drives are copied from a master, so files carry no "downloaded from the internet" mark and SmartScreen rarely triggers), but leave a clearly documented hook for signing later.

## 7. Phase 0: spikes (do these first and report findings)

Do not build the full app until these are answered. For each, state what you tried, what you saw, and what you recommend.

1. **Kiwix:** run `kiwix-serve` with a small test ZIM. Capture real `/search` HTML and the `/catalog/v2/entries` XML. Confirm the correct `books.name` value, the result-link format, and the article URL format. Save samples as test fixtures.
2. **StreetZim:** serve a StreetZim ZIM and open its viewer in the candidate window technology. Test pan, zoom, search, and GPU-less behavior.
3. **llama.cpp:** pick a current Windows release build and a tiny GGUF. Confirm startup flags, `/health`, streaming chat (`/v1/chat/completions` with streaming), and behavior on a CPU without AVX2 (or document how to detect and choose a build).
4. **Window technology:** build a throwaway window that loads a localhost page, blocks non-localhost requests, and runs from a USB-like path (including an exFAT drive and a path with spaces). Verify no console window, no writes outside the drive, and that it runs from a read-only location.
5. **Process cleanup:** verify children die on window close, on Shut down, on force-quit of the app, and that a stale PID from a crashed run is cleaned up safely at next start.
6. **Size and speed:** record app size, cold start time, and idle memory on this PC.

Finish Phase 0 with a short written summary and a recommended plan, then wait for the owner's go-ahead.

## 8. Testing requirements

### Automated (you run these)
- Unit tests for: Kiwix result parsing (using saved fixtures), text extraction, passage splitting and ranking, RAM-to-model selection (edge cases: exactly 6, 12, 24 GB; missing files; only `large.gguf` present), port selection, path handling (spaces, non-ASCII, drive letter changes).
- Integration tests that start the real engines with a small ZIM and a tiny model and check: library listing, search, an end-to-end question returns an answer with at least one valid source, graceful behavior when Kiwix or the AI is killed mid-run, no leftover processes after shutdown, and that **no outbound non-localhost connection is attempted**.
- A script that fails the build if any dependency is unpinned or too recent.

### Manual matrix (give the owner a checklist; do not claim these passed unless the owner confirms)
Clean Windows 10 and 11 PCs; 4 GB, 8 GB and 16 GB RAM machines; an old laptop with no usable GPU; a slow USB 2 drive; exFAT and NTFS; different drive letters; Windows Defender and one third-party antivirus (especially false positives on the bundled executables); first-run Windows Firewall prompts (the goal is none); two launches in a row; unplugging the drive while running (clear message, no crash loop); a write-protected drive.

### Acceptance criteria
- Double-click to a usable home screen in a reasonable, stated time on the reference PC, with the AI continuing to load in the background.
- A grounded answer with sources on a mid-range PC using the small and medium models.
- A customer can complete Library, Maps and Ask without reading anything beyond `START-HERE.html`.
- After Shut down or closing the window, no `kiwix-serve` or `llama-server` processes remain.
- No network traffic except to `127.0.0.1`.

## 9. How to work with the owner

- Work in small steps, commit to git often, and keep a plain-language `docs/progress.md` ("what works, what does not, what I need from you").
- **Ask before** downloading large files, installing system-wide tools, or running anything that needs administrator rights. Tell the owner exactly which engines/ZIMs/models you need and where to get them.
- Never modify, move or delete the owner's ZIM or model files; work on copies or test files.
- Be honest about what you could not test. Never say something works unless you ran it. List unverified assumptions explicitly.
- Keep the code understandable: small modules, clear names, comments that explain why.
- The finished deliverables: the app source, the build and assemble-drive scripts, updated `START-HERE.html` and `PRODUCTION-CHECKLIST.md` (rewritten for the new app), `docs/decisions.md`, the test suite, and a plain-language owner README covering how to rebuild, how to update a ZIM or model, and what to do if something fails.

## 10. Out of scope for v1 (design so these are possible later)

Mac and phone editions; a vector (embedding) search index for the AI; turn-by-turn routing; automatic content updates; code signing. Keep the retriever and the engine layer modular so these can be added without a rewrite.
