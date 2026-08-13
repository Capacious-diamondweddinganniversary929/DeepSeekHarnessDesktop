# 组装 DeepSeek Harness 桌面应用目录
# 用法: powershell -File assemble.ps1
$ErrorActionPreference = "Stop"

$root   = Split-Path -Parent $MyInvocation.MyCommand.Path   # ...\build
$proj   = Split-Path -Parent $root                          # DeepSeekHarnessDesktop
$out    = Join-Path $root "DeepSeekHarnessApp"
$electronDist = Join-Path $proj "node_modules\electron\dist"

if (-not (Test-Path "$electronDist\electron.exe")) { throw "electron dist 不存在: $electronDist" }
if (-not (Test-Path "$proj\resources\node\node.exe")) { throw "node.exe 不存在: resources\node" }
if (-not (Test-Path "$proj\resources\harness\apps\cli\src\bin.ts")) { throw "harness 目录不完整: resources\harness" }

# 1. 清空旧输出
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force -Path $out | Out-Null

# 2. 复制 Electron 运行时并重命名主程序
robocopy $electronDist $out /E /XF "electron.exe" /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy electron 失败 ($LASTEXITCODE)" }
Copy-Item "$electronDist\electron.exe" "$out\DeepSeekHarness.exe"

# 3. 复制我们自己的 app 到 resources\app
robocopy (Join-Path $proj "app") (Join-Path $out "resources\app") /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy app 失败 ($LASTEXITCODE)" }

# 4. 复制内置 Node 运行时
robocopy (Join-Path $proj "resources\node") (Join-Path $out "resources\node") /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy node 失败 ($LASTEXITCODE)" }

# 5. 复制 harness（无 /SL：默认把符号链接按目标内容复制，即解引用）
robocopy (Join-Path $proj "resources\harness") (Join-Path $out "resources\harness") /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy harness 失败 ($LASTEXITCODE)" }

# 6. 用 rcedit 给主程序替换成鲸鱼图标（可选，存在才执行）
$rcedit = Join-Path $root "rcedit-x64.exe"
$exe = Join-Path $out "DeepSeekHarness.exe"
$ico = Join-Path $root "app.ico"
if (Test-Path $rcedit -and (Test-Path $ico)) {
  & $rcedit $exe --set-icon $ico
  if ($LASTEXITCODE -eq 0) { Write-Host "rcedit: 图标已替换" } else { Write-Host "rcedit: 退出码 $LASTEXITCODE（忽略）" }
} else {
  Write-Host "rcedit 不存在，跳过图标替换"
}

# 7. 清理调试与冗余内容
foreach ($p in @(
  (Join-Path $out "resources\harness\.dsh"),
  (Join-Path $out "resources\harness\.turbo"),
  (Join-Path $out "resources\harness\pnpm-debug.log")
)) { if (Test-Path $p) { Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue } }

# 7. 报告
$files = (Get-ChildItem $out -Recurse -File | Measure-Object).Count
$size  = [math]::Round(((Get-ChildItem $out -Recurse -File | Measure-Object Length -Sum).Sum) / 1MB, 1)
Write-Host "组装完成: $out"
Write-Host "  文件数: $files"
Write-Host "  大小:   $size MB"
