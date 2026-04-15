@echo off
REM npm must run with a mapped drive: cmd.exe does not support UNC cwd.
REM pushd \\unc\share\path maps to Z: (or next free letter) and cds there.
pushd "%~dp0.."
call npm install
set ERR=%ERRORLEVEL%
popd
exit /b %ERR%
