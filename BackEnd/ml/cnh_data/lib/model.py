"""Modelo de plausibilidade dos dados da CNH e a decisão final (`assess`).

Treino (`train.py`) e inferência (`classify.py`) usam este mesmo código.

Pipeline:
1. `extract_features` transforma o registro em números (`features.py`).
2. Um `IsolationForest`, treinado **só com registros plausíveis**, dá a nota de anomalia
   ("o quanto este registro foge do que é normal"). Entra como feature extra e pega lixo
   que nenhum gerador de exemplos falsos previu.
3. Um `HistGradientBoostingClassifier` calibrado (isotônica) estima `P(dado falso)`.

O classificador só reconhece o tipo de lixo que viu no treino: restrições de monotonicidade
foram testadas e não melhoraram a generalização (e dobraram os falsos positivos). O que
cobre lixo inédito são as regras duras (`rules.py`) e a nota de anomalia. `assess()`, no fim deste arquivo, junta os dois.

Para explicar a recusa, `explain` neutraliza um grupo de features por vez (nome, datas,
local...) trocando-o pela mediana dos registros plausíveis e mede quanto a nota cai.
"""

from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import sklearn
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier, IsolationForest

from lib.features import FEATURE_GROUPS, FEATURE_NAMES, feature_vector
from lib.record import GROUP_LABELS
from lib.rules import evaluate_rules

SEED = 42
ISOLATION_SHARE = 0.4  # fatia dos positivos reservada ao IsolationForest (fora do classificador)
PLACE_GROUP = "birth_place"
# Se, ignorando o local de nascimento, o registro parece normal (nota abaixo disto), o local
# sozinho não basta para recusar. As listas do IBGE têm lacunas que não dá para fechar (bairros,
# localidades menores...) e recusar uma pessoa real por isso é pior do que deixar passar.
PLACE_ALONE_FLOOR = 0.20
EXPLAIN_MIN_DROP = 0.10
EXPLAIN_FALLBACK_DROP = 0.02
EXPLAIN_MAX_GROUPS = 3


def _impute(matrix: np.ndarray) -> np.ndarray:
    """O IsolationForest não aceita NaN: usa -1 (fora da faixa das features)."""
    return np.nan_to_num(matrix, nan=-1.0)


