from __future__ import annotations

import csv
import io
import json
import random
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "demo_molecules.json"
VARIANTS = [
    {"id": "wild", "name": "Wild type", "mutation": "Reference target", "pdb": "1J3I"},
    {"id": "single", "name": "S108N", "mutation": "Single mutant", "pdb": "1J3I"},
    {"id": "double", "name": "C59R + S108N", "mutation": "Double mutant", "pdb": "1J3I"},
    {"id": "triple", "name": "N51I + C59R + S108N", "mutation": "Triple mutant", "pdb": "1J3K"},
    {"id": "quad", "name": "N51I + C59R + S108N + I164L", "mutation": "Quadruple mutant", "pdb": "1J3K"},
]
SEEDS = [
    ("Pyrimethamine", "Cc1nc(N)nc(N)c1-c1ccc(Cl)cc1"),
    ("Cycloguanil", "Clc1ccc(-c2nc(N)nc(N)n2)cc1"),
    ("WR99210", "CCN(CC)CCNC(=O)c1ccc(Nc2nc(N)c(N)nc2)cc1"),
    ("P218", "CC(C)NC(=O)c1ccc(Nc2nc(N)nc(N)n2)cc1"),
    ("Methotrexate", "CN(CC1=CNc2c1cc(Cl)c(Cl)c2)C(=O)NCC1=CC=C(C=C1)C(=O)O"),
    ("Trimethoprim", "COc1cc(Cc2cnc(N)nc2N)cc(OC)c1OC"),
    ("Proguanil", "CC(C)NC(=N)NC(=N)Nc1ccc(Cl)cc1"),
    ("Chlorcycloguanil", "Clc1ccc(-c2nc(N)nc(N)n2)cc1Cl"),
    ("Atovaquone", "CC1CCC(C(=O)c2ccc(O)c3ccccc23)CC1"),
    ("Quinidine", "COc1ccc2ncc(C3CC4CCN3CC4)cc2c1"),
    ("Chloroquine", "CCN(CC)CCCC(C)Nc1nc(-c2ccccc2)cc(Cl)n1"),
    ("Primaquine", "COc1ccc2nc(CCCNCC(C)C)cc(N)c2c1"),
    ("Amodiaquine", "CCN(CC)CCOc1cc(Nc2ccnc3cc(Cl)ccc23)ccc1O"),
    ("Pyrimethamine analog A", "Cc1nc(N)nc(N)c1-c1ccc(F)cc1"),
    ("Pyrimethamine analog B", "Cc1nc(N)nc(N)c1-c1ccc(Br)cc1"),
    ("Pyrimethamine analog C", "Cc1nc(N)nc(N)c1-c1ccc(C)cc1"),
    ("Pyrimethamine analog D", "Cc1nc(N)nc(N)c1-c1ccc(OC)cc1"),
    ("Pyrimethamine analog E", "Cc1nc(N)nc(N)c1-c1ccc(CF)cc1"),
    ("Diaminopyrimidine 1", "Nc1ncc(-c2ccc(F)cc2)c(N)n1"),
    ("Diaminopyrimidine 2", "Nc1ncc(-c2ccc(Cl)cc2)c(N)n1"),
    ("Diaminopyrimidine 3", "Nc1ncc(-c2ccc(C)cc2)c(N)n1"),
    ("Diaminopyrimidine 4", "Nc1ncc(-c2ccc(OC)cc2)c(N)n1"),
    ("Diaminopyrimidine 5", "Nc1ncc(-c2ccncc2)c(N)n1"),
    ("Triazine analog 1", "Nc1nc(N)nc(-c2ccccc2)n1"),
    ("Triazine analog 2", "Nc1nc(N)nc(-c2ccc(F)cc2)n1"),
    ("Triazine analog 3", "Nc1nc(N)nc(-c2ccc(Cl)cc2)n1"),
    ("Triazine analog 4", "Nc1nc(N)nc(-c2ccncc2)n1"),
    ("Triazine analog 5", "Nc1nc(N)nc(-c2ccc(OC)cc2)n1"),
    ("Pteridine analog 1", "Nc1ncc2ncnc(N)c2n1"),
    ("Pteridine analog 2", "Nc1nc(N)c2nc[nH]c2n1"),
    ("Aminopyrimidine 1", "Nc1ncc(C2CC2)c(N)n1"),
    ("Aminopyrimidine 2", "Nc1ncc(C2CCC2)c(N)n1"),
]


