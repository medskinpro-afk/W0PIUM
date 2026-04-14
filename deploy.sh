#!/bin/bash
# deploy.sh — синхронизирует файлы на Synology и перезапускает контейнер
# Использование: ./deploy.sh
# Настрой переменные под себя:

SYNOLOGY_IP="192.168.1.XXX"   # IP твоего NAS (найди в DSM → Control Panel → Network)
SYNOLOGY_USER="admin"          # пользователь SSH (обычно admin или твой логин DSM)
REMOTE_DIR="/volume1/docker/w0pium"  # папка на NAS

echo "→ Синхронизация файлов..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude 'data' \
  --exclude '.env' \
  --exclude 'dist' \
  ./ ${SYNOLOGY_USER}@${SYNOLOGY_IP}:${REMOTE_DIR}/

echo "→ Копируем .env (если не существует на NAS)..."
ssh ${SYNOLOGY_USER}@${SYNOLOGY_IP} \
  "[ -f ${REMOTE_DIR}/.env ] || echo 'WARN: создай .env на NAS вручную!'"

echo "→ Сборка и перезапуск контейнера..."
ssh ${SYNOLOGY_USER}@${SYNOLOGY_IP} \
  "cd ${REMOTE_DIR} && docker compose down && docker compose up -d --build"

echo "✓ Готово! Сайт на http://${SYNOLOGY_IP}:3000"
