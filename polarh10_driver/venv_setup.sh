#!/usr/bin/env bash

set -e

VENV_DIR=".venv"
PYTHON_BIN="python3.12"

echo "----------------------------------------"
echo "Polar H10 Driver - Environment Setup"
echo "----------------------------------------"

# Check if python3.12 exists
if ! command -v $PYTHON_BIN &> /dev/null
then
    echo "ERROR: Python 3.12 is not installed."
    echo ""
    echo "Install it with:"
    echo "brew install python@3.12"
    exit 1
fi

echo "Using Python:"
$PYTHON_BIN --version

echo ""

# Create virtual environment
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment..."
    $PYTHON_BIN -m venv $VENV_DIR
else
    echo "Virtual environment already exists."
fi

echo ""

echo "Activating virtual environment..."
source $VENV_DIR/bin/activate

echo ""

echo "Upgrading pip..."
pip install --upgrade pip setuptools wheel

echo ""

echo "Installing dependencies..."
pip install -r requirements.txt

echo ""
echo "----------------------------------------"
echo "Environment ready."
echo ""
echo "Activate later with:"
echo ""
echo "source .venv/bin/activate"
echo "----------------------------------------"