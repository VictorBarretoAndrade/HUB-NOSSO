#!/usr/bin/env bash

set -e

POLAR_DRIVER_DIR="$HOME/Desktop/bianca/polarh10_driver"
HUB_DIR="$HOME/Desktop/bianca/hub-ue/apps/hub"
PROJECT_DIR="$HOME/Desktop/bianca/hub-ue"

POLAR_WS="ws://localhost:8765/stream"
POLAR_CONTROL_WS="ws://localhost:8765/control"
HUB_WS="ws://127.0.0.1:8787/ws"


echo "Starting Biofeedback Hub..."
gnome-terminal -- bash -c "
cd '$HUB_DIR'
source .venv/bin/activate
biofeedback-hub
exec bash
"

sleep 3

echo "Starting Polar H10 bridge..."
gnome-terminal -- bash -c "
cd '$HUB_DIR'
source .venv/bin/activate
biofeedback-polarh10 \
  --polar-ws '$POLAR_WS' \
  --polar-control-ws '$POLAR_CONTROL_WS' \
  --hub-ws '$HUB_WS'
exec bash
"

sleep 2

echo "Starting Dashboard..."
gnome-terminal -- bash -c "
cd '$PROJECT_DIR'
npm run dev:dashboard
exec bash
"

echo ""
echo "Full stack started."
echo "Dashboard: http://127.0.0.1:5173"