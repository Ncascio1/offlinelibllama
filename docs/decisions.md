# Decisions

Each entry: what was decided, why, and what it means for you (the owner).

---

## D1. Window technology: Electron (bundled Chromium), version 44.10.0

**Status:** proposed, waiting for your go-ahead (Phase 0).

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
| llama.cpp (`llama-server.exe`), CPU build | b11900 | 26 Oct 2026 | MIT |
| Electron | 44.10.0 | 27 Oct 2026 | MIT (+ Chromium notices) |

kiwix-tools 3.8.2 exists for Linux but has no Windows build, so 3.8.1 is the
newest Windows release.

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
