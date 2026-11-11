# Phase 0 report: spikes

Date: 11 Nov 2026. Written for the owner, in plain language.

## Read this first: where these tests ran

These tests ran on a **Linux cloud computer**, not on Windows. I used the real
Windows downloads wherever a file could be inspected without running it, and
the **same versions built for Linux** wherever something had to actually run.
Kiwix and llama.cpp behave the same over their web connections on both systems,
so most results carry over. Anything that depends on Windows itself is marked
**Not tested on Windows** and is on your checklist at the end.

Test files used (stand-ins for yours):
- Books: `wikipedia_en_ray-charles_nopic_2026-08.zim` (1.8 MB) and
  `wikipedia_en_knots_maxi_2026-10.zim` (13 MB).
- AI: SmolLM2-135M-Instruct Q8_0 (145 MB, Apache 2.0). It only checks the
  plumbing; it is far too small to judge answer quality.
- All tests ran from a folder named `USB Drive Ünïcødé` (spaces and
  non-English letters on purpose).

---

## Spike 1. Kiwix: works, and one assumption in the prototype was wrong

**Tried:** ran `kiwix-serve` 3.8.1 with both books; fetched the catalog, searches
and articles. Samples saved in `tests/fixtures/kiwix-3.8.1/`.

**Saw:**
- Ready to answer in about 0.2 s.
- Each book has two different names:
  - catalog `<name>`: `wikipedia_en_knots`
  - address name: `wikipedia_en_knots_maxi_2026-10` (from the file name)
- `/search?books.name=wikipedia_en_knots` fails with "No such book".
  `books.name=wikipedia_en_knots_maxi_2026-10` works, and so does
  `books.id=<uuid>`. The prototype used the address name, which was correct,
  but by luck rather than by design.
- Searching several books at once works (repeat `books.id=`).
- `&format=xml` returns clean results: title, link, snippet, book title, word
  count. Much easier to read reliably than the HTML page.
- Article address: `/content/<address name>/<Article>`, for example
  `/content/wikipedia_en_knots_maxi_2026-10/Bowline`. `/raw/<address name>/content/<Article>`
  returns the same page without Kiwix's top bar (useful for the AI's text reading).
- Articles contain many internet links (en.wikipedia.org, animatedknots.com
  and others), so the app must block them. It does (Spike 4).
- Useful startup options, all tested: `-i 127.0.0.1` (this computer only),
  `-b` (block outside links), `-k` (skip a damaged book instead of failing),
  `-a <pid>` (quit when the app dies; worked, about 2 to 4 s).

**Recommend:** use book UUIDs plus `format=xml` for the AI's search; use the
address name for links people click.

**Not tested on Windows:** the Windows `kiwix-serve.exe` itself (same version).

## Spike 2. StreetZim maps: partly done, needs your map file

**Tried:** the StreetZim website and its downloads are on sites this cloud
computer may not reach, so I did not get a map file. Instead I tested what the
map viewer depends on, inside the Electron window:
- **WebGL** (maps draw with it): on this computer, which has **no graphics
  card**, WebGL was missing by default. With Electron's software renderer
  switched on (`--enable-unsafe-swiftshader`), WebGL 2 worked. ("Unsafe" is
  Chromium's warning about running untrusted websites through it; we only show
  our own local pages.)
- **Background workers** (MapLibre uses them): work.

**Recommend:** turn the software renderer on as a fallback. Show a plain message
if WebGL still isn't available.

**Still to do:** open a real StreetZim file in the app and test pan, zoom,
search, speed with software rendering, and large file reads. **I need one of
your StreetZim files** (the smallest one you have is ideal).

## Spike 3. llama.cpp: works, one Windows dependency to bundle

**Tried:** `llama-server` b11900 with the tiny model, from the test drive path.

**Saw:**
- Startup options that work:
  `-m <model> --host 127.0.0.1 --port <free port> -c 4096 -np 1 --no-webui --offline`
- `/health` returns `503 "Loading model"` while loading and `200 {"status":"ok"}`
  when ready, so the status light can show "starting" then "ready".
- Ready in 0.3 s with the tiny model (your 3B model will take longer).
- Streaming answers (`/v1/chat/completions` with `"stream": true`) work, word
  by word, ending with `data: [DONE]`.
- **Stop works:** dropping the connection made the AI cancel its work at once.
- `/tokenize` exists, so the app can count tokens exactly to avoid
  overflowing the AI's memory.
- The log warns that without a password any web page on the PC could use the
  AI. **Recommend:** give it a fresh random password (`--api-key`) at each
  launch; only our app knows it.
- **Old CPUs:** the Windows build ships 14 CPU-specific engine files, from
  `ggml-cpu-x64.dll` (any 64-bit CPU) and `ggml-cpu-sse42.dll` up to
  `ggml-cpu-zen4.dll`, and picks the best at start. I emulated old CPUs: on a
  2008-era CPU (no AVX) it chose `sse42`; on an older Core 2 it chose `x64`.
  Both produced text, no crash. **So one build covers old and new PCs.**
- **Windows dependency:** `llama-server.exe` **and** `kiwix-serve.exe` both need
  three Microsoft Visual C++ files that they don't include:
  `msvcp140.dll`, `vcruntime140.dll`, `vcruntime140_1.dll`. Many PCs have them,
  a clean PC may not. **Recommend:** put those three files beside each engine
  on the drive (Microsoft allows this). The assemble-drive script will check
  for them.

