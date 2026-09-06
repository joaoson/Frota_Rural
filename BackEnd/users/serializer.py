from rest_framework import serializers
from users.models import Users

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = Users
        fields = '__all__'
        extra_kwargs = {
            'password': {'write_only': True}  # Hide password in GET responses
        }

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = Users(**validated_data)
        user.set_password(password)
        user.save()
        return user


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(min_length=8, write_only=True)

OPERATOR_FIELDS = [
    'id', 'name', 'document', 'email', 'phone', 'address',
    'city', 'state', 'cep', 'birth_date', 'status',
    'created_at', 'updated_at',
]


class OperatorSerializer(serializers.ModelSerializer):
    """Operador como o empregador que o cadastrou enxerga.

    Não expõe `role` nem `employer`: ambos são fixados pelo servidor e deixá-los
    no corpo abriria caminho para o cliente cadastrar um locador ou pendurar o
    operador na equipe de outra pessoa.
    """

    class Meta:
        model = Users
        fields = OPERATOR_FIELDS
        read_only_fields = ['id', 'status', 'created_at', 'updated_at']


class OperatorCreateSerializer(serializers.ModelSerializer):
    """Cadastro de operador feito de dentro do painel do empregador.

    A senha inicial é definida por quem cadastra e repassada ao operador — não
    há fluxo de convite por e-mail na plataforma ainda.
    """

    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = Users
        fields = [
            'name', 'document', 'email', 'phone', 'address',
            'city', 'state', 'cep', 'birth_date', 'password',
        ]

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = Users(role='operador', status='active', **validated_data)
        user.set_password(password)
        user.save()
        return user
