"""Create local-only monitoring credentials without printing or replacing them."""
from pathlib import Path
import secrets

root = Path(__file__).resolve().parents[2] / ".observability"
root.mkdir(mode=0o700, exist_ok=True)
root.chmod(0o700)
for name in ("metrics-token", "grafana-password"):
    path = root / name
    if not path.exists():
        # The parent is private; files must be readable by non-root container UIDs.
        with path.open("x") as stream:
            stream.write(secrets.token_urlsafe(32) + "\n")
        path.chmod(0o644)
print("Local monitoring credentials ready in .observability/ (ignored by Git).")
