#!/usr/bin/env python3
"""Branch-aware startup: main uses Supabase; other branches use local PostgreSQL.

Requires Python 3.10+ and Compose 2.24.4+. Explicit modes remain available for CI.
"""

import argparse
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
BASE_PORTS = {"FRONTEND": 5173, "BACKEND": 8000, "DATABASE": 5432, "REDIS": 6379}
CONFIG_PREFIXES = (
    "COMPOSE_", "FROTA_", "DB_", "POSTGRES_", "DJANGO_", "STRIPE_", "RESEND_",
    "FIREBASE_", "PRICING_", "GROQ_", "GEMINI_", "ANTHROPIC_", "GOOGLE_",
    "FRONTEND_", "BACKEND_", "VITE_", "REDIS_", "CHAT_", "CONTRACT_", "SEED_",
    "AUTH_", "SESSION_", "CSRF_", "CORS_",
)
CONFIG_NAMES = {"DATABASE_URL", "RUN_MIGRATIONS", "CHANNEL_LAYER_BACKEND", "ML_PYTHON"}
ACTIONS = (
    "up", "down", "status", "logs", "config", "check-db", "plan-migrations",
    "migrate", "seed-preview", "seed", "test", "e2e", "install-frontend",
)
MODES = ("local", "supabase")


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("command", choices=(*ACTIONS, *MODES), help="Action; legacy 'local ACTION'/'supabase ACTION' also accepted")
    result.add_argument("legacy_action", nargs="?", choices=ACTIONS, help=argparse.SUPPRESS)
    result.add_argument("--mode", choices=("auto", *MODES), default="auto", help="Default: use the checked-out Git branch; main=Supabase, all others=local")
    result.add_argument("--env-file", type=Path, help="Explicit credentials/config file; never merged with other .env files")
    result.add_argument("--project", help="Override the isolated Compose project name")
    result.add_argument("--port-offset", type=int, help="Offset all host ports; default local=0, supabase=1")
    result.add_argument("--allow-remote", action="store_true", help="Explicitly allow Supabase migrate or seed writes")
    return result


def current_branch(root):
    # Resolve this checkout, even when invoked from a Git hook or another repo.
    git_env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    try:
        result = subprocess.run(["git", "-C", str(root), "symbolic-ref", "--quiet", "--short", "HEAD"],
                                env=git_env, capture_output=True, text=True)
    except FileNotFoundError as error:
        raise ValueError("Git is required for automatic mode. Install Git or select --mode local/supabase explicitly.") from error
    if result.returncode or not result.stdout.strip():
        raise ValueError("Cannot determine the checked-out branch (detached HEAD or outside Git). Select --mode local/supabase explicitly.")
    return result.stdout.strip()


def resolve_arguments(args, root=ROOT):
    """Select a mode once, before constructing any Docker or database command."""
    args.branch = None
    if args.command in MODES:
        if args.legacy_action is None:
            raise ValueError(f"An action is required after '{args.command}', for example '{args.command} up'.")
        if args.mode != "auto":
            raise ValueError("Use either --mode or a legacy mode prefix, not both.")
        args.mode, args.action = args.command, args.legacy_action
    else:
        if args.legacy_action is not None:
            raise ValueError("Only one action is allowed. Example: 'up' or 'up --mode local'.")
        args.action = args.command
        if args.mode == "auto":
            args.branch = current_branch(root)
            args.mode = "supabase" if args.branch == "main" else "local"
    return args


def configuration(args, root=ROOT, environ=None):
    """Return command/environment without reading or displaying credentials."""
    root = Path(root).resolve()
    offset = args.port_offset if args.port_offset is not None else (1 if args.mode == "supabase" else 0)
    if offset < 0 or max(BASE_PORTS.values()) + offset > 65535:
        raise ValueError("Port offset must be between 0 and 57535.")
    suffix = hashlib.sha256(str(root).encode()).hexdigest()[:8]
    project = args.project or f"frota-{args.mode}-{suffix}"
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,62}", project):
        raise ValueError("Project must use 1–63 lowercase letters, digits, hyphens or underscores.")
    selected = args.env_file
    if selected is None:
        selected = Path(".env.supabase" if args.mode == "supabase" else ".env.local")
        if args.mode == "local" and not (root / selected).exists():
            selected = Path(".env.local.example")
    selected = (root / selected).resolve()
    if not selected.is_file():
        raise ValueError(f"Selected environment file is missing: {selected.name}. See Devops/DEVELOPMENT.md.")

    # Shell values otherwise outrank --env-file. Keep Docker/OS runtime settings,
    # but make the explicitly selected configuration authoritative for the app.
    inherited = os.environ if environ is None else environ
    env = {key: value for key, value in inherited.items()
           if key not in CONFIG_NAMES and not key.startswith(CONFIG_PREFIXES)}
    env["FROTA_ENV_FILE"] = str(selected)
    env["FROTA_COOKIE_PREFIX"] = project
    for service, base in BASE_PORTS.items():
        env[f"FROTA_{service}_PORT"] = str(base + offset)

    command = ["docker", "compose", "--project-directory", str(root), "--env-file", str(selected),
               "--project-name", project, "-f", str(root / "compose.yaml")]
    if args.mode == "supabase":
        command += ["-f", str(root / "compose.supabase.yaml")]
    command += ["-f", str(root / "compose.development.yaml")]
    return command, env, project


