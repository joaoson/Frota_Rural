from rest_framework import serializers


def query_uuid(request, name):
    value = request.query_params.get(name)
    if not value:
        return None
    try:
        return serializers.UUIDField().run_validation(value)
    except serializers.ValidationError as exc:
        raise serializers.ValidationError({name: exc.detail}) from exc


def query_date(request, name):
    value = request.query_params.get(name)
    if not value:
        return None
    try:
        return serializers.DateField().run_validation(value)
    except serializers.ValidationError as exc:
        raise serializers.ValidationError({name: exc.detail}) from exc
