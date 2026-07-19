#!/bin/zsh
# Đảm bảo dùng Node >= 23 của Homebrew (máy có sẵn node 16 cũ trong /usr/local/bin)
export PATH="/opt/homebrew/bin:$PATH"
exec npm run dev
