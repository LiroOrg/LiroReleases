!include "LogicLib.nsh"

Name "Liro Updater"
OutFile "Liro-Updater.exe"
Unicode true
SetCompressor /SOLID lzma
InstallDir "$TEMP"
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
ShowInstDetails nevershow

Var Code

Section
  SetOutPath "$TEMP\liro-updater"
  File "updater.ps1"
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$TEMP\liro-updater\updater.ps1"'
  Pop $Code
  RMDir /r "$TEMP\liro-updater"
SectionEnd
