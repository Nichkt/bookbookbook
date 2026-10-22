; Installer hooks for bookbookbook: bundle > windows > nsis > installerHooks in tauri.conf.json.
;
; Tauri's installer remembers where the app is installed in HKCU\Software\<publisher>\<productName>.
; Up to 0.1.3 the publisher was "bookbookbook"; from 0.1.4 it's "Nicholas Ton", so the installer
; looks for that folder in a new place. Without these hooks, updating an app installed outside the
; default folder would install a second copy in the default folder, and installing by hand over an
; old version would fail at "Uninstall before installing". So the folder is carried over to the
; new place before the installer reads it, and the old place is cleared once the install is done.

; Software\<bundle.publisher>\<productName>: the build stops if this no longer matches.
!define BBB_PUBLISHER "Nicholas Ton"
!define BBB_INSTALL_KEY "Software\${BBB_PUBLISHER}\bookbookbook"
!define BBB_OLD_PUBLISHER_KEY "Software\bookbookbook"
!define BBB_OLD_INSTALL_KEY "${BBB_OLD_PUBLISHER_KEY}\bookbookbook"
; Where the installer puts the app when it remembers no folder (installMode currentUser).
!define BBB_DEFAULT_DIR "$LOCALAPPDATA\bookbookbook"

; Tauri gives the app's file a company, but not the installer's, nor the uninstaller's.
VIAddVersionKey "CompanyName" "${BBB_PUBLISHER}"

; Runs as the installer's window opens: after .onInit has picked the folder, before the
; "already installed" page reads it. A silent install (/S) has no window, nor that page, so
; NSIS_HOOK_PREINSTALL runs it instead.
!define MUI_CUSTOMFUNCTION_GUIINIT BbbCarryOverInstallFolder

Function BbbCarryOverInstallFolder
  Push $0
  ReadRegStr $0 SHCTX "${BBB_INSTALL_KEY}" ""
  ${If} $0 == ""
    ReadRegStr $0 SHCTX "${BBB_OLD_INSTALL_KEY}" ""
    ${If} $0 != ""
      WriteRegStr SHCTX "${BBB_INSTALL_KEY}" "" $0
      ; Like .onInit, keep a folder given with /D=.
      ${If} $INSTDIR == "${BBB_DEFAULT_DIR}"
        StrCpy $INSTDIR $0
      ${EndIf}
    ${EndIf}
  ${EndIf}
  ClearErrors
  Pop $0
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  ; Section Install has just made the folder, but put nothing in it yet, nor checked whether the
  ; app is running there. A silent install picked the default folder, so it moves to the old one.
  ${If} ${Silent}
    Push $0
    StrCpy $0 $INSTDIR
    Call BbbCarryOverInstallFolder
    ${If} $INSTDIR != $0
      ; SetOutPath makes its folder the current one, which Windows won't remove, so move first.
      SetOutPath $INSTDIR
      RMDir $0
    ${EndIf}
    Pop $0
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !if "${MANUPRODUCTKEY}" != "${BBB_INSTALL_KEY}"
    !error "installer-hooks.nsh: BBB_PUBLISHER, BBB_INSTALL_KEY and BBB_DEFAULT_DIR must follow bundle.publisher and productName"
  !endif
  !if "${INSTALLMODE}" != "currentUser"
    !error "installer-hooks.nsh: BBB_DEFAULT_DIR is the currentUser install mode's folder"
  !endif
  ; Section Install has just saved the folder in the new place.
  DeleteRegKey SHCTX "${BBB_OLD_INSTALL_KEY}"
  DeleteRegKey /ifempty SHCTX "${BBB_OLD_PUBLISHER_KEY}"
!macroend
