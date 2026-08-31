import os
import threading
import uuid
from urllib.parse import quote

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

# Endpoint de download do Firebase. O acesso é regido pelas Storage Rules do
# projeto — com regra de leitura pública no prefixo, dispensa token na URL.
_DOWNLOAD_ENDPOINT = "https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media"

_EXTENSION_BY_CONTENT_TYPE = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}

_bucket = None
_bucket_lock = threading.Lock()


class FirebaseStorageNotConfigured(ImproperlyConfigured):
    """Credencial ou bucket do Firebase ausente nas configurações."""


def is_configured() -> bool:
    return bool(settings.FIREBASE_STORAGE_BUCKET and settings.FIREBASE_CREDENTIALS_FILE)


def _get_bucket():
    """Inicializa o app do Firebase uma única vez por processo."""
    global _bucket
    if _bucket is not None:
        return _bucket

    with _bucket_lock:
        if _bucket is not None:
            return _bucket

        if not is_configured():
            raise FirebaseStorageNotConfigured(
                "Configure FIREBASE_STORAGE_BUCKET e FIREBASE_CREDENTIALS_FILE no .env "
                "para habilitar o upload de imagens."
            )

        if not os.path.isfile(settings.FIREBASE_CREDENTIALS_FILE):
            raise FirebaseStorageNotConfigured(
                f"Credencial do Firebase não encontrada em "
                f"'{settings.FIREBASE_CREDENTIALS_FILE}'. Baixe o JSON da service "
                f"account no console do Firebase."
            )

        import firebase_admin
        from firebase_admin import credentials, storage

        if not firebase_admin._apps:
            firebase_admin.initialize_app(
                credentials.Certificate(settings.FIREBASE_CREDENTIALS_FILE),
                {"storageBucket": settings.FIREBASE_STORAGE_BUCKET},
            )
        _bucket = storage.bucket(settings.FIREBASE_STORAGE_BUCKET)

    return _bucket


def upload_image(image_file, folder: str) -> str:
    """Envia ``image_file`` ao Firebase e devolve o caminho do objeto no bucket.

    O nome é sempre um UUID novo, então o conteúdo é imutável e pode ser
    cacheado indefinidamente pelo navegador.
    """
    extension = _EXTENSION_BY_CONTENT_TYPE.get(image_file.content_type)
    if extension is None:
        extension = image_file.name.rsplit(".", 1)[-1].lower() if "." in image_file.name else "jpg"

    path = f"{folder.strip('/')}/{uuid.uuid4()}.{extension}"

    blob = _get_bucket().blob(path)
    blob.cache_control = "public, max-age=31536000, immutable"
    image_file.seek(0)
    blob.upload_from_file(image_file, content_type=image_file.content_type)

    return path


def delete_image(path: str) -> None:
    """Remove um objeto do bucket. Silencioso se o objeto já não existir."""
    if not path or _is_absolute_url(path):
        return
    from google.api_core import exceptions as google_exceptions

    try:
        _get_bucket().blob(path).delete()
    except google_exceptions.NotFound:
        pass


def _is_absolute_url(value: str) -> bool:
    return value.startswith("http://") or value.startswith("https://")


def public_url(path: str | None) -> str | None:
    """Monta a URL pública a partir do caminho salvo no banco.

    Registros antigos (seed, uploads locais) guardam a URL completa; nesse caso
    o valor é devolvido como está.
    """
    if not path:
        return None
    if _is_absolute_url(path):
        return path
    if not settings.FIREBASE_STORAGE_BUCKET:
        return None
    return _DOWNLOAD_ENDPOINT.format(
        bucket=settings.FIREBASE_STORAGE_BUCKET,
        path=quote(path, safe=""),
    )
