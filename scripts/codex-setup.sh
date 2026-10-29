#!/usr/bin/env bash
# Codex 云端环境的初始化脚本（在 Codex 的环境设置里把 Setup script 设为：bash scripts/codex-setup.sh）。
# 只装依赖、预先打包浏览器脚本；测试用模拟数据，不需要任何密钥，也不需要访问天气接口。
set -euo pipefail
node -v
npm ci
npm run build:client
# 冒烟检查：类型检查 + 测试（约 20 秒）
npm run check
