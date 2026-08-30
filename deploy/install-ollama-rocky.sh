#!/bin/bash
# Instala Ollama e baixa Qwen para texto do AG Assist (Rocky Linux / VPS).
set -euo pipefail

MODEL="${OLLAMA_MODEL:-qwen2.5:7b-instruct-q4_K_M}"

echo "==> Instalando Ollama..."
curl -fsSL https://ollama.com/install.sh | sh

echo "==> Baixando modelo ${MODEL} (pode demorar)..."
ollama pull "${MODEL}"

echo "==> Habilitando serviço Ollama..."
sudo systemctl enable ollama
sudo systemctl start ollama

echo "==> Teste rápido..."
curl -s http://127.0.0.1:11434/api/tags | head -c 200
echo ""
echo "Pronto. No .env do CampoAI:"
echo "  LLM_TEXT_PROVIDER=ollama"
echo "  OLLAMA_BASE_URL=http://127.0.0.1:11434"
echo "  OLLAMA_MODEL=${MODEL}"
