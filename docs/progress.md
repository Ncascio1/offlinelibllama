# Progress

## Where we are
Phase 0 (spikes) done as far as possible without Windows. Waiting for your go-ahead.
Full details: `docs/phase0-report.md`. Decisions: `docs/decisions.md`.

## What works (tested here, on Linux)
- Kiwix serves books, search and catalog; we know exactly which names it expects.
- The AI engine starts, reports "loading" then "ready", streams answers, and stops on request.
- One AI engine build handles old CPUs (tested with emulated 2008-era CPUs).
- The Electron window blocks the internet, keeps its data on the drive, runs from a read-only drive, and allows only one copy.
- Maps' graphics (WebGL) work even with no graphics card, using software drawing.
- Leftover engines from a crash are cleaned up safely at the next start.

## What does not work yet / not tested
- Nothing has run on Windows yet.
- StreetZim maps not opened yet (need a map file).
- If the app is force-closed on Linux, the AI engine is left running. On Windows this should not happen (Windows "job" feature), but it's not yet proven.

## What I need from you
See "What I need from you" in `docs/phase0-report.md`.
