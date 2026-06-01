from rest_framework.decorators import api_view
from rest_framework.response import Response
from api.models import Contracts
from api.serializer import ContractSerializer


# Create your views here.
@api_view(['GET'])
def get_contracts(request):
    contracts = Contracts.objects.all()
    serializer = ContractSerializer(contracts, many=True)
    return Response(serializer.data)
