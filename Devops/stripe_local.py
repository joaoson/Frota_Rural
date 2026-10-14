#!/usr/bin/env python3
"""Configure the local, test-mode Stripe listener without displaying credentials."""

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time


ROOT = Path(__file__).resolve().parent.parent
IMAGE_DIGEST = "sha256:11c46caeead82e329f14823dd622d494b4cc8c1b9766f724d122d2af42c97540"
IMAGE = f"stripe/stripe-cli@{IMAGE_DIGEST}"
FORWARD_URL = "http://127.0.0.1:8000/api/payments/webhook"
DEVICE = "frota-rural-local"
EVENTS = ",".join((
    "checkout.session.completed", "checkout.session.async_payment_succeeded",
    "checkout.session.expired", "checkout.session.async_payment_failed",
))
COMMAND = ["listen", "--events-from", "@self", "--skip-update",
           "--events", EVENTS, "--forward-to", FORWARD_URL]
LABEL = "app.frotarural.stripe-local-checkout"
SETTINGS_SCRIPT = """
import json, os
overridden = 'STRIPE_WEBHOOK_SECRET' in os.environ
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'djangoapi.settings')
from django.conf import settings
from django.db import connection
with connection.cursor() as cursor:
    cursor.execute('SELECT 1')
print(json.dumps({'key': settings.STRIPE_SECRET_KEY,
                  'secret': settings.STRIPE_WEBHOOK_SECRET,
                  'overridden': overridden}))
"""


class SetupError(Exception):
    """A credential-free message suitable for the terminal."""


def command(args, *, action, env=None, check=True, timeout=60):
    try:
        result = subprocess.run(args, cwd=ROOT, env=env, capture_output=True,
                                text=True, timeout=timeout, check=False)
    except (OSError, subprocess.SubprocessError):
        raise SetupError(f"{action} failed or timed out. Check Docker and retry.") from None
    if check and result.returncode:
        # Docker errors, logs and settings output can contain credentials.
        raise SetupError(f"{action} failed (exit {result.returncode}). Output withheld to protect credentials.")
    return result


def inspect_container(name):
    result = command(["docker", "container", "inspect", name],
                     action="Reading container configuration")
    try:
        return json.loads(result.stdout)[0]
    except (ValueError, IndexError, TypeError):
        raise SetupError("Docker returned an invalid container configuration.") from None


def read_settings(backend):
    result = command(["docker", "exec", backend, "python", "-c", SETTINGS_SCRIPT],
                     action="Reading backend settings/database; restore Supabase and verify_database before retrying")
    try:
        value = json.loads(result.stdout)
        if not isinstance(value, dict) or not isinstance(value.get("key"), str):
            raise ValueError
        return value
    except (ValueError, TypeError):
        raise SetupError("Backend settings could not be read privately.") from None


def validate_backend(info, root):
    expected_source = (root / "BackEnd").resolve()
    mounted = any(
        mount.get("Type") == "bind" and mount.get("Destination") == "/app"
        and Path(mount.get("Source", "")).resolve() == expected_source
        for mount in info.get("Mounts", [])
    )
    if not info.get("State", {}).get("Running") or not mounted:
        raise SetupError("Backend must be running with this checkout's BackEnd mounted at /app.")


def validate_listener(info, root, key):
    config, host = info.get("Config", {}), info.get("HostConfig", {})
    environment = dict(item.split("=", 1) for item in config.get("Env", []) if "=" in item)
    owner = (config.get("Labels") or {}).get(LABEL)
    image_matches = config.get("Image") == IMAGE or (
        config.get("Image") == "stripe/stripe-cli:latest" and info.get("Image") == IMAGE_DIGEST
    )
    if not (
        image_matches and config.get("Cmd") == COMMAND
        and host.get("NetworkMode", "").startswith("container:")
        and not host.get("Privileged") and not host.get("Devices")
        and not info.get("Mounts") and not host.get("PortBindings")
        and environment.get("STRIPE_DEVICE_NAME") == DEVICE
        and environment.get("STRIPE_CLI_TELEMETRY_OPTOUT") == "1"
        and environment.get("STRIPE_API_KEY") == key
        and owner in (None, str(root))
    ):
        raise SetupError("Listener name belongs to an unrecognized container. Choose another --listener name; nothing was removed.")


def check_env_file(path):
    if path.is_symlink() or (path.exists() and not path.is_file()):
        raise SetupError("BackEnd/.env must be a regular file, not a symlink.")
    ignored = command(["git", "check-ignore", "--quiet", "--", "BackEnd/.env"],
                      action="Checking credential file exclusion", check=False)
    if ignored.returncode != 0:
        raise SetupError("BackEnd/.env must be untracked and Git-ignored before continuing.")


