@echo off
rem Render the planning Markdown as HTML. With no arguments: everything under planning\ into planning\html\.
if "%~1"=="" (
  node "%~dp0tools\md2html\md2html.mjs" "%~dp0README.md" "%~dp0pending.md" "%~dp0decisions-draft.md" "%~dp0roadmap.md" "%~dp0plans" "%~dp0audit" --root "%~dp0." --out "%~dp0html"
) else (
  node "%~dp0tools\md2html\md2html.mjs" %*
)
