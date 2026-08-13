$ErrorActionPreference = "Stop"
$h = "C:\Users\AzurLane\DeepSeekHarnessDesktop\resources\harness"

# 1. Enumerate workspace packages (packages/*/* and vendor/* with package.json)
$pkgs = @()
foreach ($group in Get-ChildItem "$h\packages" -Directory) {
  foreach ($pkg in Get-ChildItem $group.FullName -Directory) {
    if (Test-Path "$($pkg.FullName)\package.json") { $pkgs += $pkg.FullName }
  }
}
foreach ($vpkg in Get-ChildItem "$h\vendor" -Directory) {
  if (Test-Path "$($vpkg.FullName)\package.json") { $pkgs += $vpkg.FullName }
}
Write-Host "workspace packages: $($pkgs.Count)"

# 2. Clear existing junctions in root node_modules/@deepseek-ai
$dsai = "$h\node_modules\@deepseek-ai"
if (Test-Path $dsai) {
  foreach ($item in Get-ChildItem $dsai -Force) {
    if ($item.LinkType) {
      cmd /c rmdir "$($item.FullName)" 2>$null
      Write-Host "cleared junction: $($item.Name)"
    }
  }
}

# 3. Copy each workspace package into root node_modules (skip its node_modules)
$copied = 0
foreach ($p in $pkgs) {
  $name = (Get-Content "$p\package.json" -Raw | ConvertFrom-Json).name
  if (-not $name) { continue }
  $rel = $name -replace '^@([^/]+)/', '$1\'   # @deepseek-ai/x -> deepseek-ai\x
  $dest = "$h\node_modules\$rel"
  robocopy $p $dest /E /XJ /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -lt 8) { $copied++ } else { Write-Host "FAILED copy: $name" }
}
Write-Host "copied: $copied packages -> root node_modules"

# 4. Delete ALL per-package node_modules (they are now redundant)
$deleted = 0
foreach ($sub in @("packages","apps","vendor","examples","website","native","python")) {
  $dirs = Get-ChildItem "$h\$sub" -Recurse -Directory -Filter "node_modules" -ErrorAction SilentlyContinue
  foreach ($d in $dirs) {
    [System.IO.Directory]::Delete($d.FullName, $true)
    $deleted++
  }
}
Write-Host "deleted per-package node_modules: $deleted"

# 5. Report reparse points
$links = 0
$walker = {
  param($dir)
  foreach ($e in [System.IO.Directory]::EnumerateFileSystemEntries($dir)) {
    $attr = [System.IO.File]::GetAttributes($e)
    if ($attr -band [System.IO.FileAttributes]::ReparsePoint) { $script:links++ }
    elseif ($attr -band [System.IO.FileAttributes]::Directory) {
      try { & $walker $e } catch {}
    }
  }
}
& $walker $h
Write-Host "remaining reparse points: $links"
