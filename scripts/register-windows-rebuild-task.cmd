@echo off
REM One-time: registers a daily Task Scheduler job that rebuilds the w0pium stack.
REM Edit ROOT if your repo is not on this UNC share. Run from an elevated CMD only if Docker requires it.

set "ROOT=\\medskin\docker\w0pium"

schtasks /Create /TN "W0PIUM Docker rebuild" /F ^
  /SC DAILY /ST 04:00 ^
  /TR "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%ROOT%\scripts\windows-docker-rebuild.ps1\" -RepoRoot \"%ROOT%\""

if errorlevel 1 (
  echo schtasks failed. Try Task Scheduler GUI: Action = powershell.exe, Arguments = -File ...\windows-docker-rebuild.ps1 -RepoRoot "...\w0pium"
  exit /b 1
)

echo Registered: "W0PIUM Docker rebuild" daily at 04:00. Change schedule in Task Scheduler ^(taskschd.msc^) if needed.
echo Run now: schtasks /Run /TN "W0PIUM Docker rebuild"
exit /b 0
