"""Rebuild the migration ledger from tracked files and their first Git commit."""
import ast
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def render():
    files = git("ls-files", "BackEnd/*/migrations/[0-9]*.py").splitlines()
    lines = ["# Histórico verificável de migrações", "",
             "Gerado por `python3 Devops/migration_inventory.py`. Datas e autoria são do primeiro commit que adicionou o arquivo; não equivalem à data de aplicação em um banco nem comprovam uma sprint.", "",
             "O calendário oficial das sprints ainda precisa ser conciliado com os itens do ADO. Não foram criadas migrações apenas para pontuar.", "",
             "| Migração | Primeiro commit | Data | Autor | Operações |", "| --- | --- | --- | --- | --- |"]
    for filename in files:
        tree = ast.parse((ROOT / filename).read_text())
        operations = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "operations" for t in node.targets):
                operations = [call.func.attr for call in ast.walk(node.value) if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute) and isinstance(call.func.value, ast.Name) and call.func.value.id == "migrations"]
        history = git("log", "--diff-filter=A", "--format=%H|%as|%an", "--", filename).splitlines()
        commit, date, author = history[-1].split("|", 2) if history else ("", "não versionado", "")
        label = filename.removeprefix("BackEnd/").removesuffix(".py")
        lines.append(f"| [{label}](../{filename}) | [{commit[:8]}](https://github.com/joaoson/Frota_Rural/commit/{commit}) | {date} | {author} | {', '.join(dict.fromkeys(operations)) or 'sem operações'} |")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    target = ROOT / "Documentation/MIGRACOES_HISTORICO.md"
    target.write_text(render())
    print(f"Updated {target.relative_to(ROOT)}")
