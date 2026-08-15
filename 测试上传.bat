@echo off
chcp 65001 >nul
cd /d "d:\DIY\百闻牌\百闻牌模拟器\menghuanmus.github.io"
echo 正在上传测试版...
git add -A
git commit -m "测试版更新" >nul 2>&1
git push test main
echo.
echo ──────────────────────────────
echo 测试站已更新（大约 1 分钟后生效）：
echo https://menghuanmus.github.io/bwpemu-test/
echo ──────────────────────────────
echo.
pause