def action_arguments(args):
    if args.mode == "supabase" and args.action in {"test", "e2e"}:
        raise ValueError("Automated tests require local mode. Supabase is not a test database.")
    if args.mode == "supabase" and args.action in {"migrate", "seed"} and not args.allow_remote:
        raise ValueError("Review check-db and plan-migrations/seed-preview, then explicitly add --allow-remote.")
    if args.action == "up":
        services = ["redis", "backend", "frontend"]
        return ["up", "--build", "-d", *(["db"] if args.mode == "local" else []), *services]
    simple = {"down": ["down"], "status": ["ps"], "logs": ["logs", "--follow", "--tail", "100"],
              "config": ["config", "--quiet"]}
    if args.action in simple:
        return simple[args.action]
    if args.action == "install-frontend":
        return ["run", "--rm", "--no-deps", "-T", "frontend", "npm", "ci"]
    commands = {
        "check-db": ["manage.py", "verify_database"],
        "plan-migrations": ["manage.py", "migrate", "--plan"],
        "migrate": ["manage.py", "migrate", "--noinput"],
        "seed-preview": ["seed.py", "--dry-run"],
        "seed": ["seed.py", *(["--allow-remote"] if args.mode == "supabase" else [])],
        "test": ["manage.py", "test", "--noinput"],
    }
    if args.action == "e2e":
        return None
    # A fresh one-off container uses the selected mode even if a running backend
    # has stale configuration. --no-deps never starts an unintended DB service.
    return ["run", "--rm", "--no-deps", "-T", "backend", "python", *commands[args.action]]


def main(argv=None):
    cli = parser()
    args = cli.parse_args(argv)
    try:
        args = resolve_arguments(args)
        action = action_arguments(args)
        command, env, project = configuration(args)
    except ValueError as error:
        cli.error(str(error))
    selection = f"Branch: {args.branch}" if args.branch else "Explicit mode"
    print(f"{selection} | Mode: {args.mode} | Project: {project}", flush=True)
    print(f"Frontend: http://localhost:{env['FROTA_FRONTEND_PORT']} | API: http://localhost:{env['FROTA_BACKEND_PORT']}/api", flush=True)
    try:
        # Render quietly: expanded Compose output can contain passwords and keys.
        validation = subprocess.run(command + ["config", "--quiet"], env=env, cwd=ROOT, capture_output=True)
        if validation.returncode:
            print("Compose configuration is invalid. Check the selected env file and Compose version (>=2.24.4). Expanded values were not printed.", file=sys.stderr)
            return validation.returncode
        if args.action == "config":
            print("Configuration valid. No services started and no database connection made.")
            return 0
        if args.action == "e2e":
            result = subprocess.run(command + ["ps", "--status", "running", "-q", "backend"],
                                    env=env, cwd=ROOT, capture_output=True, text=True, check=True)
            containers = result.stdout.split()
            if len(containers) != 1:
                print("Start this local environment with 'up --mode local' before running browser tests.", file=sys.stderr)
                return 1
            env.update(E2E_BACKEND_CONTAINER=containers[0],
                       E2E_BASE_URL=f"http://localhost:{env['FROTA_FRONTEND_PORT']}",
                       E2E_API_URL=f"http://localhost:{env['FROTA_BACKEND_PORT']}/api/")
            return subprocess.run(["npm", "run", "test:e2e"], cwd=ROOT / "FrontEnd", env=env).returncode
        return subprocess.run(command + action, env=env, cwd=ROOT).returncode
    except FileNotFoundError:
        print("Docker Compose (or npm for e2e) is not available. See Devops/DEVELOPMENT.md.", file=sys.stderr)
        return 1
    except subprocess.CalledProcessError:
        print("Could not inspect the local development container. Check Docker and run local status.", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
