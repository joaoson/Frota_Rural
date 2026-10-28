from django.core.files.uploadedfile import UploadedFile
from rest_framework.exceptions import ValidationError

MAX_PHOTO_BYTES = 5 * 1024 * 1024
ALLOWED_PHOTO_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})


def validate_image_upload(image: UploadedFile | None, content_type: str) -> UploadedFile:
    """Contrato de upload compartilhado pelas fotos de anúncios e de perfil."""
    if image is None:
        media_type = (content_type or "").split(";")[0].strip()
        if media_type != "multipart/form-data":
            raise ValidationError(
                "A requisição precisa ser multipart/form-data; foi recebido "
                f"'{media_type or 'nenhum Content-Type'}'."
            )
        raise ValidationError("Nenhum arquivo enviado.")

    if image.content_type not in ALLOWED_PHOTO_TYPES:
        raise ValidationError(
            "Tipo de arquivo não suportado. Envie JPG, PNG ou WEBP "
            f"(recebido: '{image.content_type}')."
        )

    if (image.size or 0) > MAX_PHOTO_BYTES:
        megabytes = (image.size or 0) / (1024 * 1024)
        raise ValidationError(f"'{image.name}' tem {megabytes:.1f}MB e excede o máximo de 5MB.")

    return image
