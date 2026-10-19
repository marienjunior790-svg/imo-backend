"""Emit src/modules/ai/ai.formation-corpus.v1.ts from corpus/v1/cards.json."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CARDS = Path(__file__).resolve().parent / "v1" / "cards.json"
OUT = ROOT / "src" / "modules" / "ai" / "ai.formation-corpus.v1.ts"


def main() -> None:
    body = json.dumps(json.loads(CARDS.read_text(encoding="utf-8")), ensure_ascii=False, indent=2)
    ts = (
        "/**\n"
        " * Corpus formation v1 — generated from knowledge-sources/corpus/v1/cards.json\n"
        " * (Gemini PHASE 1.2, schema 1.1). All verificationStatus = unverified.\n"
        " */\n"
        "import type { FormationCorpusFile } from './ai.formation-knowledge.types.js';\n\n"
        f"export const FORMATION_CORPUS_V1 = {body} as unknown as FormationCorpusFile;\n"
    )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(ts, encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
