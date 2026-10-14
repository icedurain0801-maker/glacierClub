Option Explicit
Dim shell, fs, launcher, command, result
If WScript.Arguments.Count <> 1 Then WScript.Quit 2
Set fs = CreateObject("Scripting.FileSystemObject")
launcher = WScript.Arguments(0)
If Not fs.FileExists(launcher) Then WScript.Quit 2
If LCase(fs.GetExtensionName(launcher)) <> "cmd" Then WScript.Quit 2
If InStr(launcher, Chr(34)) > 0 Then WScript.Quit 2
Set shell = CreateObject("WScript.Shell")
command = Chr(34) & shell.ExpandEnvironmentStrings("%SystemRoot%\System32\cmd.exe") & Chr(34) & " /d /s /c " & Chr(34) & Chr(34) & fs.GetAbsolutePathName(launcher) & Chr(34) & Chr(34)
' Wait preserves Task Scheduler IgnoreNew and the child exit code.
' Window style 0 hides cmd and its inherited console children.
result = shell.Run(command, 0, True)
WScript.Quit result
