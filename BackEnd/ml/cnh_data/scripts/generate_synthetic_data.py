"""Gera o dataset sintético de registros de CNH e grava em `ml/data/synth/cnh_records.csv`.

O CSV tem uma linha por registro: os campos da CNH, `label` (1 = dado falso, 0 = plausível)
e `families` (famílias de lixo aplicadas, separadas por `;`). É determinístico para uma mesma
semente. O `train.py` lê este arquivo; se ele não existir, o `train.py` o gera sozinho.

Entradas: `ml/data/names`, `ml/data/cities` (bases do IBGE) e `ml/data/lexicon/lexicon.csv`
(listas de palavras escritas à mão).

Uso: ./ml/venv/bin/python ml/cnh_data/scripts/generate_synthetic_data.py [--positives N] [--negatives N]
"""

import argparse
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from lib import synthetic

POSITIVES, NEGATIVES, SEED = 24000, 20000, 42


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--positives", type=int, default=POSITIVES, help="registros plausíveis")
    parser.add_argument("--negatives", type=int, default=NEGATIVES, help="registros falsos")
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--output", type=pathlib.Path, default=synthetic.DEFAULT_CSV)
    args = parser.parse_args()

    samples = synthetic.generate(args.positives, args.negatives, seed=args.seed)
    synthetic.write_csv(samples, args.output)
    print(f"[INFO] Dataset sintético: {args.positives} plausíveis / {args.negatives} falsos")
    print(f"[SALVO] {args.output}")


if __name__ == "__main__":
    main()
