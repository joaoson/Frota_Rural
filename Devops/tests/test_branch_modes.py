"""Exercise branch selection against disposable Git checkouts and Compose config."""

import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("branch_dev", ROOT / "Devops/dev.py")
dev = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dev)
DUMMY_DATABASE_URL = "postgresql://test:dummy@db.example.supabase.co/postgres"


@unittest.skipUnless(shutil.which("git"), "Git is needed to exercise branch selection")
class BranchModeTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name).resolve()
        self.git("init", "--initial-branch=develop")
        self.git("commit", "--allow-empty", "-m", "Disposable branch-selection fixture")
        for branch in ("acceptance", "main", "codex/example-feature"):
            self.git("branch", branch)
        (self.root / ".env.local.example").write_text("POSTGRES_PASSWORD=local-demo\n")
        (self.root / ".env.supabase").write_text(f"DATABASE_URL={DUMMY_DATABASE_URL}\n")

    def git(self, *arguments):
        # Never use the caller's repository overrides, hooks, signing or identity.
        env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
        result = subprocess.run([
            "git", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false",
            "-c", "user.name=Branch selection tests", "-c", "user.email=tests@example.test",
            "-C", str(self.root), *arguments,
        ], env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip()

    def arguments(self, *arguments, root=None):
        return dev.resolve_arguments(dev.parser().parse_args(list(arguments)), root or self.root)

    def test_checked_out_branch_selects_database_mode(self):
        for branch, mode in (
            ("develop", "local"), ("acceptance", "local"),
            ("main", "supabase"), ("codex/example-feature", "local"),
        ):
            with self.subTest(branch=branch):
                self.git("switch", branch)
                args = self.arguments("up")
                self.assertEqual(args.branch, branch)
                self.assertEqual(args.mode, mode)
                services = dev.action_arguments(args)
                self.assertEqual("db" in services, mode == "local")

    def test_auto_and_legacy_modes_preserve_projects_ports_and_selected_files(self):
        local_projects = set()
        for branch, mode, selected in (
            ("develop", "local", ".env.local.example"),
            ("acceptance", "local", ".env.local.example"),
            ("main", "supabase", ".env.supabase"),
        ):
            with self.subTest(branch=branch):
                self.git("switch", branch)
                auto = dev.configuration(self.arguments("config"), self.root, {})
                legacy = dev.configuration(self.arguments(mode, "config"), self.root, {})
                self.assertEqual(auto, legacy)
                self.assertEqual(Path(auto[1]["FROTA_ENV_FILE"]).name, selected)
                if mode == "local":
                    local_projects.add(auto[2])
        self.assertEqual(len(local_projects), 1)

    def test_main_tests_can_explicitly_use_local_database(self):
        self.git("switch", "main")
        for action in ("test", "e2e"):
            with self.subTest(action=action):
                args = self.arguments(action, "--mode", "local")
                self.assertEqual(args.mode, "local")
                self.assertIsNone(args.branch)
                dev.action_arguments(args)
                command, env, _ = dev.configuration(args, self.root, {})
                self.assertNotIn(str(self.root / "compose.supabase.yaml"), command)
                self.assertEqual(Path(env["FROTA_ENV_FILE"]).name, ".env.local.example")

    def test_detached_head_requires_explicit_mode(self):
        self.git("switch", "--detach", "HEAD")
        with self.assertRaisesRegex(ValueError, "detached HEAD.*--mode"):
            self.arguments("up")
        self.assertEqual(self.arguments("up", "--mode", "local").mode, "local")
        self.assertEqual(self.arguments("local", "up").mode, "local")

    def test_outside_git_requires_explicit_mode(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            with self.assertRaisesRegex(ValueError, "outside Git.*--mode"):
                self.arguments("up", root=root)
            self.assertEqual(self.arguments("up", "--mode", "local", root=root).mode, "local")
            self.assertEqual(self.arguments("local", "up", root=root).mode, "local")

    def test_git_environment_cannot_redirect_branch_detection(self):
        # An invalid override would make Git fail if the helper inherited it.
        with patch.dict(os.environ, {
            "GIT_DIR": str(self.root / "wrong-repository"),
            "GIT_WORK_TREE": str(self.root / "wrong-worktree"),
            "GIT_CONFIG_COUNT": "1",
            "GIT_CONFIG_KEY_0": "core.bare",
            "GIT_CONFIG_VALUE_0": "true",
        }):
            args = self.arguments("up")
        self.assertEqual(args.branch, "develop")
        self.assertEqual(args.mode, "local")

    def test_main_without_supabase_file_fails_instead_of_using_local(self):
        self.git("switch", "main")
        (self.root / ".env.supabase").unlink()
        args = self.arguments("up")
        self.assertEqual(args.mode, "supabase")
        with self.assertRaisesRegex(ValueError, r"missing: \.env\.supabase"):
            dev.configuration(args, self.root, {})
        dev.configuration(self.arguments("up", "--mode", "local"), self.root, {})

    def test_main_keeps_tests_local_and_requires_opt_in_for_remote_writes(self):
        self.git("switch", "main")
        for action in ("test", "e2e"):
            for options in ((), ("--allow-remote",)):
                with self.subTest(action=action, options=options):
                    with self.assertRaisesRegex(ValueError, "Automated tests require local"):
                        dev.action_arguments(self.arguments(action, *options))
        for action in ("migrate", "seed"):
            with self.subTest(action=action):
                with self.assertRaisesRegex(ValueError, "--allow-remote"):
                    dev.action_arguments(self.arguments(action))
                command = dev.action_arguments(self.arguments(action, "--allow-remote"))
                self.assertEqual(command[:4], ["run", "--rm", "--no-deps", "-T"])
                if action == "seed":
                    self.assertIn("--allow-remote", command)
        self.assertIn("--dry-run", dev.action_arguments(self.arguments("seed-preview")))
        self.assertIn("--plan", dev.action_arguments(self.arguments("plan-migrations")))

    def test_ambiguous_command_syntax_is_rejected(self):
        for command in (("local",), ("local", "up", "--mode", "local"), ("up", "down")):
            with self.subTest(command=command), self.assertRaises(ValueError):
                self.arguments(*command)

    @unittest.skipUnless(shutil.which("docker"), "Docker Compose is needed for configuration rendering")
    def test_branches_render_the_expected_database_without_connecting(self):
        for filename in ("compose.yaml", "compose.supabase.yaml", "compose.development.yaml"):
            shutil.copyfile(ROOT / filename, self.root / filename)
        for branch in ("develop", "acceptance", "codex/example-feature", "main"):
            with self.subTest(branch=branch):
                self.git("switch", branch)
                command, env, _ = dev.configuration(self.arguments("config"), self.root)
                result = subprocess.run(command + ["config", "--format", "json"],
                                        env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                services = json.loads(result.stdout)["services"]
                backend = services["backend"]["environment"]
                self.assertEqual(backend["DJANGO_LOAD_ENV_FILES"], "false")
                if branch == "main":
                    self.assertEqual(backend["DATABASE_URL"], DUMMY_DATABASE_URL)
                    self.assertEqual(backend["RUN_MIGRATIONS"], "false")
                    self.assertNotIn("db", services["backend"]["depends_on"])
                else:
                    self.assertEqual(backend["DATABASE_URL"], "")
                    self.assertEqual(backend["DB_HOST"], "db")
                    self.assertEqual(backend["DB_SSLMODE"], "disable")
                    self.assertIn("db", services["backend"]["depends_on"])


if __name__ == "__main__":
    unittest.main()
