# Decisions

Each entry: what was decided, why, and what it means for you (the owner).

---

## D1. Window technology: Electron (bundled Chromium), version 44.10.0

**Status:** approved by the owner, 11 Nov 2026.

**Decision.** Build the app with Electron 44.10.0 (released 27 Oct 2026, more
than 14 days before this decision). MIT licence; Chromium's notices ship in
`LICENSES/`.

**Why not Tauri / WebView2?**
- WebView2 is not guaranteed on old or never-updated Windows 10 PCs, which are
  exactly the computers preppers keep for emergencies.
- The fix for that (bundling a "fixed-version" WebView2 runtime) is itself
  roughly 150 to 250 MB, so the size advantage mostly disappears, and we would
  depend on a second browser engine whose behaviour changes with Windows updates.
- With Electron the same engine runs on every PC, so a problem you see on your
  test laptop is the same problem a customer sees.

**Evidence from the Phase 0 spikes** (see `docs/phase0-report.md`):
- Electron's Windows build is self-contained: no Visual C++ runtime, no
  installer, no admin rights. `electron.exe` is a GUI program (no console).
- It blocked a request to the internet while loading local Kiwix pages fine.
- All its data folders were redirected onto the drive; on a read-only drive it
  fell back to the temp folder by itself and still ran.
- On a computer with **no graphics card**, WebGL (which the maps need) works
  through the bundled software renderer (SwiftShader) when we turn on one
  setting.

**What it means for you.**
- Size: about 320 MB for the window part, about 400 MB for all program files
  including the Kiwix and AI engines. Small next to the books and models.
- Risk: a big program file (`electron.exe`, 245 MB) may make the **first start
  slower on a slow USB 2 drive**. This must be timed on your real drive.
- Antivirus: Electron apps are common, so false alarms are less likely than with
  unusual tools, but this still needs checking on real PCs.

---

## D2. Engine versions (pinned)

| Engine | Version | Published | Licence |
|---|---|---|---|
| kiwix-tools (`kiwix-serve.exe`) | 3.8.1 (libkiwix 14.1.1, libzim 9.4.0) | 2 Dec 2025 | GPL v3 |
| llama.cpp (`llama-server.exe`), CPU build | b12239 | 9 Nov 2026 | MIT |
| Electron | 44.10.0 | 27 Oct 2026 | MIT (+ Chromium notices) |

kiwix-tools 3.8.2 exists for Linux but has no Windows build, so 3.8.1 is the
newest Windows release.

**Owner exception to the 14-day rule:** llama.cpp b12239 was only 2 days old
when chosen. The owner chose it deliberately (11 Nov 2026) because it is the
version they already downloaded. The version-check script will list it as an
approved exception rather than failing. b12239 was re-tested here: same start
options, `/health`, password, streaming, Stop and old-CPU behaviour as b11900.

---

## D3. A tiny `Start.exe` at the drive root

Electron needs about 70 files in its folder, so it lives in `_system/app/`. The
drive root gets a 17 KB `Start.exe` that only starts the real app.
- Not a `.bat` (flashes a console window) and not a `.vbs` (VBScript is being
  removed from Windows 11 and alarms antivirus software).
- Built as a Windows GUI program with no Visual C++ runtime dependency.

---

## D4. Talking to Kiwix: use book IDs and the XML search format

- Search with `/search?books.id=<uuid>&pattern=...&format=xml`. The XML is clean
  and stable; scraping the HTML results page is fragile.
- The catalog's `<name>` (for example `wikipedia_en_knots`) is **not** accepted by
  search. The address name (`wikipedia_en_knots_maxi_2026-10`, from the file
  name) and the book's UUID both work. The UUID is unique even if two editions
  of the same book are on the drive, so we use it.

---

## D5. Three layers against leftover background programs

1. **Windows job object (automatic).** Electron starts child programs inside a
   Windows "job" that Windows kills when the app ends, even if it is
   force-closed (confirmed in the libuv source, `src/win/process.c`; **not yet
   tested on a real Windows PC**).
2. **Kiwix watches the app** (`--attachToProcess`): tested, Kiwix quit by itself
   about 2 to 4 seconds after the app was force-killed.
