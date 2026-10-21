import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("dev", ROOT / "Devops/dev.py")
dev = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dev)


class DevelopmentFixture(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name).resolve()
        (self.root / ".env.local.example").write_text("POSTGRES_PASSWORD=local-demo\n")
        (self.root / ".env.supabase").write_text("DATABASE_URL=postgresql://test:dummy@db.example.supabase.co/postgres\n")

    def arguments(self, *args):
        return dev.resolve_arguments(dev.parser().parse_args(list(args)), self.root)


class DevelopmentCommandsTests(DevelopmentFixture):
    def test_local_needs_no_private_env_and_removes_shell_config(self):
        args = self.arguments("local", "config")
        cmd, env, project = dev.configuration(args, self.root, {
            "PATH": "/bin", "DOCKER_CONTEXT": "desktop-linux", "DATABASE_URL": "wrong-remote",
            "GROQ_API_KEY": "inherited-key", "COMPOSE_FILE": "other.yaml",
            "FROTA_ENV_FILE": "other.env", "RUN_MIGRATIONS": "true", "VITE_API_BASE_URL": "wrong-api",
        })
        self.assertEqual(env["PATH"], "/bin")
        self.assertEqual(env["DOCKER_CONTEXT"], "desktop-linux")
        for key in ("DATABASE_URL", "GROQ_API_KEY", "COMPOSE_FILE", "RUN_MIGRATIONS", "VITE_API_BASE_URL"):
            self.assertNotIn(key, env)
        self.assertEqual(Path(env["FROTA_ENV_FILE"]).name, ".env.local.example")
        self.assertEqual(env["FROTA_BACKEND_PORT"], "8000")
        self.assertNotIn(str(self.root / "compose.supabase.yaml"), cmd)
        self.assertTrue(project.startswith("frota-local-"))

    def test_modes_have_separate_projects_ports_and_cookie_names(self):
        _, local, local_project = dev.configuration(self.arguments("local", "up"), self.root, {})
        cmd, remote, remote_project = dev.configuration(self.arguments("supabase", "up"), self.root, {})
        self.assertNotEqual(local_project, remote_project)
        self.assertNotEqual(local["FROTA_COOKIE_PREFIX"], remote["FROTA_COOKIE_PREFIX"])
        for name in dev.BASE_PORTS:
            self.assertNotEqual(local[f"FROTA_{name}_PORT"], remote[f"FROTA_{name}_PORT"])
        self.assertIn(str(self.root / "compose.supabase.yaml"), cmd)

    def test_worktrees_have_different_default_projects_and_optional_port_offsets(self):
        _, _, first = dev.configuration(self.arguments("local", "up"), self.root, {})
        other = self.root / "worktree"
        other.mkdir()
        (other / ".env.local.example").write_text("")
        _, env, second = dev.configuration(self.arguments("local", "up", "--port-offset", "2"), other, {})
        self.assertNotEqual(first, second)
        self.assertEqual(env["FROTA_FRONTEND_PORT"], "5175")
        self.assertEqual(env["FROTA_BACKEND_PORT"], "8002")

    def test_custom_project_cookie_names_preserve_distinct_punctuation(self):
        _, first, _ = dev.configuration(self.arguments("local", "config", "--project", "farm-dev"), self.root, {})
        _, second, _ = dev.configuration(self.arguments("local", "config", "--project", "farm_dev"), self.root, {})
        self.assertNotEqual(first["FROTA_COOKIE_PREFIX"], second["FROTA_COOKIE_PREFIX"])

    def test_monitoring_is_explicit_local_and_shares_port_offset(self):
        args = self.arguments("local", "up", "--observability", "--port-offset", "2")
        command, env, _ = dev.configuration(args, self.root, {})
        self.assertIn(str(self.root / "compose.observability.yaml"), command)
        self.assertEqual(env["GRAFANA_PORT"], "3002")
        self.assertEqual(env["PROMETHEUS_PORT"], "9092")
        self.assertEqual(env["ALERTMANAGER_PORT"], "9095")
        for service in ("prometheus", "grafana", "alertmanager"):
            self.assertIn(service, dev.action_arguments(args))

    def test_monitoring_cannot_be_added_to_hosted_database_mode(self):
        with self.assertRaises(ValueError):
            dev.configuration(self.arguments("supabase", "up", "--observability"), self.root, {})

    def test_invalid_ports_project_and_missing_file_fail_before_execution(self):
        for options in [("--port-offset", "-1"), ("--port-offset", "60000"),
                        ("--project", "../wrong"), ("--env-file", "missing.env")]:
            with self.subTest(options=options), self.assertRaises(ValueError):
                dev.configuration(self.arguments("local", "up", *options), self.root, {})

    def test_remote_tests_are_rejected_and_remote_writes_require_explicit_opt_in(self):
        for action in ("test", "e2e", "migrate", "seed"):
            with self.subTest(action=action), self.assertRaises(ValueError):
                dev.action_arguments(self.arguments("supabase", action))
        for action in ("test", "e2e"):
            with self.subTest(action=action), self.assertRaises(ValueError):
                dev.action_arguments(self.arguments("supabase", action, "--allow-remote"))
        seed = dev.action_arguments(self.arguments("supabase", "seed", "--allow-remote"))
        self.assertIn("--allow-remote", seed)
        self.assertIn("--dry-run", dev.action_arguments(self.arguments("supabase", "seed-preview")))

    def test_down_keeps_volumes_and_commands_use_fresh_selected_configuration(self):
        self.assertEqual(dev.action_arguments(self.arguments("local", "down")), ["down"])
        for action in ("test", "check-db", "migrate", "plan-migrations", "seed"):
            with self.subTest(action=action):
                command = dev.action_arguments(self.arguments("local", action))
                self.assertEqual(command[:4], ["run", "--rm", "--no-deps", "-T"])
        remote_up = dev.action_arguments(self.arguments("supabase", "up"))
        self.assertNotIn("db", remote_up)
        for mode in ("local", "supabase"):
            with self.subTest(mode=mode):
                install = dev.action_arguments(self.arguments(mode, "install-frontend"))
                self.assertEqual(install[:4], ["run", "--rm", "--no-deps", "-T"])
                self.assertEqual(install[4:], ["frontend", "npm", "ci"])


