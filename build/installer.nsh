; Custom NSIS hooks, picked up by electron-builder from build/installer.nsh (D-023).
;
; Every non-web electron-builder installer keeps a copy of itself (~215 MB) in
; %LOCALAPPDATA%\datadesk-updater for electron-updater, and its uninstaller never removes it.
; DataDesk has no auto-updater, so the copy is deleted right after installing and the folder on
; uninstall. Per-user install: $LOCALAPPDATA is the installing user's.

!macro customInstall
  Delete "$LOCALAPPDATA\datadesk-updater\installer.exe"
  RMDir "$LOCALAPPDATA\datadesk-updater"
!macroend

!macro customUnInstall
  RMDir /r "$LOCALAPPDATA\datadesk-updater"
!macroend
