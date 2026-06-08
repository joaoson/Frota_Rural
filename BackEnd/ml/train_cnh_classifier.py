import os
import pathlib

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers

IMG_SIZE = (224, 224)
BATCH_SIZE = 16
EPOCHS = 30
PATIENCE = 5
SEED = 42

BASE_DIR = pathlib.Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
MODEL_DIR = BASE_DIR / "models"
MODEL_PATH = MODEL_DIR / "cnh_classifier.keras"


def main():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    cnh_count = len(list((DATA_DIR / "cnh").glob("*")))
    not_cnh_count = len(list((DATA_DIR / "not_cnh").glob("*")))
    print(f"[INFO] Dataset: {cnh_count} CNH / {not_cnh_count} não-CNH")

    if cnh_count == 0 or not_cnh_count == 0:
        print("[ERRO] Coloque imagens em ml/data/cnh/ e ml/data/not_cnh/ antes de treinar.")
        return

    train_ds = keras.utils.image_dataset_from_directory(
        DATA_DIR,
        validation_split=0.2,
        subset="training",
        seed=SEED,
        image_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
        label_mode="binary",
    )

    val_ds = keras.utils.image_dataset_from_directory(
        DATA_DIR,
        validation_split=0.2,
        subset="validation",
        seed=SEED,
        image_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
        label_mode="binary",
    )

    class_names = train_ds.class_names
    print(f"[INFO] Classes: {class_names}")

    train_ds = train_ds.prefetch(tf.data.AUTOTUNE)
    val_ds = val_ds.prefetch(tf.data.AUTOTUNE)

    data_augmentation = keras.Sequential([
        layers.RandomFlip("horizontal"),
        layers.RandomRotation(0.15),
        layers.RandomZoom(0.15),
        layers.RandomBrightness(0.2),
        layers.RandomContrast(0.2),
    ])

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
            str(MODEL_PATH),
            monitor="val_accuracy",
            save_best_only=True,
        ),
    ]

    print(f"\n[INFO] Iniciando treino ({EPOCHS} epochs, patience={PATIENCE})...\n")

    history = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=EPOCHS,
        callbacks=callbacks,
    )

    val_loss, val_acc = model.evaluate(val_ds)
    print(f"\n[RESULTADO] Acurácia de validação: {val_acc:.2%}")
    print(f"[RESULTADO] Loss de validação: {val_loss:.4f}")
    print(f"[SALVO] Modelo salvo em: {MODEL_PATH}")

if __name__ == "__main__":
    main()
