"""
Simple MinerU integration smoke test.

Run:
    python scripts/test-mineru.py path/to/file.pdf
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import requests


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python scripts/test-mineru.py <pdf_path>")
        raise SystemExit(1)

    pdf_path = Path(sys.argv[1])
    if not pdf_path.exists():
        print(f"PDF not found: {pdf_path}")
        raise SystemExit(1)

    health = requests.get("http://localhost:8000/health", timeout=10)
    health.raise_for_status()
    health_json = health.json()

    print("[Health]")
    print(json.dumps(health_json, indent=2))

    with pdf_path.open("rb") as handle:
        response = requests.post(
            "http://localhost:8000/api/v1/ocr/deep-extract",
            files={"file": (pdf_path.name, handle, "application/pdf")},
            timeout=1800,
        )

    response.raise_for_status()
    result = response.json()

    print("\n[Deep Extract]")
    print(f"Mode: {result['processing_mode']}")
    print(f"Pages: {result.get('total_pages')}")
    print(f"Tables: {result['layout_elements']['tables']}")
    print(f"Formulas: {result['layout_elements']['formulas']}")
    print(f"Time: {result['processing_time_ms']:.0f} ms")
    print("\n[Markdown Preview]")
    print(result["markdown"][:1000])


if __name__ == "__main__":
    main()
