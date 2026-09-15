from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from django.test import SimpleTestCase
from rest_framework import exceptions
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import InvalidToken

from common.exception_handler import api_exception_handler
from common.exceptions import BadGateway, Conflict, ServiceUnavailable


def handle(exc: Exception) -> Response:
    response = api_exception_handler(exc, {})
    assert response is not None
    return response


class ValidationErrorBodyTests(SimpleTestCase):
    def test_field_and_non_field_errors(self):
        response = handle(
            exceptions.ValidationError(
                {"email": ["Este e-mail já está em uso."], "non_field_errors": ["Período em conflito."]}
            )
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data,
            {
                "code": "validation_error",
                "message": "Período em conflito.",
                "errors": {
                    "email": ["Este e-mail já está em uso."],
                    "non_field_errors": ["Período em conflito."],
                },
            },
        )

    def test_only_field_errors_use_generic_message(self):
        response = handle(exceptions.ValidationError({"cep": ["O CEP deve ter 8 dígitos."]}))

        self.assertEqual(response.data["message"], "Dados inválidos.")
        self.assertEqual(response.data["errors"], {"cep": ["O CEP deve ter 8 dígitos."]})

    def test_nested_errors_are_flattened_with_dotted_keys(self):
        response = handle(
            exceptions.ValidationError(
                {
                    "contrato": {"data_inicio": ["Obrigatório."]},
                    "photos": [{}, {"url": ["URL inválida."]}],
                }
            )
        )

        self.assertEqual(
            response.data["errors"],
            {"contrato.data_inicio": ["Obrigatório."], "photos.1.url": ["URL inválida."]},
        )

    def test_bare_string_becomes_list(self):
        # Regressão: `RentalSerializer.validate` devolvia
        # {"non_field_errors": "..."} com string, e o front esperava lista.
        response = handle(exceptions.ValidationError({"non_field_errors": "Período em conflito."}))

        self.assertEqual(response.data["errors"], {"non_field_errors": ["Período em conflito."]})

    def test_message_only_validation_error(self):
        response = handle(exceptions.ValidationError("Informe o motivo da reprovação."))

        self.assertEqual(response.data["message"], "Informe o motivo da reprovação.")
        self.assertEqual(
            response.data["errors"], {"non_field_errors": ["Informe o motivo da reprovação."]}
        )


class ApiExceptionBodyTests(SimpleTestCase):
    def test_custom_message_is_kept(self):
        response = handle(exceptions.NotFound("Locação não encontrada."))

        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.data,
            {"code": "not_found", "message": "Locação não encontrada.", "errors": {}},
        )

    def test_default_english_messages_are_translated(self):
        cases = [
            (Http404(), 404, "not_found", "Recurso não encontrado."),
            (DjangoPermissionDenied(), 403, "permission_denied", "Você não tem permissão para executar esta ação."),
            (exceptions.NotAuthenticated(), 401, "not_authenticated", "Autenticação necessária."),
            (exceptions.MethodNotAllowed("DELETE"), 405, "method_not_allowed", "Método \"DELETE\" não permitido."),
        ]
        for exc, status_code, code, message in cases:
            with self.subTest(exc=type(exc).__name__):
                response = handle(exc)
                self.assertEqual(response.status_code, status_code)
                self.assertEqual(response.data["code"], code)
                if code != "method_not_allowed":
                    self.assertEqual(response.data["message"], message)

    def test_custom_code(self):
        response = handle(Conflict("Esta parte já assinou o contrato.", code="already_signed"))

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "already_signed")
        self.assertEqual(response.data["message"], "Esta parte já assinou o contrato.")

    def test_project_exceptions_have_default_codes(self):
        for exc, status_code, code in [
            (Conflict(), 409, "conflict"),
            (BadGateway(), 502, "external_service_error"),
            (ServiceUnavailable(), 503, "service_unavailable"),
        ]:
            with self.subTest(code=code):
                response = handle(exc)
                self.assertEqual(response.status_code, status_code)
                self.assertEqual(response.data["code"], code)

    def test_simplejwt_dict_detail(self):
        response = handle(
            InvalidToken(
                {
                    "detail": "Given token not valid for any token type",
                    "code": "token_not_valid",
                    "messages": [],
                }
            )
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(
            response.data,
            {"code": "token_not_valid", "message": "Token inválido ou expirado.", "errors": {}},
        )

    def test_non_api_exception_is_left_to_django(self):
        self.assertIsNone(api_exception_handler(ValueError("boom"), {}))
