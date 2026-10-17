@echo off
chcp 932 > nul
echo 4Lane Block ‚ð‹N“®‚µ‚Ä‚¢‚Ü‚·...
start http://localhost:8000
python -m http.server 8000
