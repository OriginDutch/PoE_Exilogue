; Exilogue installer extras: an optional desktop shortcut (checkbox on the last page, off by default).
!macro customFinishPage
  !ifndef BUILD_UNINSTALLER
    Function ExilogueRun
      ExecShell "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    FunctionEnd
    Function ExilogueDesktopShortcut
      CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    FunctionEnd
    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_TEXT "Start Exilogue"
    !define MUI_FINISHPAGE_RUN_FUNCTION "ExilogueRun"
    !define MUI_FINISHPAGE_SHOWREADME
    !define MUI_FINISHPAGE_SHOWREADME_TEXT "Create a desktop shortcut"
    !define MUI_FINISHPAGE_SHOWREADME_FUNCTION "ExilogueDesktopShortcut"
    !define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
    !insertmacro MUI_PAGE_FINISH
  !endif
!macroend

!macro customUnInstall
  ; Only a real uninstall removes the shortcut: an update also runs the old uninstaller, and must keep it.
  ${ifNot} ${isUpdated}
    Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  ${endIf}
!macroend
