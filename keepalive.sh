#!/bin/bash
# Zuest Bot Keepalive — self-healing, runs forever
# 1. Ensures node_modules exist (reinstalls if missing)
# 2. Starts bot, restarts on crash
# 3. Surfaces logs to data/ directory

BOT_DIR="/home/z/my-project/zuest-bot"
LOG_DIR="$BOT_DIR/data"
LOG_OUT="$LOG_DIR/bot-out.log"
LOG_ERR="$LOG_DIR/bot-error.log"

cd "$BOT_DIR" || exit 1
mkdir -p "$LOG_DIR"

while true; do
  # Ensure .env exists
  if [ ! -f .env ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') [Keepalive] WARNING: .env missing, waiting for it..." >> "$LOG_OUT"
    sleep 30
    continue
  fi

  # Ensure node_modules exist
  if [ ! -d node_modules/discord.js ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') [Keepalive] node_modules missing, running npm install..." >> "$LOG_OUT"
    npm install --prefer-offline 2>&1 | tail -3 >> "$LOG_OUT"
    npm rebuild better-sqlite3 2>&1 >> "$LOG_OUT"
  fi

  echo "$(date '+%Y-%m-%d %H:%M:%S') [Keepalive] Starting bot..." >> "$LOG_OUT"
  node index.js >> "$LOG_OUT" 2>> "$LOG_ERR"
  EXIT_CODE=$?
  echo "$(date '+%Y-%m-%d %H:%M:%S') [Keepalive] Bot exited with code $EXIT_CODE, restarting in 5s..." >> "$LOG_OUT"
  sleep 5
done