class PlausibilityModel:
    def __init__(
        self,
        classifier: Any,
        isolation: IsolationForest,
        baseline: np.ndarray,
        metadata: dict[str, Any],
    ) -> None:
        self.classifier = classifier
        self.isolation = isolation
        self.baseline = baseline
        self.metadata = metadata

    @classmethod
    def fit(
        cls, matrix: np.ndarray, labels: np.ndarray, *, seed: int = SEED
    ) -> "PlausibilityModel":
        """`labels`: 1 = dado falso, 0 = plausível. `matrix` tem as colunas de FEATURE_NAMES."""
        rng = np.random.default_rng(seed)
        positives = np.flatnonzero(labels == 0)
        rng.shuffle(positives)
        cut = int(len(positives) * ISOLATION_SHARE)
        isolation_rows, classifier_pos_rows = positives[:cut], positives[cut:]
        negative_rows = np.flatnonzero(labels == 1)

        isolation = IsolationForest(n_estimators=200, random_state=seed, n_jobs=1)
        isolation.fit(_impute(matrix[isolation_rows]))

        rows = np.concatenate([classifier_pos_rows, negative_rows])
        augmented = cls._with_anomaly(isolation, matrix[rows])
        base = HistGradientBoostingClassifier(
            max_iter=200,
            learning_rate=0.08,
            max_leaf_nodes=24,
            random_state=seed,
        )
        classifier = CalibratedClassifierCV(base, method="isotonic", cv=5)
        classifier.fit(augmented, labels[rows])

        baseline = np.nanmedian(matrix[positives], axis=0)
        metadata = {
            "sklearn": sklearn.__version__,
            "trained_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "samples": len(labels),
            "fake_share": float(labels.mean()),
        }
        return cls(classifier, isolation, baseline, metadata)

    @staticmethod
    def _with_anomaly(isolation: IsolationForest, matrix: np.ndarray) -> np.ndarray:
        anomaly = -isolation.score_samples(_impute(matrix))
        return np.column_stack([matrix, anomaly])

    def score_matrix(self, matrix: np.ndarray) -> np.ndarray:
        """`P(dado falso)` para cada linha."""
        augmented = self._with_anomaly(self.isolation, matrix)
        return np.asarray(self.classifier.predict_proba(augmented)[:, 1])

    def score_without_place(self, matrix: np.ndarray) -> np.ndarray:
        """Nota com as features do local de nascimento trocadas pela mediana dos plausíveis."""
        columns = [i for i, name in enumerate(FEATURE_NAMES) if FEATURE_GROUPS[name] == PLACE_GROUP]
        neutral = matrix.copy()
        neutral[:, columns] = self.baseline[columns]
        return self.score_matrix(neutral)

    def flags(self, matrix: np.ndarray, threshold: float) -> np.ndarray:
        """Linhas que o classificador considera suspeitas, já com a regra do local de nascimento.

        Nota >= limiar, mas só vale se houver outra evidência além do local de nascimento.
        """
        flagged = self.score_matrix(matrix) >= threshold
        return flagged & (self.score_without_place(matrix) >= PLACE_ALONE_FLOOR)

    def explain(self, record: dict[str, Any]) -> list[str]:
        """Grupos de campos que mais puxam a nota para "falso" (maiores primeiro)."""
        row = np.asarray([feature_vector(record)], dtype=float)
        full = float(self.score_matrix(row)[0])
        groups = sorted(set(FEATURE_GROUPS.values()))
        columns = {
            g: [i for i, n in enumerate(FEATURE_NAMES) if FEATURE_GROUPS[n] == g] for g in groups
        }

        drops: dict[str, float] = {}
        for group, indexes in columns.items():
            neutral = row.copy()
            neutral[0, indexes] = self.baseline[indexes]
            drops[group] = full - float(self.score_matrix(neutral)[0])

        ranked = sorted(drops, key=drops.__getitem__, reverse=True)
        chosen = [g for g in ranked if drops[g] >= EXPLAIN_MIN_DROP][:EXPLAIN_MAX_GROUPS]
        if not chosen and drops[ranked[0]] > EXPLAIN_FALLBACK_DROP:
            # Nota difusa, sem um grupo dominante: aponta ao menos o que mais pesa.
            chosen = ranked[:1]
        return chosen

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(
            {
                "classifier": self.classifier,
                "isolation": self.isolation,
                "baseline": self.baseline,
                "feature_names": FEATURE_NAMES,
                "metadata": self.metadata,
            },
            path,
            compress=3,
        )

    @classmethod
    def load(cls, path: Path) -> "PlausibilityModel":
        payload = joblib.load(path)
        if payload["feature_names"] != FEATURE_NAMES:
            raise ValueError(
                "As features do modelo salvo não batem com features.py: retreine com "
                "./ml/venv/bin/python ml/cnh_data/train.py"
            )
        return cls(
            payload["classifier"], payload["isolation"], payload["baseline"], payload["metadata"]
        )


# --- Decisão final: regras duras + classificador ---------------------------------------

THRESHOLD = 0.60  # política agressiva: recusa a partir de 60% de chance de ser falso


def assess(
    record: dict[str, Any],
    model: PlausibilityModel,
    threshold: float = THRESHOLD,
    today: date | None = None,
) -> dict[str, Any]:
    """Resultado no mesmo formato de `classify.py`.

    `score` é a probabilidade de dado falso do modelo, ou 1.0 se alguma regra dura
    disparou. `fields` são os grupos de campos que motivaram a suspeita.
    """
    hits = evaluate_rules(record, today)
    row = np.asarray([feature_vector(record)], dtype=float)
    model_score = float(model.score_matrix(row)[0])
    model_flags = bool(model.flags(row, threshold)[0])
    if model_score >= threshold and not model_flags:
        # Só o local de nascimento puxava a nota: ele sozinho não recusa (ver PLACE_ALONE_FLOOR).
        model_score = float(model.score_without_place(row)[0])
    suspicious = bool(hits) or model_flags

    groups: list[str] = []
    for hit in hits:
        if hit.group not in groups:
            groups.append(hit.group)
    if model_flags:
        groups += [group for group in model.explain(record) if group not in groups]

    score = 1.0 if hits else model_score

    return {
        "is_suspicious": suspicious,
        "score": round(score, 4),
        "reasons": [hit.message for hit in hits],
        "fields": [GROUP_LABELS[group] for group in groups] if suspicious else [],
    }
