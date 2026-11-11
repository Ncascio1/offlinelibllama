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
- The Ask box takes a question to the Ask page; **answering is Phase 3**.

## Tests
- `npm test`: 40 unit tests (memory tiers incl. exactly 6/12/24 GB, Windows paths and drive letters,
  Kiwix catalog and search parsing, network rule, ports, config file, crash cleanup, page-address guard, message wording).
- `tests/e2e/walkthrough.js`: 25 to 26 checks clicking through the real app.
- `tests/e2e/error-cases.js`: 13 checks for the failure situations above.

## Not tested yet
- Nothing has run on Windows yet (no console window, Windows "job" cleanup, exFAT/NTFS, antivirus).
- Your Llama 3.2 3B model has not been run (2 GB download). Settings read from the file header only.
- The AI has no way to answer questions yet (Phase 3).

## What I need from you
1. ~~GitHub access~~ done: the project is saved at https://github.com/Ncascio1/offlinelibllama (branch `main`).
2. Permission to download your 3B model (2 GB) here, to test real answers in Phase 3.
