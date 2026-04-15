@echo off
REM Call node directly — do not use npm here: npm.cmd spawns cmd.exe, which
REM drops UNC cwd to C:\Windows and breaks package.json lookup.
node "%~dp0run-eslint.js"
exit /b %ERRORLEVEL%
