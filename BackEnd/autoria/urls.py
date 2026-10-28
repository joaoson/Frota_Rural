from django.urls import path
from autoria.views import CategoriaAutoriaListView

urlpatterns = [
    path("autoria/categorias", CategoriaAutoriaListView.as_view(), name="autoria_categorias"),
]
# Os guias dos modelos acrescentam imports e paths neste arquivo.
