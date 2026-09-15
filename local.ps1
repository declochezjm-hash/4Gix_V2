# Preview locale 4GIx V02 dans le navigateur (sans Electron)
$Root = $PSScriptRoot
Set-Location $Root

if (-not (Test-Path "$Root\apps\frontend\node_modules")) {
  Write-Host "Installation des dependances frontend..." -ForegroundColor Yellow
  npm install --prefix "$Root\apps\frontend"
}

Write-Host ""
Write-Host "  4GIx V02 — mode local (navigateur)" -ForegroundColor Cyan
Write-Host "  UI  : http://127.0.0.1:5173" -ForegroundColor White
Write-Host "  API : http://127.0.0.1:8000/api/health" -ForegroundColor White
Write-Host "  Arret : Ctrl+C dans ce terminal" -ForegroundColor DarkGray
Write-Host ""

npm run local
