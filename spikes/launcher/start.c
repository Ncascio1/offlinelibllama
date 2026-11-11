/*
 * Phase 0 spike: the tiny "Start.exe" that sits at the drive root.
 * It only starts _system\app\OfflineLibrary.exe (the real app) and exits.
 * - Built as a Windows GUI program, so no console window ever appears.
 * - Uses wide-character (Unicode) Windows functions, so drive paths with
 *   spaces or non-English characters work.
 * - Finds the app relative to its own location: works from any drive letter.
 * - Needs no Visual C++ runtime (links only to built-in Windows DLLs).
 */
#define UNICODE
#define _UNICODE
#include <windows.h>

int WINAPI wWinMain(HINSTANCE hInst, HINSTANCE hPrev, PWSTR cmdLine, int show) {
    (void)hInst; (void)hPrev; (void)show;
    wchar_t dir[32768], app[32768], cmd[32768], appDir[32768];

    /* Where is this Start.exe? Strip the file name to get the drive root folder. */
    DWORD n = GetModuleFileNameW(NULL, dir, 32768);
    if (n == 0 || n >= 32768) return 1;
    wchar_t *slash = wcsrchr(dir, L'\\');
    if (slash) *slash = 0;

    lstrcpyW(appDir, dir); lstrcatW(appDir, L"\\_system\\app");
    lstrcpyW(app, appDir); lstrcatW(app, L"\\OfflineLibrary.exe");

    if (GetFileAttributesW(app) == INVALID_FILE_ATTRIBUTES) {
        MessageBoxW(NULL,
            L"The library program is missing from this drive.\n\n"
            L"The folder _system may have been changed or deleted. "
            L"Please contact the person who sold you this drive for a replacement.",
            L"Offline Library", MB_OK | MB_ICONWARNING);
        return 2;
    }

    /* Quote the path (it may contain spaces) and pass on any arguments. */
    lstrcpyW(cmd, L"\""); lstrcatW(cmd, app); lstrcatW(cmd, L"\" ");
    if (cmdLine && lstrlenW(cmd) + lstrlenW(cmdLine) < 32767) lstrcatW(cmd, cmdLine);

    STARTUPINFOW si; PROCESS_INFORMATION pi;
    ZeroMemory(&si, sizeof si); si.cb = sizeof si;
    ZeroMemory(&pi, sizeof pi);
    if (!CreateProcessW(app, cmd, NULL, NULL, FALSE, 0, NULL, appDir, &si, &pi)) {
        MessageBoxW(NULL,
            L"The library could not start on this computer.\n\n"
            L"Try unplugging the drive, plugging it back in, and double-clicking Start again.",
            L"Offline Library", MB_OK | MB_ICONWARNING);
        return 3;
    }
    CloseHandle(pi.hThread); CloseHandle(pi.hProcess);
    return 0;
}