**Not tested on Windows:** the Windows build itself, real old-CPU laptops.

## Spike 4. Window: Electron passes everything I could test here

**Tried:** a throwaway Electron 44.10.0 app (`spikes/window/`) on a fake drive
at `USB Drive Ünïcødé`, started with an empty home folder to catch stray
writes. It starts Kiwix and the AI hidden, loads a page, runs checks and closes.

**Saw:**
- Internet request (`https://example.com`) **blocked**; local Kiwix **allowed**.
- Pop-up windows and navigation away from the computer are blocked.
- All Electron data stayed in `_system/data` on the drive (1.2 MB). Web
  content uses in-memory storage, so no cache is written to the flash drive.
- **Read-only drive:** made the fake drive truly read-only; the app noticed,
  used the temp folder (1.2 MB) and ran normally.
- **Second launch:** the second copy exited at once and the first window was
  told to come to the front.
- Electron's Windows `electron.exe` is a GUI program, and the engines are
  started with "hide window", so no console windows.
- `Start.exe` launcher (`spikes/launcher/`): 17 KB, GUI program, uses only
  built-in Windows files, Unicode-safe, plain-language message if the app
  folder is missing.
- One stray write: the Linux graphics driver saved a shader cache in the home
  folder. Graphics drivers on Windows can do similar things in their own
  folders; we can't fully control that. To check on Windows.

**Not tested on Windows:** console-free start, exFAT and NTFS drives, drive
letter changes, the launcher running, Windows Firewall prompts (we only listen
on 127.0.0.1, which normally causes no prompt).

## Spike 5. Process cleanup: works, one result depends on Windows

| Situation | Kiwix | AI engine |
|---|---|---|
| Window closed | stopped | stopped |
| App force-killed (Linux) | quit by itself within ~2 s | **left running** (expected on Linux) |
| App force-killed (Windows) | expected stopped (job + watch) | expected stopped (job) **Not tested** |
| Next start after a crash | stale-PID cleanup stopped our leftover engine and left an unrelated program alone | same |

On Windows, Electron puts child programs in a "job" that Windows kills when the
app ends, even if force-killed. I confirmed this in the source code but could
not run it. The stale-PID cleanup on Windows will need a different way to look
up a program's file path than the one tested here.

## Spike 6. Size and speed (this cloud PC, not representative)

- Program files: Electron about 368 MB (about 320 MB without unused languages),
  Kiwix 39 MB, llama.cpp 44 MB: **about 400 MB total**.
- Window on screen: about 0.2 to 0.4 s after launch, Kiwix ready by then. This
  is a fast server with files already in memory; a laptop with a USB 2 drive
  will be much slower. **The real number must come from your reference PC.**
- Memory in use: Electron about 355 MB (all its processes, shared memory
  counted fairly), Kiwix about 20 MB, AI about 370 MB with the tiny model
  (yours will need roughly 2.5 to 3.5 GB). On a 4 GB laptop the Library and
  Maps will be fine and the AI stays off, as planned.

---

## Recommended plan (Phase 1 onwards)

1. **App skeleton:** Electron app with the safeguards proven above (localhost
   only, data on drive, read-only fallback, single instance, hidden engines,
   three cleanup layers, software graphics fallback), splash screen, top bar.
2. **Kiwix layer:** catalog reading by UUID, Library and Maps lists, embedded
   views with Back/Forward. Unit tests on the saved fixtures.
3. **AI layer:** RAM-based model choice, random password, health polling,
   streaming with Stop, then the RAG pipeline (keyword rewrite, XML search, text
   extraction, passage ranking, token budget via `/tokenize`, sources).
4. **Home, Help, support info, logs, config.**
5. **Build and assemble-drive scripts** (PowerShell), licence collection,
   pinned-version check, test suite.
6. **Your Windows test pass** using the manual checklist.

## What I need from you

1. **kiwix-tools for Windows** is required (the desktop reader doesn't
   include `kiwix-serve.exe`). I have downloaded the exact version
   (3.8.1), so you don't need to unless you want your own copy:
   https://download.kiwix.org/release/kiwix-tools/kiwix-tools_win-x86_64-3.8.1.zip
2. **One small StreetZim file** to test maps (upload it, or tell me where you
   got it so I can download it).
3. **Your 3B model:** its exact file name or download page, so I can check its
   licence, size and chat format, and later test real answer quality.
4. **"The llama":** which llama.cpp file did you download (exact zip name)? I
   recommend `llama-b11900-bin-win-cpu-x64.zip` for now.
5. **A Windows PC test** of the spike, when you are ready. I will package it as
   a zip with step-by-step instructions.
6. Your go-ahead on Electron (D1 in `docs/decisions.md`).

## Unverified assumptions (honest list)

- Windows kills child programs via the job object on force-quit.
- No console window flashes on Windows (based on the program type, not seen).
- exFAT, NTFS, drive letter changes, USB 2 speed, antivirus reactions,
  Firewall prompts: all untested.
- StreetZim works in the window (WebGL and workers work; the viewer itself is
  untested).
- Your 3B model's speed and memory on 8 GB and 16 GB laptops.
