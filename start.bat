@echo off
chcp 932 > nul
echo 4Lane Block を起動してぁE��ぁE..
start http://localhost:8000
python -m http.server 8000
