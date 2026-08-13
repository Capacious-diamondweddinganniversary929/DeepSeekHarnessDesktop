#define MyAppName "DeepSeek Harness"
; 版本号：本地默认值，CI 上用 /DMyAppVersion= 覆盖（与标签保持一致）
#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif
#define MyAppExeName "DeepSeekHarness.exe"
; 项目根路径：本地默认值，CI 上用 /DProjectDir= 覆盖
#ifndef ProjectDir
  #define ProjectDir "C:\Users\AzurLane\DeepSeekHarnessDesktop"
#endif
#define AppDirSource ProjectDir + "\build\DeepSeekHarnessApp"

[Setup]
AppId={{B4C9B9C2-9C41-4F8E-8A0C-3DEE42D99C01}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher=DeepSeek AI
AppPublisherURL=https://github.com/deepseek-ai/deepseek-harness
AppSupportURL=https://github.com/deepseek-ai/deepseek-harness
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir={#ProjectDir}\installers
OutputBaseFilename=DeepSeekHarnessSetup-{#MyAppVersion}
SetupIconFile={#ProjectDir}\build\app.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.19041
CloseApplications=no
RestartApplications=no
SetupLogging=yes

[Languages]
; 中文语言文件打进仓库（lang/），避免不同 Inno 版本目录差异
Name: "chinesesimplified"; MessagesFile: "{#SourcePath}lang\ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#AppDirSource}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#ProjectDir}\build\app.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app.ico"; WorkingDir: "{app}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
