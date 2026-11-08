@echo off
cd /d "C:\Users\iha32\Downloads\てってなちゃん---ゲーム配信ai相棒 (2)"
start "" cmd /k "npm run dev"
timeout /t 5 /nobreak >nul
start "" "http://localhost:3000"