@echo off
SET PATH=C:\Program Files\nodejs;C:\Users\chris\AppData\Roaming\npm;%PATH%
echo ==========================================
echo   Curio by Fable - Vercel Deploy
echo ==========================================
echo.

cd /d "C:\Users\chris\Documents\code\curio-by-fable"

echo Step 1: Login to Vercel (browser will open)...
vercel login

echo.
echo Step 2: Deploying to Vercel production...
vercel --prod --yes

echo.
echo ==========================================
echo   Done! Check URL above for your site.
echo ==========================================
pause