3. **Stale-PID cleanup at next start:** we record the engines' process IDs and
   at the next start stop only those whose program file is our engine on this
   drive. Tested: it stopped our leftover engine and left an unrelated program
   with a recycled ID alone.

---

## D6. Network lock at two levels

A spike showed Chromium's spellchecker trying to download dictionaries from a
Google server. That request happens *below* the page level, so the page-level
filter never saw it. The app therefore uses both:
1. A page-level filter: only `127.0.0.1`, `data:`, `blob:` and `file:` may load.
2. A name-lookup rule (`--host-resolver-rules "MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"`):
   every internet name fails to resolve, whatever part of Chromium asks.
   Tested: with spellcheck deliberately left on, no request left the computer.
Spellcheck is also switched off.

---

## D7. Recognise maps by their catalog tags

The StreetZim file `osm-bahrain-2026-11-09.zim` has the catalog name
`osm_osm_-_bahrain`, title "OSM - Bahrain" and tags `maps;osm;offline`. A book is
a map if its tags include `maps` or `osm`. The prototype's file-name guess
(`street`, `map`, `osm`) is kept only as a backup. The menu shows the title, with
the "OSM - " prefix removed ("Bahrain").

---

## D8. AI model: Llama 3.2 3B Instruct (Q4_K_M) as `small.gguf`

- File: `llama-3.2-3b-instruct-q4_k_m.gguf`, 2,019,373,920 bytes
  (public copy: Hugging Face `hugging-quants/Llama-3.2-3B-Instruct-Q4_K_M-GGUF`,
  SHA-256 `c55a83bf...20fd7a1`). Renamed to `models/small.gguf` on the drive.
- Built-in chat format (Llama 3), handled by llama.cpp automatically.
- Memory while the AI runs (estimate from the file's settings, not measured):
  about 2.8 GB with a 4,096-token window, about 3.2 GB with 8,192.
  Plan: 4,096 on PCs with 6 to 12 GB, 8,192 on 12 GB or more (owner can
  override in `config.json`).
- **Licence: Llama 3.2 Community License (Meta). Not open source.** Not legal
  advice, but in short: ship a copy of the licence, show "Built with Llama"
  prominently (Help page and About), keep Meta's copyright notice, and pass on
  Meta's Acceptable Use Policy. The 700-million-user limit does not affect you.

---

## D9. How "Ask the AI" works (Phase 3)

Each question goes through these steps (code in `app/src/main/ask/`):

1. **Search words.** The AI suggests 2 to 4 keywords. Its suggestions are kept only
   if they appear in the question (one genuinely new word allowed), because the
   3B model sometimes slipped guessed answers into its keywords ("Georgia, 1930").
   If the AI fails, filler words are removed from the question instead.
2. **Search.** Every text book is searched (maps never). Kiwix needs every word to
   match, so we try all keywords, then the question's own words, then fewer words,
   plus title matches; results are merged. Up to 10 articles are read.
3. **Passages.** Articles are cleaned (no menus, references, links) and cut into
   ~130-word passages, ranked by BM25 plus how well their article matched. The
   opening summary of the best articles gets a small bonus (key facts live
   there), and for "how do I..." questions, sections like *Tying*, *Method*,
   *Treatment* get a bonus.
4. **Budget.** Passages are added best-first up to a cap (1,500 tokens on the
   small tier, 3,200 on bigger tiers), then the exact size is checked with the
   AI's own counter. The prompt can never overflow the AI's memory window.
   The cap also limits the wait before the first word on slow PCs.
5. **Answer.** Streamed word by word, low "creativity" (temperature 0.1). Earlier
   conversation is only included for follow-up questions ("what did *he* play?").
6. **After the answer.** Citation numbers that point at the wrong source are
   corrected; only cited sources are listed; and a word check compares the
   answer with the passages. If much of it can't be found there, the customer
   sees: "Parts of this answer may not come from the library."

**Privacy.** Questions and keywords are never written to the log; only counts and timings.

**Why the checks exist.** In testing, the 3B model sometimes filled gaps with its
own knowledge (it invented bowline-tying steps when the right passage was
missing) and numbered citations wrongly. Better retrieval fixed the bowline case;
the checks are a safety net for the cases retrieval can't fix.
