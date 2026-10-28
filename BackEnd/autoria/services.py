from autoria.models import Genero


class CategoriaAutoriaService:
    @staticmethod
    def listar():
        return Genero.objects.order_by("Genero")
