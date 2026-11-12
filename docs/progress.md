# Progress

## Where we are
- Phase 0 (spikes): done. See `docs/phase0-report.md`.
- **Phase 1 (app skeleton): done and tested on Linux.** Not yet run on Windows.
- Next: Phase 2 (polish of Library and Maps), then Phase 3 (Ask the AI), Phase 4 (Help, support info, guide), Phase 5 (build and drive scripts).

## What works now (tested here, on a Linux cloud computer)
Screenshots: `docs/phase1-evidence/`.

- One window with a top bar: Home, Back, Forward, Library, Maps, Ask, Help, an AI status light, and Shut down (asks "Shut down now?" first).
- The home page appears in under half a second; the library is ready in about 0.7 s with the test books.
- Library lists the books; a book opens inside the app with Kiwix's search box at the top.
- Maps lists the maps by their friendly names ("Bahrain"); a map opens and works.
- Back and Forward work across our pages, books and maps. Mouse side buttons and Alt+Left/Right also work.
- Ctrl + plus / minus zooms, Ctrl + 0 resets, and the zoom stays when moving to another page.
- Help opens START-HERE.html inside the app (the real guide comes in Phase 4).
- The AI starts in the background; the light shows starting, ready, off or unavailable, with a plain explanation.
- Plain messages for: no books, no AI files, not enough memory, the library stopping (for example a drive unplugged), the AI stopping.
- Read-only drive: works.
- Second double-click: no second copy.
- Shut down or closing the window: Kiwix and the AI are stopped; nothing left running.
- After a crash: leftovers are stopped at the next start (only our own engines).
- Internet blocked at two levels; book pages cannot use the app's controls.
- **Ask the AI** (Phase 3, details in `docs/decisions.md` D9):
  - Answers only from the books, with numbered sources that open inside the app.
  - Words appear as they are written; a line says what the AI is doing ("Searching the library…").
  - Stop button, follow-up questions ("what did *he* play?"), and New question.
  - Says plainly when the books don't cover a question, and shows no sources then.
  - Safety note on health and safety questions; a warning if parts of an answer can't be found in the sources.
  - Questions are never written to the log.

## Phase 2 additions (tested here)
- **Search all books** from the Library page: title matches first, then mentions, mixed fairly between books;
  maps excluded; first 15 results with "Show more"; meaningless snippets hidden.
- Book list with **cover pictures and sizes** ("1,735 articles"), biggest first; grouped by kind when there are more than 6 books;
  language shown only when books are in different languages.
- **Internet links** in books show "That link needs the internet, so it can't open here." in the top bar.
- **"Loading the map…"** in the top bar until the map is drawn; a warning after a minute.
- **Old computers without 3D drawing:** Maps page explains it and greys out the maps; opening a map anyway explains at once.
- Kiwix's menu-language button is hidden in the reader (it could leave menus in an unknown language).
- **Map dragging with a real mouse and the mouse wheel: confirmed working.**
- Fixed: text typed in the Library search box was lost when the app's status changed.
- **Several maps:** each listed by place name; switching between them works; memory stays about 690 to 730 MB.
- **PDF guides inside books** (for example the Water Treatment Library) open in the built-in viewer; printing works;
  saving to the computer is refused with a message (the app must not write outside the drive).
