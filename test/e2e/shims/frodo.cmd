@echo off
REM Dev-mode test launcher for Windows (cmd resolves bare `frodo` through
REM PATHEXT; an extensionless script is not executable there - same reason
REM npm ships frodo.cmd for global installs). Execs dist/launch.cjs.
node "%~dp0..\..\..\dist\launch.cjs" %*