def _make_demo_data() -> list[dict[str, Any]]:
    """Build a reproducible set of seed drugs and valid RDKit-derived analogs."""
    rng = random.Random(108)
    candidates: list[tuple[str, str]] = []
    pains_catalog = None
    try:
        from rdkit import Chem
        from rdkit.Chem import Crippen, Descriptors, Lipinski

        known_smiles: set[str] = set()
        try:
            from rdkit.Chem import FilterCatalog
            params = FilterCatalog.FilterCatalogParams()
            params.AddCatalog(FilterCatalog.FilterCatalogParams.FilterCatalogs.PAINS_A)
            params.AddCatalog(FilterCatalog.FilterCatalogParams.FilterCatalogs.PAINS_B)
            params.AddCatalog(FilterCatalog.FilterCatalogParams.FilterCatalogs.PAINS_C)
            pains_catalog = FilterCatalog.FilterCatalog(params)
        except (ImportError, AttributeError):
            pass

        for seed_name, seed_smiles in SEEDS:
            molecule = Chem.MolFromSmiles(seed_smiles)
            if molecule is not None:
                canonical = Chem.MolToSmiles(molecule)
                if canonical not in known_smiles:
                    candidates.append((seed_name, canonical))
                    known_smiles.add(canonical)

        substituents = ["F", "Cl", "C", "OC", "C(=O)N", "C#N", "N", "O", "C(F)(F)F"]
        for seed_name, seed_smiles in SEEDS:
            molecule = Chem.MolFromSmiles(seed_smiles)
            if molecule is None:
                continue
            positions = [
                atom.GetIdx() for atom in molecule.GetAtoms()
                if atom.GetIsAromatic() and atom.GetSymbol() == "C" and atom.GetTotalNumHs() > 0
            ]
            for atom_index in positions:
                for substituent in substituents:
                    fragment = Chem.MolFromSmiles(substituent)
                    if fragment is None:
                        continue
                    combined = Chem.CombineMols(molecule, fragment)
                    editable = Chem.RWMol(combined)
                    editable.AddBond(atom_index, molecule.GetNumAtoms(), Chem.BondType.SINGLE)
                    analog = editable.GetMol()
                    try:
                        Chem.SanitizeMol(analog)
                    except ValueError:
                        continue
                    smiles = Chem.MolToSmiles(analog)
                    if smiles not in known_smiles:
                        known_smiles.add(smiles)
                        candidates.append((f"{seed_name} analog", smiles))
                    if len(candidates) >= 300:
                        break
                if len(candidates) >= 300:
                    break
            if len(candidates) >= 300:
                break
    except ImportError:
        candidates = [(name, smiles) for name, smiles in SEEDS]

    molecules = []
    for index in range(300):
        if index < len(candidates):
            name, smiles = candidates[index]
        else:
            name, smiles = SEEDS[index % len(SEEDS)]
        ref = index < 4
        if index < len(SEEDS):
            display_name = name
        else:
            display_name = f"{name} {index - len(SEEDS) + 1:03d}"
        base = [rng.uniform(-9.4, -7.0), rng.uniform(-9.0, -6.3),
                rng.uniform(-8.5, -5.7), rng.uniform(-8.2, -5.4),
                rng.uniform(-7.9, -4.5)]
        if ref and name == "Pyrimethamine":
            base = [-8.1, -7.0, -6.1, -5.5, -4.3]
        elif ref and name == "P218":
            base = [-9.2, -9.0, -8.7, -8.4, -8.1]
        elif ref and name == "WR99210":
            base = [-9.0, -8.7, -8.2, -7.8, -7.3]
        elif ref and name == "Cycloguanil":
            base = [-8.4, -7.5, -6.7, -6.0, -5.2]
        spread = max(base) - min(base)
        worst = max(base)
        score = max(0, min(100, round(100 - (worst + 10) * 14 - spread * 3)))
        smiles_weight = 280 + ((index * 37) % 260)
        properties = {
            "logP": round(1.2 + ((index * 13) % 48) / 10, 1),
            "hbd": index % 6,
            "hba": 2 + index % 9,
            "rotatable": index % 8,
            "tpsa": 35 + (index * 17) % 125,
        }
        pains_alert = False
        try:
            from rdkit import Chem
            from rdkit.Chem import Crippen, Descriptors, Lipinski, FilterCatalog
            rdkit_molecule = Chem.MolFromSmiles(smiles)
            if rdkit_molecule is not None:
                smiles_weight = round(Descriptors.MolWt(rdkit_molecule))
                properties = {
                    "logP": round(Crippen.MolLogP(rdkit_molecule), 1),
                    "hbd": Lipinski.NumHDonors(rdkit_molecule),
                    "hba": Lipinski.NumHAcceptors(rdkit_molecule),
                    "rotatable": Lipinski.NumRotatableBonds(rdkit_molecule),
                    "tpsa": round(Descriptors.TPSA(rdkit_molecule)),
                }
                if pains_catalog is not None:
                    pains_alert = pains_catalog.HasMatch(rdkit_molecule)
        except ImportError:
            pass
        molecules.append({
            "id": f"KF-{index + 1:04d}",
            "name": display_name,
            "smiles": smiles,
            "mw": smiles_weight,
            "source": "Reference control" if ref else "MutaScreen demo set",
            "reference": ref,
            "scores": {v["id"]: round(base[i], 2) for i, v in enumerate(VARIANTS)},
            "resistance_score": score,
            "spread": round(spread, 2),
            "properties": properties,
            "pains_alert": pains_alert,
        })
    return molecules


