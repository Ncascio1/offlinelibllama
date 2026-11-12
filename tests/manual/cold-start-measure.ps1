# Measure cold-start times of each engine ALONE on the stick (no app, nothing else reading).
# Usage: cold-measure.ps1 -Drive D: -LlamaExtra '--no-mmap'   (LlamaExtra optional)
param([string]$Drive = 'D:', [string]$LlamaExtra = '', [switch]$SkipKiwix)
$ErrorActionPreference = 'Stop'
$sys = "$Drive\_system"
function Wait-Http($url, $max) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $max) {
    $code = curl.exe -s -o NUL -w "%{http_code}" --max-time 5 $url
    if ($code -eq '200') { return $sw.Elapsed.TotalSeconds }
    Start-Sleep -Milliseconds 250
  }
  return -1
}

if (-not $SkipKiwix) {
  $zims = (Get-ChildItem "$Drive\library" -Filter *.zim | Sort-Object FullName).FullName
  $args = @('--address','127.0.0.1','--port','58801','--blockexternal','--skipInvalid','--nolibrarybutton','--threads','8') + ($zims | % { "`"$_`"" })
  $k = Start-Process "$sys\kiwix\kiwix-serve.exe" -ArgumentList $args -WorkingDirectory "$sys\kiwix" -WindowStyle Hidden -PassThru
  $t = Wait-Http 'http://127.0.0.1:58801/catalog/v2/entries?count=-1' 300
  "kiwix alone: catalog answered after {0:N1} s" -f $t
  $sw = [Diagnostics.Stopwatch]::StartNew()
  curl.exe -s -o NUL --max-time 120 'http://127.0.0.1:58801/search?books.name=wikipedia_en_all_nopic_2026-06&pattern=water&pageLength=1'
  "kiwix alone: first Wikipedia search {0:N1} s" -f $sw.Elapsed.TotalSeconds
  Stop-Process -Id $k.Id -Force
}

$largs = @('-m', "`"$Drive\models\small.gguf`"", '--host','127.0.0.1','--port','58802','-c','4096','-np','1','--no-webui','--offline')
if ($LlamaExtra) { $largs += $LlamaExtra.Split(' ') }
$l = Start-Process "$sys\llama\llama-server.exe" -ArgumentList $largs -WorkingDirectory "$sys\llama" -WindowStyle Hidden -PassThru
$t = Wait-Http 'http://127.0.0.1:58802/health' 600
"AI alone ($(if ($LlamaExtra) {$LlamaExtra} else {'default'})): ready after {0:N1} s, memory {1:N0} MB" -f $t, ((Get-Process -Id $l.Id).WorkingSet64/1MB)
Stop-Process -Id $l.Id -Force
