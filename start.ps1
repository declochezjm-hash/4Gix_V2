# Démarrage 4GIx V02 (Windows)
$Root = $PSScriptRoot
Set-Location $Root

Write-Host "=== 4GIx V02 — preparation ===" -ForegroundColor Cyan

if (-not (Test-Path "$Root\apps\frontend\node_modules")) {
  Write-Host "Installation frontend..."
  npm install --prefix "$Root\apps\frontend"
}
if (-not (Test-Path "$Root\apps\desktop\node_modules")) {
  Write-Host "Installation Electron..."
  npm install --prefix "$Root\apps\desktop"
}

Write-Host "Build interface React..."
npm run build --prefix "$Root\apps\frontend"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$backendPid = (Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique | Select-Object -First 1)
if ($backendPid) {
  Write-Host "Redemarrage backend Python (port 8000)..."
  Stop-Process -Id $backendPid -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
}
Write-Host "Demarrage backend Python (port 8000)..."
Start-Process -FilePath "python" -ArgumentList "$Root\apps\backend\main.py" -WorkingDirectory "$Root\apps\backend" -WindowStyle Minimized
Start-Sleep -Seconds 2

Write-Host "Lancement Electron..." -ForegroundColor Green
Set-Location "$Root\apps\desktop"
npm start
