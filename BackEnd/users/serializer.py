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