from rest_framework import serializers
from autoria.models import Genero


class CategoriaOutputSerializer(serializers.ModelSerializer):
    class Meta:
        model = Genero
        fields = ["id", "Genero"]
        read_only_fields = fields


class VinculoInputSerializer(serializers.Serializer):
    categoria_id = serializers.PrimaryKeyRelatedField(
        queryset=Genero.objects.all(), source="Genero",
    )

    def validate(self, attrs):
        extras = set(self.initial_data) - {"categoria_id"}
        if extras:
            raise serializers.ValidationError("Envie somente categoria_id.")
        return attrs


class VinculoOutputSerializer(serializers.Serializer):
    id = serializers.CharField()
    categoria_id = serializers.UUIDField(source="categoria_autoria_id", allow_null=True)
    categoria_nome = serializers.CharField(
        source="Genero.Genero", allow_null=True, default=None,
    )
