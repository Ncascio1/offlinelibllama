# Continuing on your Windows PC (local session)

The cloud session that built Phases 0 to 3 and Phase 2 ran on Linux. Some things can
only be checked on real Windows with your real files. This note lets a **local**
Claude Code session on your PC pick up exactly where the cloud session stopped.

## 1. Start the local session (you)

1. In the Claude desktop app, start a new **local** Claude Code session (not a cloud
   one) with the folder `C:\...\OFFLINE PREP` (or any empty folder on C:).
2. Paste this message:

> Clone https://github.com/Ncascio1/offlinelibllama into this folder and read
> `CLAUDE.md`, `docs/progress.md`, `docs/decisions.md` and `docs/local-session-handoff.md`.
> Then do the "Windows test plan" in the handoff note, step by step, asking me before
> any download. My Wikipedia ZIM (nopic, 51 GB) is at: <WRITE THE FULL PATH HERE>.
> My AI model is at: <WRITE THE FULL PATH HERE>. Never move, change or delete those files.

Write the real paths where it says so (for example `D:\Proj\library\wikipedia_en_all_nopic_2026-xx.zim`).

## 2. Files the Windows test needs

The exact versions tested in the cloud session (do not use newer ones without re-testing):

| What | File | Where from | Check |
|---|---|---|---|
| Window program | `electron-v44.10.0-win32-x64.zip` | github.com/electron/electron/releases/tag/v44.10.0 | SHA-256 `64c2d874fea1bd4c8d2e1f2df3a547497044159a6b853dee7fcdff357ff0e3cd` |
| Library engine | `kiwix-tools_win-x86_64-3.8.1.zip` | download.kiwix.org/release/kiwix-tools/ | MD5 `95f953f726aac8f320c7038f85785df9` |
| AI engine | `llama-b12239-bin-win-cpu-x64.zip` | github.com/ggml-org/llama.cpp/releases/tag/b12239 | SHA-256 `d8ea1a5064260db3e6a02b8fe6dab97dbbb446159c95b3d78695de10ece51f18` |
| Microsoft runtime (3 files) | `msvcp140.dll`, `vcruntime140.dll`, `vcruntime140_1.dll` | copy from `C:\Windows\System32` (64-bit versions) | needed next to `kiwix-serve.exe` and `llama-server.exe` |
| AI model | your `llama-3.2-3b-instruct-q4_k_m.gguf` | already on your PC | SHA-256 `c55a83bfb6396799337853ca69918a0b9bbb2917621078c34570bc17d20fd7a1` |
| Books | your Wikipedia nopic ZIM, plus maps | already on your PC | |

## 3. Test drive layout to build (a folder or a spare USB stick)

```
<test drive>\
  Start.exe                    (build from spikes\launcher\start.c, or skip and run the app exe directly)
  START-HERE.html
  _system\app\                 Electron files; rename electron.exe to OfflineLibrary.exe
  _system\app\resources\app\   the project's app\ folder
  _system\kiwix\               kiwix-serve.exe + its icu*.dll + the 3 Microsoft files
  _system\llama\               llama-server.exe + all its .dll files + the 3 Microsoft files
  library\                     the ZIM files (copies or the originals; the app only reads them)
  models\small.gguf            the AI model (a copy, or the original renamed copy)
```

Note: a full build script comes in Phase 5. Until then this is assembled by hand.

## 4. Windows test plan (in this order)

1. **Starts at all:** double-click; the window opens; no black console window appears; Library and Maps work.
2. **Wikipedia 51 GB:** time from double-click to "library ready"; search all books for "water", "tourniquet", "snake bite"; open articles.
3. **AI with Wikipedia:** time until the light turns green; ask the questions from `docs/progress.md`
   plus your own; note time to first word and whether answers and sources are right.
4. **Clean shutdown:** after Shut down and after closing the window, Task Manager shows no
   `kiwix-serve.exe` or `llama-server.exe`. Then end `OfflineLibrary.exe` in Task Manager
   ("End task") and check again: this is the Windows "job" safety net that could not be tested on Linux.
5. **No writes outside the drive:** look for new folders in `%APPDATA%` and `%LOCALAPPDATA%` named Electron or Offline Library (there should be none).
6. **Firewall:** no Windows Firewall prompt should appear.
7. **Antivirus:** Windows Defender should not flag anything.
8. **USB drive:** repeat 1 to 4 from a USB stick (exFAT), and with a different drive letter.

Results go into `docs/progress.md` under "Windows test results", then commit and push.
