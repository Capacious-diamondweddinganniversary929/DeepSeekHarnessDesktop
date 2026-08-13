$ErrorActionPreference = "Stop"
$h = "C:\Users\AzurLane\DeepSeekHarnessDesktop\resources\harness"
$out = "C:\Users\AzurLane\DeepSeekHarnessDesktop\build\DeepSeekHarnessApp\resources\harness"

# 1. remove partial dest harness
if ([System.IO.Directory]::Exists($out)) {
  [System.IO.Directory]::Delete($out, $true)
  Write-Host "removed partial dest"
}

# 2. delete redundant @deepseek-ai copies inside every per-package node_modules
#    (root node_modules/@deepseek-ai now holds all workspace packages)
$removed = 0
foreach ($sub in @("packages","apps","vendor","examples","website","native","python")) {
  $nms = Get-ChildItem "$h\$sub" -Recurse -Directory -Filter "node_modules" -ErrorAction SilentlyContinue
  foreach ($nm in $nms) {
    $dsai = Join-Path $nm.FullName "@deepseek-ai"
    if ([System.IO.Directory]::Exists($dsai)) {
      [System.IO.Directory]::Delete($dsai, $true)
      $removed++
    }
  }
}
Write-Host "removed redundant @deepseek-ai dirs: $removed"

# 3. count source files
$files = (Get-ChildItem $h -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
$size = [math]::Round(((Get-ChildItem $h -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum)/1GB,2)
Write-Host "source after trim: $files files, $size GB"