if DATA_PATH.exists():
    MOLECULES: list[dict[str, Any]] = json.loads(DATA_PATH.read_text(encoding="utf-8"))
else:
    MOLECULES = _make_demo_data()

app = FastAPI(title="MutaScreen: Beating Malaria Resistance", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class FilterRequest(BaseModel):
    max_mw: float = Field(default=500, ge=100, le=1000)
    max_logp: float = Field(default=5, ge=0, le=10)
    max_hbd: int = Field(default=5, ge=0, le=20)
    max_hba: int = Field(default=10, ge=0, le=30)


class ShortlistRequest(BaseModel):
    count: int = Field(default=10, ge=1, le=50)
    minimum_score: int = Field(default=45, ge=0, le=100)


class ScreenRequest(BaseModel):
    threshold: float = Field(default=-7, ge=-15, le=0)
    limit: int = Field(default=50, ge=1, le=300)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": "demo", "docking": "simulation"}


@app.get("/api/variants")
def variants() -> dict[str, Any]:
    return {"variants": VARIANTS, "mode": "demo"}


@app.get("/api/library")
def library(q: str = "", limit: int = 300) -> dict[str, Any]:
    rows = MOLECULES
    if q:
        query = q.casefold()
        rows = [m for m in rows if query in m["name"].casefold() or query in m["smiles"].casefold()]
    return {"molecules": rows[:max(1, min(limit, 1000))], "total": len(MOLECULES), "mode": "demo"}


@app.post("/api/descriptors")
def descriptors(payload: dict[str, str]) -> dict[str, Any]:
    smiles = payload.get("smiles", "").strip()
    if not smiles:
        raise HTTPException(422, detail="Enter a SMILES string to calculate descriptors.")
    try:
        from rdkit import Chem
        from rdkit.Chem import Descriptors, Lipinski, Crippen
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            raise ValueError("That SMILES could not be understood. Check the spelling and brackets.")
        return {"mw": round(Descriptors.MolWt(mol), 1), "logP": round(Crippen.MolLogP(mol), 2),
                "hbd": Lipinski.NumHDonors(mol), "hba": Lipinski.NumHAcceptors(mol),
                "rotatable": Lipinski.NumRotatableBonds(mol), "tpsa": round(Descriptors.TPSA(mol), 1),
                "mode": "live"}
    except ImportError:
        return {"mw": round(42 * len(smiles.split("[")) + 14, 1), "logP": 2.5, "hbd": 2,
                "hba": 4, "rotatable": 3, "tpsa": 75, "mode": "demo-fallback",
                "notice": "RDKit is not installed; showing approximate demo descriptors."}
    except ValueError as error:
        raise HTTPException(422, detail=str(error)) from error


@app.post("/api/filter")
def filter_molecules(settings: FilterRequest) -> dict[str, Any]:
    passed = []
    for molecule in MOLECULES:
        p = molecule["properties"]
        checks = {
            "molecular_weight": molecule["mw"] <= settings.max_mw,
            "logP": p["logP"] <= settings.max_logp,
            "donors": p["hbd"] <= settings.max_hbd,
            "acceptors": p["hba"] <= settings.max_hba,
            "pains": not molecule.get("pains_alert", False),
        }
        passed.append({**molecule, "checks": checks, "drug_like": all(checks.values())})
    return {"molecules": passed, "passed": sum(m["drug_like"] for m in passed), "total": len(passed)}


@app.post("/api/shortlist")
def shortlist(settings: ShortlistRequest) -> dict[str, Any]:
    rows = [m for m in MOLECULES if m["resistance_score"] >= settings.minimum_score]
    rows.sort(key=lambda m: (-m["resistance_score"], m["spread"]))
    return {"molecules": rows[:settings.count], "total": len(rows)}


@app.post("/api/screen")
def screen(settings: ScreenRequest) -> dict[str, Any]:
    rows = sorted(MOLECULES, key=lambda m: m["scores"]["wild"])
    return {
        "molecules": rows[:settings.limit],
        "threshold": settings.threshold,
        "passed": sum(m["scores"]["wild"] <= settings.threshold for m in MOLECULES),
        "total": len(MOLECULES),
        "mode": "demo",
    }


@app.get("/api/results")
def results() -> dict[str, Any]:
    return {
        "variants": [variant["id"] for variant in VARIANTS],
        "molecules": [
            {"id": m["id"], "name": m["name"], "scores": m["scores"],
             "resistance_score": m["resistance_score"], "spread": m["spread"]}
            for m in MOLECULES
        ],
        "mode": "demo",
    }


@app.post("/api/ml")
def ml_demo() -> dict[str, Any]:
    return {
        "mode": "demo",
        "trained": False,
        "message": "This endpoint provides example presentation metrics only; no activity model is trained.",
        "performance": {"agreement": 0.82, "label": "illustrative, not validated"},
        "features": [
            {"name": "Consistent mutant fit", "importance": 0.91},
            {"name": "Molecular size", "importance": 0.70},
            {"name": "Hydrogen-bond pattern", "importance": 0.62},
        ],
    }


@app.post("/api/upload")
async def upload_library(file: UploadFile = File(...)) -> dict[str, Any]:
    content = await file.read()
    try:
        if file.filename and file.filename.lower().endswith(".sdf"):
            try:
                from rdkit import Chem
            except ImportError as error:
                raise HTTPException(501, detail="SDF upload requires RDKit. Install the backend requirements and retry.") from error
            supplier = Chem.ForwardSDMolSupplier(io.BytesIO(content), sanitize=True, removeHs=True)
            rows = [
                {"name": molecule.GetProp("_Name") if molecule.HasProp("_Name") else f"Uploaded molecule {i + 1}",
                 "smiles": Chem.MolToSmiles(molecule), "source": file.filename}
                for i, molecule in enumerate(supplier) if molecule is not None
            ]
            if not rows:
                raise ValueError("No valid molecular structures were found in the SDF.")
        else:
            reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
            if not reader.fieldnames:
                raise ValueError("The CSV needs a header row including a SMILES column.")
            columns = {column.casefold(): column for column in reader.fieldnames}
            smiles_column = columns.get("smiles")
            name_column = columns.get("name")
            if not smiles_column:
                raise ValueError("The CSV needs a SMILES column.")
            rows = [{"name": r.get(name_column) if name_column and r.get(name_column) else f"Uploaded molecule {i + 1}",
                     "smiles": r.get(smiles_column, "").strip(),
                     "source": file.filename}
                    for i, r in enumerate(reader)]
        if not rows:
            raise ValueError("No molecule rows were found.")
        if any(not row["smiles"] for row in rows):
            raise ValueError("Each CSV row must include a SMILES column.")
        return {"molecules": rows, "total": len(rows)}
    except (UnicodeDecodeError, csv.Error, ValueError) as error:
        raise HTTPException(400, detail=str(error)) from error


@app.get("/api/export.csv")
def export_csv() -> StreamingResponse:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=["id", "name", "smiles", "resistance_score",
                                               "spread", *[v["id"] for v in VARIANTS]])
    writer.writeheader()
    for m in sorted(MOLECULES, key=lambda item: -item["resistance_score"])[:20]:
        writer.writerow({"id": m["id"], "name": m["name"], "smiles": m["smiles"],
                         "resistance_score": m["resistance_score"], "spread": m["spread"],
                         **m["scores"]})
    buffer.seek(0)
    return StreamingResponse(iter([buffer.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=mutascreen-shortlist.csv"})


@app.get("/api/targets/{pdb_id}")
def target(pdb_id: str) -> dict[str, Any]:
    if pdb_id.lower() not in {"1j3i", "1j3k", "4dpd"}:
        raise HTTPException(404, detail="Structure not available. Try 1J3I, 1J3K or 4DPD.")
    # Network structure fetching is optional; the UI includes a graceful visual fallback.
    return {"pdb_id": pdb_id.upper(), "available": False,
            "message": "Structure service is offline; showing the pocket schematic instead."}
