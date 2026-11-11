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

## Testing on your PC (status)
Your PC's folders ("Proj" on the USB-C drive and "OFFLINE PREP" on C:) appear in Remote Control, but your computer
does not offer them to cloud sessions (same result on both drives, so the USB-C drive is not the cause; most likely the
desktop app needs an update, or the feature is not available for this account yet).
**See `docs/local-session-handoff.md`** for the exact steps and the message to paste.
Reliable alternative: start a **local** Claude Code session in the desktop app in the OFFLINE PREP folder and clone
`Ncascio1/offlinelibllama` from GitHub. It can then test on Windows with your Wikipedia and model.
