from django.apps import AppConfig


class CommonConfig(AppConfig):
    """Infraestrutura compartilhada: exceções, handler de erro e schemas da API."""

    name = "common"

    def ready(self) -> None:
        import django_stubs_ext
        from rest_framework import fields, serializers

        # Os stubs do DRF declaram os serializers como genéricos
        # (`ModelSerializer[Rentals]`), mas as classes reais não aceitam
        # subscrição. Sem isto a anotação existiria só para o mypy e o import
        # do módulo estouraria TypeError em runtime.
        django_stubs_ext.monkeypatch(
            extra_classes=[
                fields.Field,
                serializers.BaseSerializer,
                serializers.Serializer,
                serializers.ModelSerializer,
                serializers.ListSerializer,
            ]
        )