- **Videos inside books** (TED talks) play.
- Fixed: "TED street art" was listed as a map (the prototype's name rule was too broad; maps are now recognised by their tags).
- Fixed: the AI could have been fed raw PDF data as text; it now reads only web pages.

Known limit: books without a search index (such as the Water Treatment Library) can only be found by
document title, and the AI cannot read PDF documents. Reading PDFs would need an extra component (see D10).

## Ask the AI: measured on this cloud computer (4 CPU cores, fast disk)
| Step | Time |
|---|---|
| AI ready after start (3B model, fast disk) | about 2 s (a USB 2 drive will be much slower: roughly 1 to 2 minutes, estimate) |
| Choosing search words + searching the books | about 1 to 1.5 s |
| First words of the answer | about 11 to 15 s |
| A short answer, complete | about 15 to 25 s |

An older laptop will be slower, perhaps 2 to 4 times. Not measured: needs your Windows test.
Memory used by the AI: about 2.6 GB that must really be free (plus the model file, which Windows can page out).

Honest limits of the 3B model (seen in testing): it sometimes adds facts from its own memory or
numbers a citation wrongly. Retrieval improvements and the automatic checks reduce this, but answers
must still be read with the sources, which is what the on-screen notice says.

## Tests
- `npm test`: 64 unit tests (now also: text extraction, passage splitting and ranking, keywords, citation repair, grounding check, memory budget, retriever);
  previously 40 (memory tiers incl. exactly 6/12/24 GB, Windows paths and drive letters,
  Kiwix catalog and search parsing, network rule, ports, config file, crash cleanup, page-address guard, message wording).
- `tests/e2e/walkthrough.js`: 25 to 26 checks clicking through the real app.
- `tests/e2e/error-cases.js`: 13 checks for the failure situations above.
- `tests/e2e/ask-flow.js`: 17 checks of Ask with the real 3B model (answer, sources, follow-up, Stop, New question, not covered, privacy, no internet).
- `tests/e2e/phase2.js` (16 checks) and `tests/e2e/phase2b.js` (9 checks): search, internet-link message, map loading,
  real-mouse map drag and zoom, book pictures and sizes, language button hidden, no-3D-drawing computers.
- `tests/e2e/phase2c.js` (10 checks): several maps, PDF guides, saving refused, videos, language labels.
- `tests/integration/ask-cli.js`: ask questions from the command line against running engines (for tuning).

## Not tested yet
- Nothing has run on Windows yet (no console window, Windows "job" cleanup, exFAT/NTFS, antivirus).
- Answer quality with a full Wikipedia: tested only with two small books (Knots, Ray Charles).

## What I need from you
1. ~~GitHub access~~ done: the project is saved at https://github.com/Ncascio1/offlinelibllama (branch `main`).
2. ~~Permission to download your 3B model~~ done, and tested.
3. Optional: a list of 10 to 20 typical customer questions (first aid, water, food, repairs...).
   I would use them as a test set so answer quality can be checked after every change.
4. Later, for real-world tuning: which Wikipedia ZIM (and other books) you ship, so I can test with a large one.

## Windows test results (2026-11-11, owner's PC, local session)
PC: Windows 11 Home (build 26200), Intel i7-12650H (10 cores / 16 threads), 15.7 GB memory, on mains power.
**The PC was also busy with other heavy work during these tests, so AI speeds are pessimistic.**
Test folder: `C:\Users\nicho\Offline Test Drive` (NTFS, path with spaces). Books were read from the owner's
USB stick (D:, exFAT, USB) through a folder link, so book speed = USB stick speed. Model: a copy of the owner's
Llama 3.2 3B Instruct Q4_K_M (confirmed from the file's own header; its SHA-256 `6C1A2B41…28FF` differs from the
cloud copy, most likely a different uploader; behaves as expected).
Engines: Electron 44.10.0, kiwix-tools 3.8.1, llama.cpp b12239 (all fingerprints checked).
Books: 9 (Wikipedia nopic 52.7 GB, WikiMed, Appropedia, iFixit, military medicine, 3 zimgit guides, US map 34.9 GB).

| Step | Result |
|---|---|
| 1. Starts | PASS: window after 0.26 to 0.44 s. Library and Maps work (US map drawn in 2.8 s). No console window (owner confirmed) |
| 2. Full Wikipedia | Library ready after 7.4 to 9.4 s with all 9 books. Search: see problems below |
| 3. AI | AI ready after 44 s (first start), 6 s (second start). Answers grounded with correct sources; "2030 World Cup" correctly not covered. Slow, see below |
| 4. Clean shutdown | PASS for "End task" on the app: Windows stopped Kiwix and the AI by itself (the "job" safety net). Next start's leftover check behaved correctly. PASS for the Shut down button and for closing the window with X: both engines stopped within 0.5 s, nothing left running |
| 5. No writes outside the drive | PASS: nothing new in %APPDATA% or %LOCALAPPDATA% |
| 6. Firewall | PASS: no firewall prompt (owner confirmed); no firewall rules created for our programs |
| 7. Antivirus | PASS: Windows Defender custom scan of `_system` found nothing |
| 8. Whole app on USB stick | PASS. Everything on the owner's USB stick (D:, exFAT, folder `D:\Proj` as the drive root): window 0.97 s, AI ready 25 s, library ready 34.5 s (both loading from the same stick at once, so slower than from C:). Search and AI work; AI answers 19 to 30 s (first words after about 13 s, PC less busy). Closing the window: nothing left running. **Different drive letter:** the same folder as a temporary `X:` drive (Windows `subst`, books at `X:\library`): starts, finds everything at `X:\`, searches, closes cleanly |

Owner confirmed by eye: no black console window and no firewall prompt at any time.

### The owner's stick now has the customer layout (2026-11-12)
`D:\` top level: `START-HERE.html`, `_system\`, `library\` (9 books), `models\small.gguf`. Deleted (not used by
the app): the Kiwix desktop app, the full llama.cpp download, the embedded Python, test logs. Moved to the PC at
`C:\Users\nicho\OfflineLibrary-dev\`: this project (`offlinelibllama`) and `downloads\` (the Electron and
kiwix-tools zips needed to build drives, and the old prototype kit). The empty-of-use folder `D:\Proj` (a duplicate
project copy) is left for the owner to delete.
First start from the new layout, close to a real first plug-in: window 0.47 s, **library ready 65 s, AI ready
2 min 39 s**, warm-up finished after 99 s; search worked, closing left nothing running. The warm-up and the AI
both read from the stick during startup and slow each other down; worth tuning (for example: warm up only after
the AI is ready, or start the AI a few seconds after the library).
### Next: speed up startup (in progress, 2026-11-12)
Facts so far: the owner's stick reads about **145 MB/s** for one big file and about **900 small (64 KB) reads per
second** (one reader, data never read before). So the 2 GB AI file alone should load in roughly 15 s, yet in the
real start the AI took 2 min 39 s and the library 65 s, while Kiwix, the AI and the warm-up all read the stick at once.
The stick could not be ejected for a true cold test because the Claude session had been started inside `D:\Proj`.
Plan for the next session (started in `C:\Users\nicho\OfflineLibrary-dev\offlinelibllama`, stick freshly replugged):
1. Cold-measure each engine alone: `tests\manual\cold-start-measure.ps1 -Drive D:` (Kiwix, then the AI);
   replug, then `-SkipKiwix -LlamaExtra '--no-mmap'` to compare the two ways the AI can load its file.
2. Change the start order in `app/src/main/main.js`: Library first, AI once the library is ready, warm-up only
   after the AI is ready (or paused while it loads). Use `--no-mmap` if step 1 shows it is faster.
3. Replug, then a cold start of the whole app from the stick; compare with 65 s / 2 min 39 s.

Still missing for customers: `Start.exe` at the top level (today they would have to open
`_system\app\OfflineLibrary.exe`). It needs a C compiler to build from `spikes/launcher/start.c` (Phase 5).
Not tested: a write-protected drive, a slow USB 2 stick, unplugging while running, other PCs (4 and 8 GB, Windows 10).

### Problems found on Windows, and what was done
1. **App crash when asking the AI (fixed).** "A JavaScript error occurred in the main process ... assert(!this.paused)".
   Node's built-in fetch crashes when Kiwix closes a connection while several big articles are being read at once.
   It never showed with the small test books. Fix: Kiwix is now read with Node's older `http` module
   (`app/src/main/local-http.js`); unread downloads are always closed. After the fix, 6 questions in a row
   including a follow-up ran without a crash. 5 new unit tests.
2. **Result counts showed 0 (fixed).** Kiwix writes "323,837" with a comma; the app read that as 0. 1 new unit test.
3. **First search of a word was slow from the USB stick (improved).** The first search for a new word took 4 to
   20 s; repeats under 1 s. Searches were cut off after 20 s, so on a cold start "tourniquet" and "snake bite"
   first returned **no results at all**. Measured cause: Kiwix answers only 4 requests at a time, while one search
   sends 2 per book, so small books queued behind slow Wikipedia reads; and the first read of each book's index is
   slow from USB. Changes: Kiwix runs with 8 threads; right after the library is ready the app opens every book's
   index in the background, one book at a time, biggest first ("warm-up", took 26 s); the wait per book is now
   45 s (30 s for the AI's searches) so a slow book still returns results. Re-test from the stick with words not
   searched before: every search returned results, most in 1.6 to 4.8 s, worst 18 s ("radio", Wikipedia title
   lookup). Not tested: a truly cold stick (it could not be ejected while this session used it). 2 new unit tests.
   Possible later improvement: show results book by book as they arrive.
   Also seen: library ready took 34 to 44 s from the stick when the AI loads its 2 GB file at the same moment
   (7 s with the app on C:). Idea for later: start the AI a few seconds after the library.
4. **AI answers take 45 to 80 s (needs a decision).** Reading the library: 5 to 41 s (USB stick, cold). The AI
   reading the passages: about 25 s (59 tokens/s; writing 11 tokens/s). Using fewer CPU threads did not help
   (default is fastest). Re-measure with the PC idle. A graphics-card build of llama.cpp could be much faster on
   PCs that have one, but must fall back safely on PCs that don't.
5. Answer quality: mostly good and cited. Weak case: "snake bite" gave a thin answer (wash, antivenom).

Unit tests on Windows: 70 of 70 pass (run with the app's own Electron as Node; Node is not installed on this PC).

## Testing on your PC (status)
Your PC's folders ("Proj" on the USB-C drive and "OFFLINE PREP" on C:) appear in Remote Control, but your computer
does not offer them to cloud sessions (same result on both drives, so the USB-C drive is not the cause; most likely the
desktop app needs an update, or the feature is not available for this account yet).
**See `docs/local-session-handoff.md`** for the exact steps and the message to paste.
Reliable alternative: start a **local** Claude Code session in the desktop app in the OFFLINE PREP folder and clone
`Ncascio1/offlinelibllama` from GitHub. It can then test on Windows with your Wikipedia and model.
