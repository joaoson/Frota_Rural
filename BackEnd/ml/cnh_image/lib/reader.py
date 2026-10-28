"""Lê um documento (imagem ou PDF) e devolve o tipo de layout e os campos validados.

    arquivo ─► imagens ─► OCR ─► layout antigo?  (âncoras registram)  ─► parse_old
                                 layout numerado? (rótulos + título)   ─► parse_digital (+ MRZ)
                                 nenhum ─► `desconhecido`, sem campos

O tipo do documento vem das evidências do OCR, não de um terceiro classificador: se os rótulos
de um layout aparecem, é esse layout. Uma CNH física nova, que o OCR provavelmente não lê,
cai em `desconhecido` e só vale a nota da rede neural.
"""

from dataclasses import dataclass, field

from lib import ocr, source
from lib.parse_antiga import parse_old
from lib.parse_digital import MIN_LABELS, apply_mrz, labels_found, merge, parse_digital

OLD = "cnh_antiga"
DIGITAL = "cnh_digital"
UNKNOWN = "desconhecido"
# Sem a nota da CNN, o OCR só promove o documento se achar campos suficientes e válidos.
MIN_FIELDS_TO_PROMOTE = 4


@dataclass
class Reading:
    document_type: str = UNKNOWN
    fields: dict[str, str] = field(default_factory=dict)
    uncertain: list[str] = field(default_factory=list)  # campos lidos com pouca certeza

    @property
    def promotes(self) -> bool:
        """O OCR achou o layout e leu campos suficientes para dizer que é uma CNH."""
        return self.document_type != UNKNOWN and len(self.fields) >= MIN_FIELDS_TO_PROMOTE


def read_document(path: str) -> Reading:
    """Lê o documento. Não confere a coerência entre as datas (1ª habilitação ≤ emissão <
    validade): o dataset sintético tem datas aleatórias e, num cadastro real, quem recusa datas
    incoerentes é o modelo de plausibilidade do backend (`cnh_data`) ao salvar."""
    images = source.load_images(path)
    all_lines = [ocr.read_lines(image) for image in images]

    for image, lines in zip(images, all_lines, strict=True):
        old = parse_old(lines, image)
        if old is not None:
            return _finish(Reading(OLD, old.fields, old.uncertain))

    if any(labels_found(lines) >= MIN_LABELS for lines in all_lines):
        parts = [
            parse_digital(lines, image) for image, lines in zip(images, all_lines, strict=True)
        ]
        fields = merge(parts)
        apply_mrz(fields, [line.text for lines in all_lines for line in lines])
        return _finish(Reading(DIGITAL, fields))
    return Reading()


def _finish(reading: Reading) -> Reading:
    reading.uncertain = [key for key in reading.uncertain if key in reading.fields]
    if reading.fields.get("observations") and "EAR" in reading.fields["observations"].split():
        reading.fields["ear"] = "true"
    return reading
