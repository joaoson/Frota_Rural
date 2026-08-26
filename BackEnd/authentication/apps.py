from django.apps import AppConfig


class AuthenticationConfig(AppConfig):
    name = 'authentication'

    def ready(self):
        # Registers the OpenAPI security scheme for AppJWTAuthentication.
        from authentication.extensions import openapi  # noqa: F401
