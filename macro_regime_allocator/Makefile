SHELL := /bin/bash
.PHONY: run predict fast validate validate-fast install clean

# Full run: download data + backtest + evaluate + plots + live prediction
run:
	source ../.env.local && export FRED_API_KEY && uv run python main.py

# Quick predict: load saved model + cached data, show allocation only
predict:
	source ../.env.local && export FRED_API_KEY && uv run python main.py --predict

# Quick re-run using cached data (no download)
fast:
	source ../.env.local && export FRED_API_KEY && uv run python main.py --skip-download

# Full validation: download data + backtest + robustness suite
validate:
	source ../.env.local && export FRED_API_KEY && uv run python main.py --validate

# Quick validation using cached data
validate-fast:
	source ../.env.local && export FRED_API_KEY && uv run python main.py --skip-download --validate

# Install dependencies
install:
	uv sync

# Remove generated outputs
clean:
	rm -rf outputs/*.csv outputs/*.md outputs/*.joblib outputs/plots/*.png outputs/validation/
