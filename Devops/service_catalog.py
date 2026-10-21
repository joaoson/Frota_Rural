"""Generate the service catalog after exporting BackEnd/coverage-report/openapi.json."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options", "trace"}


def render(schema):
    lines = [
        "# Catálogo dos serviços backend", "",
        "Gerado do OpenAPI validado da branch atual. As rotas de compatibilidade com barra final são omitidas; continuam funcionando. Swagger: `/api/schema/swagger-ui`; JSON: `/api/schema?format=json`.",
        "", "| Serviço | Método e caminho | Descrição | Respostas |",
        "| --- | --- | --- | --- |",
    ]
    for path, methods in schema["paths"].items():
        for method, operation in methods.items():
            if method not in HTTP_METHODS:
                continue
            description = operation.get("description", "").replace("\n", " ").replace("|", "\\|")
            summary = operation.get("summary", "").replace("|", "\\|")
            tags = ", ".join(operation.get("tags", []))
            responses = ", ".join(operation["responses"])
            lines.append(f"| {tags} | **{method.upper()}** `{path}` — {summary} | {description} | {responses} |")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    schema = json.loads((ROOT / "BackEnd/coverage-report/openapi.json").read_text())
    target = ROOT / "Documentation/SERVICOS_BACKEND_CATALOGO.md"
    target.write_text(render(schema))
    print(f"Updated {target.relative_to(ROOT)}")
