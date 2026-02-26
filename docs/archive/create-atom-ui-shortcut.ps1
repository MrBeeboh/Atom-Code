# Creates a desktop shortcut "ATOM UI" that runs start_atom_ui.bat and uses ATOM UI.ico
$batPath  = "c:\CURSOR\lm-studio-ui\start_atom_ui.bat"
$desktop  = [Environment]::GetFolderPath("Desktop")
$shortcut = Join-Path $desktop "ATOM UI.lnk"

# Prefer icon on Desktop; fallback to Pictures
$iconOnDesktop = Join-Path $desktop "ATOM UI.ico"
$iconInPictures = "C:\Users\Fires\Pictures\ATOM UI.ico"
$iconPath = if (Test-Path $iconOnDesktop) { $iconOnDesktop } else { $iconInPictures }

# Remove old shortcut so we don't keep a broken icon cache
if (Test-Path $shortcut) { Remove-Item $shortcut -Force }

$ws = New-Object -ComObject WScript.Shell
$s  = $ws.CreateShortcut($shortcut)
$s.TargetPath       = $batPath
$s.WorkingDirectory = "c:\CURSOR\lm-studio-ui"
# Use path only (no ",0") so Windows reliably loads the .ico
$s.IconLocation     = $iconPath
$s.Description      = "Start ATOM UI (LM Studio frontend)"
$s.Save()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($ws) | Out-Null

Write-Host "Shortcut created: $shortcut"
Write-Host "Icon used: $iconPath"
Write-Host "Double-click 'ATOM UI' on your desktop to run the batch file."
Write-Host ""
Write-Host "If the icon still looks blank: right-click the shortcut -> Properties -> Change Icon -> Browse to the .ico and pick it -> OK."
