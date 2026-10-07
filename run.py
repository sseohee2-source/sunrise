"""실행 진입점 (PyInstaller 빌드 대상)."""
import sys

from quote_app.main import main

if __name__ == "__main__":
    sys.exit(main())
