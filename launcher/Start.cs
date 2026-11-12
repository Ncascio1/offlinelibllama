// Start.exe: the one file customers double-click at the top of the drive.
//
// It only starts _system\app\OfflineLibrary.exe (the real app) and exits.
// - Built as a Windows program without a console, so no black window appears.
// - Finds the app next to itself, so it works from any drive letter and from
//   folders with spaces or non-English characters.
// - Written in C# because the compiler for it (csc.exe, .NET Framework 4) is
//   part of every Windows 10 and 11, so it can be built without downloading
//   anything, and it runs on every Windows 10 and 11 without installing anything.
// - If the app is already open, the app itself brings its window to the front.
// Build: launcher\build-start.ps1
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("Offline Library")]
[assembly: AssemblyProduct("Offline Library")]
[assembly: AssemblyVersion("0.1.0.0")]
[assembly: AssemblyFileVersion("0.1.0.0")]

static class Start
{
    const string Title = "Offline Library";

    [STAThread]
    static int Main(string[] args)
    {
        // The folder this Start.exe is in = the top of the drive.
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string appDir = Path.Combine(root, "_system", "app");
        string app = Path.Combine(appDir, "OfflineLibrary.exe");

        if (!File.Exists(app))
        {
            MessageBox.Show(
                "The library program is missing from this drive.\n\n" +
                "The folder _system may have been changed or deleted. " +
                "Contact the person who gave you this drive for a replacement.",
                Title, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return 2;
        }

        try
        {
            var info = new ProcessStartInfo(app)
            {
                WorkingDirectory = appDir,
                UseShellExecute = false,
            };
            // Pass on anything given to Start.exe (normally nothing).
            if (args.Length > 0) info.Arguments = "\"" + string.Join("\" \"", args) + "\"";
            Process.Start(info);
            return 0;
        }
        catch (Exception)
        {
            MessageBox.Show(
                "The library could not start on this computer.\n\n" +
                "Unplug the drive, plug it back in, and double-click Start again.",
                Title, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return 3;
        }
    }
}
