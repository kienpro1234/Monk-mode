Set WshShell = CreateObject("WScript.Shell")
strPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strPath
WshShell.Run """C:\Program Files\nodejs\node.exe"" ""scripts\desktop-server.mjs""", 0, False
