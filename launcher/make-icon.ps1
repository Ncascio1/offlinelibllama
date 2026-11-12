# Draws the Start icon (blue square, yellow open book) and saves launcher\start.ico.
# Run once; the .ico is kept in git, so normal builds do not need this script.
# The .ico holds PNG pictures at 256, 48, 32 and 16 pixels (supported since Windows Vista).
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot 'start.ico'

function Draw-Png([int]$s) {
  $bmp = New-Object Drawing.Bitmap $s, $s
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $blue = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(0x1f, 0x4e, 0x79))
  $yellow = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(0xf2, 0xc2, 0x30))
  $line = New-Object Drawing.Pen ([Drawing.Color]::FromArgb(0x1f, 0x4e, 0x79)), ([Math]::Max(1, $s / 24))
  # Rounded blue square
  $r = $s * 0.18; $p = New-Object Drawing.Drawing2D.GraphicsPath
  $p.AddArc(0, 0, $r, $r, 180, 90); $p.AddArc($s - $r - 1, 0, $r, $r, 270, 90)
  $p.AddArc($s - $r - 1, $s - $r - 1, $r, $r, 0, 90); $p.AddArc(0, $s - $r - 1, $r, $r, 90, 90); $p.CloseFigure()
  $g.FillPath($blue, $p)
  # Open book: two yellow pages
  $top = $s * 0.27; $bot = $s * 0.76; $mid = $s / 2; $l = $s * 0.16; $rr = $s * 0.84
  $g.FillPolygon($yellow, [Drawing.PointF[]]@(
    (New-Object Drawing.PointF $l, ($top + $s * 0.04)), (New-Object Drawing.PointF ($mid - $s * 0.02), $top),
    (New-Object Drawing.PointF ($mid - $s * 0.02), $bot), (New-Object Drawing.PointF $l, ($bot + $s * 0.03))))
  $g.FillPolygon($yellow, [Drawing.PointF[]]@(
    (New-Object Drawing.PointF ($mid + $s * 0.02), $top), (New-Object Drawing.PointF $rr, ($top + $s * 0.04)),
    (New-Object Drawing.PointF $rr, ($bot + $s * 0.03)), (New-Object Drawing.PointF ($mid + $s * 0.02), $bot)))
  if ($s -ge 32) {  # text lines on the pages, only where they can be seen
    foreach ($i in 1..3) {
      $y = $top + ($bot - $top) * $i / 4.5
      $g.DrawLine($line, $l + $s * 0.06, $y, $mid - $s * 0.08, $y)
      $g.DrawLine($line, $mid + $s * 0.08, $y, $rr - $s * 0.06, $y)
    }
  }
  $g.Dispose()
  $ms = New-Object IO.MemoryStream
  $bmp.Save($ms, [Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  return ,$ms.ToArray()
}

$sizes = 256, 48, 32, 16
$pngs = $sizes | ForEach-Object { ,(Draw-Png $_) }
$fs = New-Object IO.MemoryStream; $w = New-Object IO.BinaryWriter $fs
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]$sizes.Count)   # ICO header
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {                                   # directory
  $d = if ($sizes[$i] -ge 256) { 0 } else { $sizes[$i] }
  $w.Write([byte]$d); $w.Write([byte]$d); $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([UInt16]1); $w.Write([UInt16]32); $w.Write([UInt32]$pngs[$i].Length); $w.Write([UInt32]$offset)
  $offset += $pngs[$i].Length
}
foreach ($b in $pngs) { $w.Write($b) }
[IO.File]::WriteAllBytes($out, $fs.ToArray())
"saved $out ($($fs.Length) bytes)"
