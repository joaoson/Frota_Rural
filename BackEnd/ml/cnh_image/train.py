"""Treino do classificador de imagem de CNH (MobileNetV2, transfer learning).

Este é o script que GERA o modelo. Lê as imagens da pasta de dados compartilhada
(`ml/data/`) e salva o melhor modelo em `ml/cnh_image/models/cnh_classifier.keras`.

Quais arquivos entram:
- `data/cnh/*_in.jpg`: só as fotos. A pasta também tem `*_gt_ocr.txt` (texto) e
  `*_gt_segmentation.jpg` (máscaras de texto), que **não** são CNHs e ficam de fora.
- `data/not_cnh/*`: tudo que for imagem.

Treino e validação são separados **por documento**, não por foto: o dataset tem ~3 fotos de
cada documento, e se uma foto fosse para o treino e outra para a validação a acurácia seria
inflada. A regra (`lib/groundtruth.is_validation`) é a mesma da avaliação do OCR.

Uso: ./ml/venv/bin/python ml/cnh_image/train.py [--output CAMINHO]
"""

import argparse
import os
import pathlib

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

import tensorflow as tf
from lib.groundtruth import document_key, is_validation, read_gt
from tensorflow import keras
from tensorflow.keras import layers

IMG_SIZE = (224, 224)
BATCH_SIZE = 16
EPOCHS = 30
PATIENCE = 5
SEED = 42
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}

BASE_DIR = pathlib.Path(__file__).resolve().parent
DATA_DIR = BASE_DIR.parent / "data"
MODEL_DIR = BASE_DIR / "models"
MODEL_PATH = MODEL_DIR / "cnh_classifier.keras"
# cnh=0, not_cnh=1: a mesma ordem alfabética que o Keras usava com `image_dataset_from_directory`.
CNH_LABEL, NOT_CNH_LABEL = 0, 1


def list_files() -> list[tuple[pathlib.Path, int, bool]]:
    """`(arquivo, rótulo, é_validação)` para cada imagem usada no treino."""
    files = []
    for photo in sorted((DATA_DIR / "cnh").glob("*_in.jpg")):
        gt = photo.with_name(photo.name.replace("_in.jpg", "_gt_ocr.txt"))
        # Fotos do mesmo documento têm o mesmo texto no GT; sem GT, a foto é seu próprio grupo.
        key = document_key(read_gt(gt)) if gt.exists() else (photo.name,)
        files.append((photo, CNH_LABEL, is_validation(key)))
    for image in sorted((DATA_DIR / "not_cnh").iterdir()):
        if image.suffix.lower() in IMAGE_SUFFIXES:
            files.append((image, NOT_CNH_LABEL, is_validation((image.name,))))
    return files


def load_image(path: tf.Tensor, label: tf.Tensor) -> tuple[tf.Tensor, tf.Tensor]:
    data = tf.io.read_file(path)
    image = tf.io.decode_image(data, channels=3, expand_animations=False)
    image = tf.image.resize(image, IMG_SIZE)
    return tf.cast(image, tf.float32), tf.cast(label, tf.float32)


def make_dataset(files: list[tuple[pathlib.Path, int, bool]], *, shuffle: bool) -> tf.data.Dataset:
    paths = [str(path) for path, _, _ in files]
    labels = [label for _, label, _ in files]
    dataset = tf.data.Dataset.from_tensor_slices((paths, labels))
    if shuffle:
        dataset = dataset.shuffle(len(paths), seed=SEED)
    dataset = dataset.map(load_image, num_parallel_calls=tf.data.AUTOTUNE)
    return dataset.batch(BATCH_SIZE).prefetch(tf.data.AUTOTUNE)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "--output", type=pathlib.Path, default=MODEL_PATH, help="onde salvar o modelo"
    )
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)

    files = list_files()
    train_files = [f for f in files if not f[2]]
    val_files = [f for f in files if f[2]]
    for name, subset in (("treino", train_files), ("validação", val_files)):
        cnh = sum(1 for f in subset if f[1] == CNH_LABEL)
        print(f"[INFO] {name}: {cnh} CNH / {len(subset) - cnh} não-CNH")

    if not any(f[1] == CNH_LABEL for f in files) or not any(f[1] == NOT_CNH_LABEL for f in files):
        print("[ERRO] Coloque imagens em ml/data/cnh/ e ml/data/not_cnh/ antes de treinar.")
        return

    train_ds = make_dataset(train_files, shuffle=True)
    val_ds = make_dataset(val_files, shuffle=False)

    data_augmentation = keras.Sequential(
        [
            layers.RandomFlip("horizontal"),
            layers.RandomRotation(0.15),
            layers.RandomZoom(0.15),
            layers.RandomBrightness(0.2),
            layers.RandomContrast(0.2),
        ]
    )

    base_model = keras.applications.MobileNetV2(
        weights="imagenet",
        include_top=False,
        input_shape=(*IMG_SIZE, 3),
    )
    base_model.trainable = False

    inputs = keras.Input(shape=(*IMG_SIZE, 3))
    x = data_augmentation(inputs)
    x = keras.applications.mobilenet_v2.preprocess_input(x)
    x = base_model(x, training=False)
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.Dropout(0.3)(x)
    outputs = layers.Dense(1, activation="sigmoid")(x)

    model = keras.Model(inputs, outputs)

    model.compile(
        optimizer="adam",
        loss="binary_crossentropy",
        metrics=["accuracy"],
    )

    model.summary()

    # Training
    callbacks = [
        keras.callbacks.EarlyStopping(
            monitor="val_accuracy",
            patience=PATIENCE,
            restore_best_weights=True,
        ),
        keras.callbacks.ModelCheckpoint(
            str(args.output),
            monitor="val_accuracy",
            save_best_only=True,
        ),
    ]

    print(f"\n[INFO] Iniciando treino ({EPOCHS} epochs, patience={PATIENCE})...\n")

    model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=EPOCHS,
        callbacks=callbacks,
    )

    val_loss, val_acc = model.evaluate(val_ds)
    print(f"\n[RESULTADO] Acurácia de validação (por documento): {val_acc:.2%}")
    print(f"[RESULTADO] Loss de validação: {val_loss:.4f}")
    print(f"[SALVO] Modelo salvo em: {args.output}")


if __name__ == "__main__":
    main()
