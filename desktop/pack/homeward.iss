; Homeward family installer (Windows amd64).
; Unsigned on purpose — Authenticode is not available. SmartScreen will warn.
; Never embed Ollama chat/speech model weights. Public web port is 43123.

#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif

#ifndef HomewardSourceDir
  #define HomewardSourceDir "..\..\dist\windows\amd64\Homeward-windows-amd64"
#endif

#ifndef HomewardOutputDir
  #define HomewardOutputDir "..\..\dist\windows\amd64"
#endif

#define MyAppName "Homeward"
#define MyAppPublisher "Homeward"
#define MyAppURL "https://github.com/matt-dance/homeword-family-ai"
#define MyAppExeName "Homeward.exe"

[Setup]
AppId={{8F3A2C1E-6B47-4D90-9E15-A1B2C3D4E5F6}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
DefaultDirName={localappdata}\Programs\Homeward
DefaultGroupName=Homeward
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir={#HomewardOutputDir}
OutputBaseFilename=Homeward-windows-amd64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
LicenseFile=..\..\LICENSE
InfoBeforeFile=windows-smartscreen.txt
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName=Homeward
UsedUserAreasWarning=no
CloseApplications=yes
RestartApplications=no
SetupLogging=yes
#ifdef HomewardIcon
SetupIconFile={#HomewardIcon}
#endif

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#HomewardSourceDir}\Homeward.exe"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "{#HomewardSourceDir}\resources\*"; DestDir: "{app}\resources"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Homeward"; Filename: "{app}\{#MyAppExeName}"; Comment: "Open Homeward"
Name: "{group}\Uninstall Homeward"; Filename: "{uninstallexe}"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Homeward"; ValueData: """{app}\{#MyAppExeName}"""; Flags: uninsdeletevalue

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Open Homeward"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\{#MyAppExeName}"; Parameters: "--uninstall"; Flags: runhidden waituntilterminated skipifdoesntexist; RunOnceId: "HomewardStop"

[Code]
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
  begin
    if MsgBox('Also delete Homeward family data and downloaded AI models? This cannot be undone.', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
      DelTree(ExpandConstant('{localappdata}\Homeward'), True, True, True);
  end;
end;
