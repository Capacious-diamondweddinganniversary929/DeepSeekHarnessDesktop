# DeepSeek Harness 桌面版

将 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 打包成三平台桌面应用：
**Electron 桌面壳 + 内置 Node 运行时 + 完整 Harness 环境**，双击即用。

![DeepSeek](log.svg)

## ✨ 特性

- **一键启动**：双击 `DeepSeekHarness.exe` → 自动拉起后端 → 直接打开 DeepSeek Harness Web UI
- **内置 Node 24**：自包含运行时，用户无需安装 Node.js
- **完整环境**：打包了 Harness 全部依赖（链接已物化为真实文件）
- **无边框窗口**：UI 铺满窗口，右上角内嵌最小化 / 最大化 / 关闭按钮
- **单实例**：重复启动不会拉起多个后端
- **免管理员**：Windows 安装到 `%LocalAppData%\Programs\DeepSeek Harness`

## 📦 产物

| 平台 | 文件 | 说明 |
|------|------|------|
| Windows | `installers/DeepSeekHarnessSetup-*.exe` | Inno Setup 一键安装包 |
| Windows | `build/DeepSeekHarnessApp/DeepSeekHarness.exe` | 免安装版（直接运行） |
| macOS | `installers/DeepSeekHarness-macOS-<arch>-<ver>.dmg` | 应用镜像（.app，ad-hoc 签名） |
| Linux | `installers/DeepSeekHarness-linux-<arch>-<ver>.tar.gz` | 免安装压缩包（解压即用） |
| Linux | `installers/deepseek-harness_<ver>_<arch>.deb` | Debian/Ubuntu 安装包 |

> 三平台均由 GitHub Actions 自动构建（`.github/workflows/build.yml` 矩阵），
> 推送 `v*` 标签时自动发布到 Release；也可 `workflow_dispatch` 手动触发。

## 🗂 目录结构

```
app/                      Electron 桌面应用源码
  main.js                 主进程：启动后端、注入窗口控制按钮
  preload.js / titlebar-preload.js    preload 脚本
  renderer/               渲染页面
build/                    构建脚本与产物（跨平台，Node 实现）
  build-harness.js        克隆 deepseek-harness、准备 .npmrc、pnpm 构建
  materialize3.js         node_modules 链接物化（消除 junction/符号链接）
  download-node.js        按平台下载内置 Node 运行时（win/darwin/linux × x64/arm64）
  trim.js                 精简 harness（跨平台版 trim.ps1）
  assemble.js             组装应用目录（Windows robocopy / POSIX cp -aL）
  convert-icon.js         SVG -> ICO（png-to-ico）+ PNG 源图
  assemble.ps1 / trim.ps1 Windows 本地构建脚本（与 assemble.js/trim.js 等价）
setup.iss                 Inno Setup 安装脚本（本地/CI 均可用）
log.svg                   应用图标（DeepSeek logo）
```

## 🔧 构建流程

> 本地需要：Node.js ≥ 22、[pnpm 10](https://pnpm.io/)（注意：**必须用 pnpm 10**，
> pnpm 11 移除了 hoisted linker）；Windows 额外需要 [Inno Setup 7](https://jrsoftware.org/isdl.php)。
> CI 三平台全自动，无需本地环境。

### 1. 准备 Harness 依赖（pnpm 10 + hoisted）

```bash
node build/build-harness.js        # 克隆 → 删 packageManager → .npmrc(hoisted) → pnpm install → pnpm build
```

### 2. 物化链接 + 精简

```bash
node build/materialize3.js resources/harness   # junction/符号链接 → 真实文件
node build/trim.js                             # 删除冗余 @deepseek-ai 副本、拷贝 web 前端
```

### 3. 运行时 + 组装

```bash
node build/download-node.js v24.14.0           # 内置 Node（按当前平台/架构）
npm install                                    # electron + sharp + png-to-ico
node build/convert-icon.js log.svg build/app.ico
node build/assemble.js                         # 组装到 build/DeepSeekHarnessApp
```

### 4. 打包

```bash
# Windows
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" "/DProjectDir=$((Get-Location).Path)" setup.iss
# macOS
hdiutil create -volname "DeepSeek Harness" -srcfolder build/DeepSeekHarnessApp/DeepSeekHarness.app -ov -format UDZO installers/DeepSeekHarness-macOS-$(uname -m).dmg
# Linux
tar -C build/DeepSeekHarnessApp -czf installers/DeepSeekHarness-linux.tar.gz DeepSeekHarness
```

## 🚀 使用

1. 双击 `DeepSeekHarnessSetup-*.exe` 安装（免管理员，自动建桌面快捷方式）
2. 双击桌面「DeepSeek Harness」图标
3. 首次使用：在 Web 界面设置 **DeepSeek API Key**

## ⚠️ 注意

- 用户数据存放在 `~/.dsh`（与安装目录分离），卸载后保留
- 服务监听 `http://127.0.0.1:3080`，关闭窗口即停止

## 📄 许可

MIT。Harness 本体版权归 [DeepSeek AI](https://deepseek.com) 所有，见上游仓库。