@unittest.skipUnless(shutil.which("docker"), "Docker Compose is needed for configuration rendering")
class ComposeIsolationTests(DevelopmentFixture):
    def setUp(self):
        super().setUp()
        for name in ("compose.yaml", "compose.supabase.yaml", "compose.development.yaml"):
            shutil.copyfile(ROOT / name, self.root / name)
        (self.root / ".env").write_text("DATABASE_URL=postgresql://root:dummy@db.other.supabase.co/postgres\nGROQ_API_KEY=wrong-root-key\n")
        (self.root / "BackEnd").mkdir()
        (self.root / "BackEnd/.env").write_text("DATABASE_URL=postgresql://backend:dummy@db.other.supabase.co/postgres\n")

    def render(self, mode):
        command, env, _ = dev.configuration(self.arguments(mode, "config"), self.root)
        result = subprocess.run(command + ["config", "--format", "json"], env=env,
                                text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)["services"]

    def test_local_configuration_cannot_inherit_a_hosted_database(self):
        (self.root / ".env.local").write_text("DATABASE_URL=postgresql://selected:dummy@db.other.supabase.co/postgres\nDB_SCHEMA=frota_rural\nDB_SSLROOTCERT=/wrong.pem\n")
        services = self.render("local")
        backend = services["backend"]["environment"]
        self.assertEqual(backend["DATABASE_URL"], "")
        self.assertEqual(backend["DB_HOST"], "db")
        self.assertEqual(backend["DB_SCHEMA"], "")
        self.assertEqual(backend["DB_SSLMODE"], "disable")
        self.assertEqual(backend["DB_SSLROOTCERT"], "")
        self.assertEqual(backend["DJANGO_LOAD_ENV_FILES"], "false")
        self.assertNotIn("GROQ_API_KEY", backend)
        self.assertEqual(services["frontend"]["environment"]["VITE_API_BASE_URL"], "http://localhost:8000/api")
        for service in services.values():
            for port in service.get("ports", []):
                self.assertEqual(port["host_ip"], "127.0.0.1")

    def test_supabase_uses_explicit_url_and_certificate_with_manual_migrations(self):
        with (self.root / ".env.supabase").open("a") as file:
            file.write("DB_SSLROOTCERT=/app/certs/test-ca.pem\nRUN_MIGRATIONS=true\n")
        services = self.render("supabase")
        backend = services["backend"]["environment"]
        self.assertEqual(backend["DATABASE_URL"], "postgresql://test:dummy@db.example.supabase.co/postgres")
        self.assertEqual(backend["DB_SCHEMA"], "frota_rural")
        self.assertEqual(backend["DB_SSLMODE"], "require")
        self.assertEqual(backend["DB_SSLROOTCERT"], "/app/certs/test-ca.pem")
        self.assertEqual(backend["RUN_MIGRATIONS"], "false")
        self.assertEqual(backend["DJANGO_LOAD_ENV_FILES"], "false")
        self.assertNotIn("db", services["backend"]["depends_on"])
        self.assertNotIn("GROQ_API_KEY", backend)
        self.assertEqual(services["frontend"]["environment"]["VITE_API_BASE_URL"], "http://localhost:8001/api")


if __name__ == "__main__":
    unittest.main()
