# Automated Desktop Shortcut Creator for GANN GRAPH
$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$ShortcutPath = Join-Path -Path $DesktopPath -ChildPath "GANN GRAPH.lnk"
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "D:\ANTIGRAVITY PROJECT FOLDER\Gann_Drafting_Desk_v1.exe"
$Shortcut.WorkingDirectory = "D:\ANTIGRAVITY PROJECT FOLDER"
$Shortcut.IconLocation = "D:\ANTIGRAVITY PROJECT FOLDER\gann_icon.ico,0"
$Shortcut.Description = "W.D. Gann Digital Drafting Desk"
$Shortcut.Save()
Write-Host "Desktop shortcut created successfully at: $ShortcutPath"
