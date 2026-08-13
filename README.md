# DeepSeek Harness 桌面版

将 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 打包成 Windows 一键安装包（`.exe`）：
**Electron 桌面壳 + 内置 Node 运行时 + 完整 Harness 环境**，双击安装即用。

![DeepSeek](log.svg)

## ✨ 特性

- **一键启动**：双击 `DeepSeekHarness.exe` → 自动拉起后端 → 直接打开 DeepSeek Harness Web UI
- **内置 Node 24**：自包含运行时，用户无需安装 Node.js
- **完整环境**：打包了 Harness 全部依赖（链接已物化为真实文件，Inno Setup 友好）
- **无边框窗口**：UI 铺满窗口，右上角内嵌最小化 / 最大化 / 关闭按钮
- **单实例**：重复启动不会拉起多个后端
- **免管理员**：安装到 `%LocalAppData%\Programs\DeepSeek Harness`

## 📦 产物

| 文件 | 说明 |
|------|------|
| `installers/DeepSeekHarnessSetup-*.exe` | 一键安装包（Inno Setup 编译） |
| `build/DeepSeekHarnessApp/DeepSeekHarness.exe` | 免安装版（直接运行） |

## 🗂 目录结构

```
app/                      Electron 桌面应用源码
  main.js                 主进程：启动后端、注入窗口控制按钮
  preload.js / titlebar-preload.js    preload 脚本
  renderer/               渲染页面
build/                    构建脚本与产物
  materialize3.js         node_modules 链接物化（消除 junction/符号链接）
  assemble.ps1            组装 Electron 应用目录
  trim.ps1 / flatten.ps1  精简脚本
  convert-icon.js         图标转换
setup.iss                 Inno Setup 安装脚本
log.svg                   应用图标（DeepSeek logo）
```

## 🔧 构建流程

> 需要：Windows 10+、[Node.js ≥ 22.19](https://nodejs.org/)、[Inno Setup 7](https://jrsoftware.org/isdl.php)、[pnpm 10](https://pnpm.io/)（注意：**必须用 pnpm 10**，pnpm 11 移除了 hoisted linker）

### 1. 准备 Harness 依赖（pnpm 10 + hoisted）

```powershell
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install && pnpm run build
```

打包用的副本需要：删除根 `package.json` 的 `packageManager` 字段，`.npmrc` 设置
`node-linker=hoisted` 与 `manage-package-manager-versions=false`，然后用
`npx -y pnpm@10 install` 安装（避免 pnpm 11 的 isolated 符号链接布局）。

### 2. 物化链接（关键步骤）

pnpm 的 workspace 布局含大量 junction/符号链接，必须转为真实文件，否则
robocopy 会因循环依赖挂起、Inno Setup 会因路径超长失败：

```powershell
node build\materialize3.js <harness目录>
```

同时会删除 pnpm 的 `.ignored_*` 目录（避免 Windows 260 字符路径限制）。

### 3. 组装 + 编译

```powershell
pwsh build\assemble.ps1                 # electron 运行时 + 内置 node + harness → DeepSeekHarnessApp
& "C:\Program Files\Inno Setup 7\ISCC.exe" setup.iss   # 编译安装包
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
