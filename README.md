# MutaScreen: Beating Malaria Resistance

MutaScreen is a small, interactive computer-aided drug-discovery pipeline explorer. Its central idea is simple: compare candidate molecules ("keys") against five changing shapes of the malaria parasite's DHFR target ("locks"), then prioritize molecules whose predicted fit remains consistent.

> **Research demo only.** Bundled scores and chemical properties are illustrative. They are not experimental results, medical advice, or evidence that a candidate is safe or effective. Laboratory validation and clinical trials remain necessary.

## Requirements

- Node.js 18 or newer and npm
- Python 3.11 or newer (tested with Python 3.12)

AutoDock Vina is not required. Docking is always clearly marked as a demo simulation in this version. RDKit is optional at runtime: if installed, the descriptors endpoint calculates real RDKit descriptors; without it, the endpoint returns explicitly labeled approximate demo values.

## Start the whole app

From the project root:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm install
npm run dev
```

Open <http://127.0.0.1:5173>. The combined command starts the API on `http://127.0.0.1:8000` and the Vite development server. API documentation is at <http://127.0.0.1:8000/docs>.

On Windows PowerShell, use `npm.cmd` instead of `npm` if local execution policy blocks the npm PowerShell shim.

Alternatively, start each service in a separate terminal:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
npm run dev:web
```

On macOS/Linux, create/activate a virtual environment with `python3 -m venv .venv` and use `./.venv/bin/python -m pip install -r backend/requirements.txt`; the same `npm install` and `npm run dev` commands start both services.

## Tests and production build

```powershell
.\.venv\Scripts\python.exe -m pytest backend\test_scoring.py -q
npm run build
```

## What is included

- A 300-row reproducible demo molecule library with SMILES strings, five precomputed variant scores, and pinned pyrimethamine, cycloguanil, WR99210, and P218 controls.
- A FastAPI service with health, target-variant, library, descriptors, filtering, shortlist, CSV/SDF upload, and CSV export endpoints.
- A responsive React dashboard with a six-stage pipeline, animated lock/key hero, molecule search, simulated screening with selectable candidates that meet a configurable threshold across all five target shapes, resistance heatmap, adjustable drug-likeness filter, shortlist cards, CSV export, a reusable molecule detail drawer, onboarding tour, and theme switch.
- Simple scoring/filtering tests and a visible research-limit statement.

## Demo-data and science limitations

The bundled score matrix is deterministic demonstration data, not a docking run or a measurement. It contains seed structures and RDKit-valid single-substituent analogs; the analogs are generated for interface and screening demonstrations, not independently synthesized or experimentally verified compounds. Descriptor fields are calculated for bundled structures when RDKit is available during dataset generation. The demo's resistance score ranks worst-case score and spread for demonstration.

The target view uses a pocket schematic. PDB identifiers are presented as references, but this build does not download, cache, or render atomic structures. PDF/heatmap image export, live ChEMBL search, 3D conformer/pose rendering, and real Vina/GNINA docking are not implemented. CSV upload validates and previews accepted SMILES rows via the API, but does not replace the bundled screening dataset. These capabilities require reliable structure/model inputs and additional validation; no success is implied by the demo.

For live descriptor calculations install the backend requirements and submit a SMILES string to `POST /api/descriptors`. No API keys or network access are needed to run the core dashboard.
