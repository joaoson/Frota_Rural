from drf_spectacular.contrib.rest_framework_simplejwt import SimpleJWTScheme


class AppJWTScheme(SimpleJWTScheme):
    """
    Registers `AppJWTAuthentication` as a security scheme in the OpenAPI schema.

    drf-spectacular ships a scheme for `JWTAuthentication`, but it does not match
    subclasses. Without this extension every operation is generated with a
    dangling security requirement and the "Authorize" button in Swagger UI has
    no way to send a Bearer token.
    """

    target_class = 'authentication.extensions.authentication.AppJWTAuthentication'
    name = 'jwtAuth'
