# Builds Start.exe (the file customers double-click) from Start.cs.
# Uses the C# compiler that is part of Windows (.NET Framework 4), so nothing
# needs to be downloaded or installed.
# Usage: launcher\build-start.ps1 [-OutDir <folder>]   (default: launcher\out)
param([string]$OutDir = (Join-Path $PSScriptRoot 'out'))
$ErrorActionPreference = 'Stop'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw "The C# compiler that comes with Windows was not found at $csc" }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$exe = Join-Path $OutDir 'Start.exe'
# /target:winexe = no console window. /optimize = smaller and faster.
& $csc /nologo /target:winexe /optimize+ /platform:anycpu "/win32icon:$PSScriptRoot\start.ico" "/out:$exe" `
  /reference:System.Windows.Forms.dll "$PSScriptRoot\Start.cs"
if ($LASTEXITCODE -ne 0) { throw "Start.exe could not be built (compiler exit code $LASTEXITCODE)" }
"built $exe ($((Get-Item $exe).Length) bytes)"
