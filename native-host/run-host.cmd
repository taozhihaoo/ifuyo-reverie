@echo off
rem Native Messaging host launcher (Windows requires an .exe/.cmd entry point).
rem Node.js must be on PATH (M11 will replace this with a bundled launcher).
node "%~dp0..\src\capture\native-host.js" %*
