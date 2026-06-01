from rest_framework import serializers
from api.models import Contracts


class ContractSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contracts
        fields = '__all__'
