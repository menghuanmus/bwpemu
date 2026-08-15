@echo off
chcp 65001 >nul
cd /d "d:\DIY\百闻牌\百闻牌模拟器\menghuanmus.github.io"
echo 正在发布正式版...
git add -A
git commit -m "正式版发布" >nul 2>&1
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
