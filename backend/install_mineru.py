"""
Cross-platform MinerU installer.
"""

from __future__ import annotations

import ensurepip
import platform
import subprocess
import sys


def _run_pip(arguments: list[str]) -> None:
    subprocess.run(
        [sys.executable, "-m", "pip", *arguments],
        check=True,
    )


def _repair_pip() -> None:
    ensurepip.bootstrap(upgrade=True, default_pip=True)
    _run_pip(["--version"])


def main() -> None:
    system = platform.system()
    machine = platform.machine().lower()

    if system == "Darwin" and machine in {"arm64", "aarch64"}:
        package = "mineru[all]"
    elif system in {"Windows", "Linux"}:
        package = "mineru[all]"
    else:
        package = "mineru[cpu]"

    try:
        _run_pip(["--version"])
    except subprocess.CalledProcessError:
        _repair_pip()

    install_args = [
        "install",
        "--upgrade",
        "--no-cache-dir",
        package,
    ]

    try:
        _run_pip(install_args)
    except subprocess.CalledProcessError:
        # Some partially broken environments fail the first pip invocation.
        # Re-bootstrap pip once and retry before surfacing the error.
        _repair_pip()
        _run_pip(install_args)

    print(f"[MinerU] Installed {package} for {system} ({machine})")


if __name__ == "__main__":
    main()
