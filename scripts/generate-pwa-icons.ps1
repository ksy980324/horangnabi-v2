# Optional Windows helper. Production builds use the committed PNGs.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$iconDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\public\icons'))
[IO.Directory]::CreateDirectory($iconDirectory) | Out-Null
$wing = 'M23 23C20 10 7 5 5 14C3 22 11 28 21 29C8 25 7 39 15 40C21 41 23 32 24 28C25 32 27 41 33 40C41 39 40 25 27 29C37 28 45 22 43 14C41 5 28 10 25 23Z'
$accent = 'M12 15C15 15 19 19 20 22M36 15C33 15 29 19 28 22'
$body = 'M24 21V34M24 21C24 17 20 15 19 14M24 21C24 17 28 15 29 14'
$svg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 64 64" fill="none"><rect width="64" height="64" fill="#f8faf9"/><g transform="translate(8 8)"><path d="' + $wing + '" fill="#16877f"/><path d="' + $accent + '" stroke="#a9ded0" stroke-width="3" stroke-linecap="round"/><path d="' + $body + '" stroke="#233647" stroke-width="2.5" stroke-linecap="round"/></g></svg>'
[IO.File]::WriteAllText((Join-Path $iconDirectory 'icon.svg'), $svg, [Text.UTF8Encoding]::new($false))
function New-VectorPath([string]$data) {
  $path = [Drawing.Drawing2D.GraphicsPath]::new()
  $tokens = [regex]::Matches($data, '[MCVZ]|-?\d+(?:\.\d+)?')
  $cursor = 0
  $pointX = [single]0
  $pointY = [single]0
  while ($cursor -lt $tokens.Count) {
    $operation = $tokens[$cursor++].Value
    switch ($operation) {
      'M' { $pointX = [single]$tokens[$cursor++].Value; $pointY = [single]$tokens[$cursor++].Value; $path.StartFigure() }
      'C' {
        $control = @()
        for ($position = 0; $position -lt 6; $position++) { $control += [single]$tokens[$cursor++].Value }
        $path.AddBezier($pointX, $pointY, $control[0], $control[1], $control[2], $control[3], $control[4], $control[5])
        $pointX = $control[4]; $pointY = $control[5]
      }
      'V' { $nextY = [single]$tokens[$cursor++].Value; $path.AddLine($pointX, $pointY, $pointX, $nextY); $pointY = $nextY }
      'Z' { $path.CloseFigure() }
      default { throw 'Unsupported SVG operation.' }
    }
  }
  return $path
}
foreach ($icon in @(@('icon-192', 192), @('icon-512', 512), @('maskable-512', 512), @('apple-touch-icon', 180))) {
  $size = [int]$icon[1]
  $bitmap = [Drawing.Bitmap]::new($size, $size)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([Drawing.ColorTranslator]::FromHtml('#f8faf9'))
  $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.ScaleTransform([single]($size / 64), [single]($size / 64))
  $graphics.TranslateTransform(8, 8)
  $wingPath = New-VectorPath $wing
  $accentPath = New-VectorPath $accent
  $bodyPath = New-VectorPath $body
  $brush = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#16877f'))
  $accentPen = [Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#a9ded0'), [single]3)
  $bodyPen = [Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#233647'), [single]2.5)
  foreach ($pen in @($accentPen, $bodyPen)) { $pen.StartCap = [Drawing.Drawing2D.LineCap]::Round; $pen.EndCap = [Drawing.Drawing2D.LineCap]::Round }
  $graphics.FillPath($brush, $wingPath)
  $graphics.DrawPath($accentPen, $accentPath)
  $graphics.DrawPath($bodyPen, $bodyPath)
  $bitmap.Save((Join-Path $iconDirectory ($icon[0] + '.png')), [Drawing.Imaging.ImageFormat]::Png)
  foreach ($resource in @($wingPath, $accentPath, $bodyPath, $brush, $accentPen, $bodyPen, $graphics, $bitmap)) { $resource.Dispose() }
}
Write-Output 'Created butterfly icons: 192, 512, maskable 512, Apple 180.'