def write_secret(path, secret):
    # Replace only this setting; preserve all other credential/configuration lines.
    original = path.read_text() if path.exists() else ""
    lines = original.splitlines(keepends=True)
    setting = re.compile(r"^\s*(?:export\s+)?STRIPE_WEBHOOK_SECRET\s*=")
    replacement = f"STRIPE_WEBHOOK_SECRET={secret}\n"
    updated, replaced = [], False
    for line in lines:
        if setting.match(line):
            if not replaced:
                updated.append(replacement)
                replaced = True
        else:
            updated.append(line)
    if not replaced:
        if updated and not updated[-1].endswith(("\n", "\r")):
            updated.append("\n")
        updated.append(replacement)
    # The temporary pattern is excluded by Git and Docker even after a crash.
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, prefix=".env.stripe-", delete=False) as stream:
            temporary = Path(stream.name)
            os.fchmod(stream.fileno(), 0o600)
            stream.write("".join(updated))
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def wait_secret(listener, *, since=None):
    for _ in range(20):
        args = ["docker", "logs"]
        if since:
            args += ["--since", since]
        result = command(args + [listener], action="Reading listener readiness", check=False)
        found = re.findall(r"\bwhsec_[A-Za-z0-9]+\b", result.stdout + result.stderr)
        if result.returncode == 0 and found:
            return found[-1]
        if not inspect_container(listener).get("State", {}).get("Running"):
            raise SetupError("Stripe listener stopped. Check test-key access and network connectivity, then rerun.")
        time.sleep(1)
    raise SetupError("Stripe listener did not become ready. Check test-key access and network connectivity, then rerun.")


def configure(backend, listener):
    if backend == listener:
        raise SetupError("Backend and listener names must differ.")
    path = ROOT / "BackEnd" / ".env"
    check_env_file(path)
    backend_info = inspect_container(backend)
    validate_backend(backend_info, ROOT)
    settings = read_settings(backend)
    key = settings["key"]
    if not re.fullmatch(r"sk_test_[A-Za-z0-9]+", key):
        raise SetupError("The running backend must use a Stripe sk_test_ secret key. Live keys are refused.")
    if settings.get("overridden"):
        raise SetupError("STRIPE_WEBHOOK_SECRET is set in the container environment. Remove that override and recreate the backend so BackEnd/.env can supply it.")
    names = command(["docker", "container", "ls", "-a", "--format", "{{.Names}}"],
                    action="Listing local containers").stdout.splitlines()
    if listener in names:
        validate_listener(inspect_container(listener), ROOT, key)
    available = command(["docker", "image", "inspect", IMAGE], action="Checking pinned Stripe image", check=False)
    if available.returncode:
        command(["docker", "pull", IMAGE], action="Pulling pinned official Stripe image", timeout=180)
    if listener in names:
        command(["docker", "rm", "-f", listener], action="Replacing recognized Stripe listener")
    environment = os.environ.copy()
    environment.update(STRIPE_API_KEY=key, STRIPE_DEVICE_NAME=DEVICE, STRIPE_CLI_TELEMETRY_OPTOUT="1")
    command(["docker", "run", "-d", "--name", listener, "--restart", "unless-stopped",
             "--network", f"container:{backend_info['Id']}", "--label", f"{LABEL}={ROOT}",
             "-e", "STRIPE_API_KEY", "-e", "STRIPE_DEVICE_NAME", "-e", "STRIPE_CLI_TELEMETRY_OPTOUT",
             IMAGE, *COMMAND], action="Starting test-mode Stripe listener", env=environment)
    secret = wait_secret(listener)
    write_secret(path, secret)
    command(["docker", "restart", backend], action="Restarting backend to load signing secret")
    command(["docker", "restart", listener], action="Restarting listener after backend restart")
    started = inspect_container(listener)["State"]["StartedAt"]
    latest = wait_secret(listener, since=started)
    if latest != secret:
        # A restarted CLI can issue another secret. Always use its current value.
        write_secret(path, latest)
        command(["docker", "restart", backend], action="Loading updated listener signing secret")
        command(["docker", "restart", listener], action="Reconnecting listener to restarted backend")
        started = inspect_container(listener)["State"]["StartedAt"]
        if wait_secret(listener, since=started) != latest:
            raise SetupError("Listener signing secret changed repeatedly; rerun after confirming one listener/device is in use.")
    effective = read_settings(backend)
    if effective.get("secret") != latest or effective.get("key") != key:
        raise SetupError("Effective backend credentials do not match the current listener. Check environment overrides and rerun.")
    # A settings subprocess alone does not prove the web server finished starting.
    probe = """
import urllib.request
from urllib.error import HTTPError
try:
    urllib.request.urlopen('http://127.0.0.1:8000/api/payments/webhook', timeout=5).close()
except HTTPError as error:
    if error.code != 405:
        raise
else:
    raise RuntimeError('Expected the POST-only webhook endpoint')
"""
    for _ in range(20):
        ready = command(["docker", "exec", backend, "python", "-c", probe],
                        action="Checking backend HTTP readiness", check=False, timeout=10)
        if ready.returncode == 0:
            print(f"Stripe test listener ready: {listener}. Backend: {backend}. Signing secret verified; no payment submitted.")
            return
        time.sleep(1)
    raise SetupError("Signing secret matches, but the backend HTTP server is not ready. Restore the database/check startup, then rerun.")


def main():
    project = re.sub(r"[^a-z0-9_-]", "", ROOT.name.lower()).lstrip("-_")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", default=f"{project}-backend-1", help="Running backend container from this checkout")
    parser.add_argument("--listener", default=f"{project}-stripe-listener", help="Listener container to create or safely replace")
    args = parser.parse_args()
    if any(not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", value) for value in (args.backend, args.listener)):
        parser.error("Use valid Docker container names.")
    try:
        configure(args.backend, args.listener)
    except SetupError as error:
        print(f"Stripe setup: {error}", file=sys.stderr)
        return 1
    except (OSError, ValueError, KeyError, TypeError):
        print("Stripe setup could not finish. Check file permissions and Docker configuration, then rerun. Details withheld to protect credentials.", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Stripe setup interrupted. Rerun to finish configuring the listener.", file=sys.stderr)
        return 130
    return 0


if __name__ == "__main__":
    sys.exit(main())
