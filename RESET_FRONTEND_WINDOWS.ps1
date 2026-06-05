$ErrorActionPreference = "Stop"

Write-Host "Menghapus dependency lama dan cache Vite..." -ForegroundColor Cyan
Remove-Item -Recurse -Force .\node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\dist -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\.vite -ErrorAction SilentlyContinue

Write-Host "Install dependency bersih berdasarkan package-lock.json..." -ForegroundColor Cyan
npm ci --no-audit --no-fund

Write-Host "Menjalankan Vite pada http://127.0.0.1:5173 ..." -ForegroundColor Green
npm run dev:clean
