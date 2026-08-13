$ErrorActionPreference = "Stop"
$proj = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)   # 项目根
$h = Join-Path $proj "resources\harness"
$out = Join-Path $proj "build\DeepSeekHarnessApp\resources\harness"

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

# 3. web-app 需要能解析 @deepseek-ai/dsh-web-frontend（apps/web 里的前端产物）
$feSrc = Join-Path $h "apps\web"
$feDst = Join-Path $h "node_modules\@deepseek-ai\dsh-web-frontend"
robocopy $feSrc $feDst /E /XD node_modules /NFL /NDL /NJH /NJS /NP | Out-Null
Write-Host "web-frontend copied: $(Test-Path (Join-Path $feDst 'dist\index.html'))"

# 4. count source files
$files = (Get-ChildItem $h -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Host "source after trim: $files files"
