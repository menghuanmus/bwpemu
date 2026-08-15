@echo off
chcp 65001 >nul
cd /d "d:\DIY\百闻牌\百闻牌模拟器\menghuanmus.github.io"
set /p MSG=版本说明：
if not "%MSG%"=="" goto commit
for /f "tokens=2 delims='" %%a in ('findstr "APP_VERSION" js\constants.js') do set VER=%%a
set MSG=%VER% 正式服更新
:commit
echo 正在发布正式版...
git add -A
git commit -m "%MSG%" >nul 2>&1
git push origin main
git push test main
echo.
echo ──────────────────────────────
echo 正式服已更新：
echo https://menghuanmus.github.io/bwpemu/
echo 测试站已同步。
echo ──────────────────────────────
echo.
pause
