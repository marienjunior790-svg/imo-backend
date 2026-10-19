"""One-shot: normalize Gemini JSON → corpus/v1 (schema 1.1). No runtime dependency."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "incoming/2026-10-19-gemini-phase1-2/_extracted/knowledge_base.pretty.json"
OUT = Path(__file__).resolve().parent / "v1"


def norm_ts(t: str) -> str:
    p = t.split(":")
    if len(p) == 2:
        return f"{int(p[0]):02d}:{int(p[1]):02d}:00"
    return f"{int(p[0]):02d}:{int(p[1]):02d}:{int(p[2]):02d}"


def split_ts(ts: str | None) -> tuple[str | None, str | None]:
    if not ts or " - " not in ts:
        return None, None
    a, b = [x.strip() for x in ts.split(" - ", 1)]
    return norm_ts(a), norm_ts(b)


def main() -> None:
    data = json.loads(SRC.read_text(encoding="utf-8"))
    cards_out = []
    for c in data["knowledge_cards"]:
        start, end = split_ts(c.get("timestamp"))
        formulas = []
        for i, f in enumerate(c.get("formulas") or []):
            cid = c["id"].replace("KC-", "")
            formulas.append(
                {
                    "id": f"F-{cid}-{i + 1:03d}",
                    "name": c["title"] if len(c.get("formulas") or []) == 1 else f"Formule {i + 1}",
                    "expression": f,
                    "expressionLatex": None,
                    "variables": [],
                    "conditions": list(c.get("limitations") or [])[:2],
                }
            )
        examples = []
        for i, ex in enumerate(c.get("examples") or []):
            verifiable = False
            inputs = None
            expected = None
            if c["id"] == "KC-IMM-002" and "7,5" in ex.replace(".", ","):
                verifiable = True
                inputs = {
                    "loyerAnnuelHorsCharges": 7500,
                    "prixAcquisitionTotal": 100000,
                    "currency": "EUR",
                }
                expected = {"rendementBrutPct": 7.5}
            elif c["id"] == "KC-IMM-003" and "110 000" in ex:
                verifiable = True
                inputs = {
                    "valeurMarcheRenove": 150000,
                    "coutTravaux": 20000,
                    "margeSecurite": 20000,
                    "currency": "EUR",
                }
                expected = {"prixAchatMax": 110000}
            examples.append(
                {
                    "label": f"Exemple {i + 1}",
                    "text": ex,
                    "inputs": inputs,
                    "expectedOutput": expected,
                    "verifiable": verifiable,
                    "note": (
                        "Arithmétique interne cohérente ; attribution formation non transcript-vérifiée."
                        if verifiable
                        else "Source formation — non vérifié contre transcript (PHASE 1.2)."
                    ),
                }
            )
        cards_out.append(
            {
                "id": c["id"],
                "schemaVersion": "1.0.0",
                "title": c["title"],
                "category": c["category"],
                "keywords": c.get("keywords") or [],
                "content": c.get("content") or "",
                "method": {
                    "summary": (c.get("content") or "")[:180],
                    "steps": c.get("steps") or [],
                },
                "formulas": formulas,
                "examples": examples,
                "source": {
                    "type": "youtube",
                    "url": data["metadata"].get("source_url"),
                    "videoId": "BhuVohwG-3s",
                    "chapter": c["title"],
                    "timestampStart": start,
                    "timestampEnd": end,
                    "originDocuments": [
                        "incoming/2026-10-19-gemini-phase1-2/ITC_AI_KNOWLEDGE_BASE.json",
                        "incoming/2026-10-19-gemini-phase1-2/ITC_AI_MANUEL_IMMOBILIER.docx",
                    ],
                },
                "verificationStatus": "unverified",
                "warnings": [
                    "Statut index/JSON « Validé » non retenu (PHASE 1.2) — transcript non fourni.",
                    "Savoir de formation — ne remplace pas les données org ITC ni le droit local.",
                ],
                "limitations": c.get("limitations") or [],
                "relatedCardIds": [],
                "corpusRole": "candidate",
                "retired": False,
            }
        )

    manifest = {
        "corpusVersion": "1.0.0-gemini-phase1-2",
        "schemaVersion": "1.0.0",
        "generatedAt": "2026-10-19",
        "sourceVideoUrl": data["metadata"].get("source_url"),
        "sourceVideoDurationClaimed": "01:48:00",
        "auditRef": "AI_KB_PHASE1_2_GO_NO_GO.md",
        "note": (
            "Indexed for local lexical retrieval only. "
            "verificationStatus=unverified for all cards. NOT production_ready."
        ),
        "counts": {
            "total": len(cards_out),
            "unverified": len(cards_out),
            "verified": 0,
            "retired": 0,
        },
        "cardIds": [c["id"] for c in cards_out],
    }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "cards.json").write_text(
        json.dumps({"manifest": manifest, "cards": cards_out}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"wrote {len(cards_out)} cards to {OUT}")


if __name__ == "__main__":
    main()
