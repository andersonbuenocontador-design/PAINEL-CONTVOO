@echo off
rem Dê dois cliques. Precisa estar na mesma pasta do painel-contabil.zip e de instalar.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1" -Zip "%~dp0painel-contabil.zip"
