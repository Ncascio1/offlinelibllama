# Progress

## Where we are
Phase 0 (spikes) finished. Electron approved. Next: Phase 1, the app skeleton.
Details: `docs/phase0-report.md`. Decisions: `docs/decisions.md`.

## What works (tested here, on a Linux cloud computer)
- Kiwix serves books, search and catalog; we know exactly which names it expects.
- StreetZim maps open in the Electron window, even with no graphics card: search, zoom and pan all work, with no internet.
- The AI engine (llama.cpp b12239) starts, reports "loading" then "ready", streams answers, stops when asked, and refuses anyone without the per-launch password.
- One AI engine build handles old CPUs (tested with emulated 2008-era CPUs).
- The Electron window blocks the internet at two levels, keeps its data on the drive, runs from a read-only drive, and allows only one copy.
- Leftover engines from a crash are cleaned up safely at the next start.

## Not tested yet
- Nothing has run on Windows yet.
- Dragging the map with a real mouse; map speed on a real old laptop.
- Your Llama 3.2 3B model has not been run here (2 GB download). Its settings were read from the file header only.
- If the app is force-closed on Linux, the AI engine is left running. On Windows this should not happen (Windows "job" feature), but it's not yet proven.

## What I need from you
1. **A GitHub repository** so the work is saved off this temporary cloud computer (see below).
2. Later: a Windows PC test of the first app build.
3. The three Microsoft Visual C++ files (`msvcp140.dll`, `vcruntime140.dll`, `vcruntime140_1.dll`): I will explain how to get them when we build the drive.

## Creating the GitHub repository (one-time, about 1 minute)
1. Sign in at https://github.com and open https://github.com/new
2. Repository name: `offline-library`. Choose **Private**. Leave every box unticked (no README, no licence).
3. Click **Create repository**.
4. Make sure Claude has access: open https://claude.ai/connect-github and, if asked, allow the Claude GitHub App on this repository.
5. Tell me your GitHub user name. I will then upload all the work.
