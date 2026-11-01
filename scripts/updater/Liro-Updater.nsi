!include "LogicLib.nsh"

Name "Liro Updater"
OutFile "Liro-Updater.exe"
Unicode true
Icon "Liro-Updater.ico"
WindowIcon off
SetCompressor /SOLID lzma
InstallDir "$TEMP"
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
ShowInstDetails nevershow

Var Code

!define /ifndef VER "0.0.0"
!define /ifndef VER4 "0.0.0.0"
!define /ifndef STANDALONE "auto"

VIProductVersion "${VER4}"
VIAddVersionKey ProductName "Liro Updater"
VIAddVersionKey CompanyName "Liro"
VIAddVersionKey FileDescription "Установщик обновления Liro"
VIAddVersionKey FileVersion "${VER}"
VIAddVersionKey ProductVersion "${VER}"
VIAddVersionKey LegalCopyright "© Liro"

Section
  SetOutPath "$TEMP\liro-updater"
  File "updater.ps1"
!if ${STANDALONE} == "auto"
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$TEMP\liro-updater\updater.ps1"'
!else
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$TEMP\liro-updater\updater.ps1" -Version "${STANDALONE}"'
!endif
  Pop $Code
  RMDir /r "$TEMP\liro-updater"
SectionEnd
