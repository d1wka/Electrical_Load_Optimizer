# Industrial Electrical Design Suite

A web app for preliminary design checks on low-voltage industrial power systems. You enter a plant's supply details and load list, and it runs NEC 2023, IEEE 519 and NEMA-style calculations: load schedule, power and power factor, short circuit, motor starting and protection coordination. Google Gemini can then review the whole design.

- **Backend:** FastAPI (Python) with all calculations in [backend/main.py](backend/main.py)
- **Frontend:** Next.js 14 + React 18 + Tailwind CSS, a single-page UI with tabs in [frontend/src/app/page.tsx](frontend/src/app/page.tsx)
---

## Features

| Tab | What it does |
|---|---|
| **System Setup** | Project name, voltage, phases, frequency, main transformer (kVA, %Z), utility fault capacity and energy tariff |
| **Load Schedule** | Add, edit and remove loads (motors, VFDs, HVAC, lighting, UPS, welding, receptacles, servers, heaters). Each load gets a full-load current, cable size with a voltage-drop check, breaker size, overload relay setting and equipment ground conductor |
| **Power Analysis** | Connected and demand kW/kVA/kVAR, system PF, transformer loading and recommended size, PF-correction capacitor bank (target 0.95), monthly kWh and cost, PF penalty estimate, energy breakdown by load type |
| **Short Circuit** | Symmetrical and asymmetrical fault current at the transformer secondary and at each panel bus, motor contribution, minimum AIC rating per NEC 110.9 |
| **Motor Starting** | For each motor, compares DOL, star-delta, soft starter and VFD (starting current, voltage dip, torque) and recommends a starting method |
| **Protection** | Panel feeder sizing (NEC 430.24), breaker selectivity check, main service breaker, estimated current THD compared with the IEEE 519-2022 limit, harmonic filter suggestions |
| **AI Review** | Gemini gives the design a grade and lists compliance issues, safety concerns, efficiency opportunities, design strengths and specific recommendations, with references to the standards |

A **sample plant** (a midsize manufacturing building with 10 loads) can be loaded in one click to try the app.

---

## Project structure

```
.
├── backend/
│   ├── main.py            # FastAPI app: NEC tables, calculations, endpoints
│   └── requirements.txt
└── frontend/
    ├── src/app/
    │   ├── page.tsx       # Full UI (tabs, forms, result panels)
    │   ├── layout.tsx
    │   └── globals.css
    ├── package.json
    ├── tailwind.config.ts
    └── tsconfig.json
```

---

## Getting started

### Prerequisites

- Python 3.10+
- Node.js 18+
- A Google Gemini API key ([Google AI Studio](https://aistudio.google.com/app/apikey))

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

export GEMINI_API_KEY="your-key-here"
uvicorn main:app --reload --port 8001
```

The API runs at `http://localhost:8001`, with interactive docs at `http://localhost:8001/docs`.

> The backend reads `GEMINI_API_KEY` at startup and won't start without it, even if you never use the AI Review tab.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The frontend expects the API at `http://localhost:8001` (the `API` constant at the top of [page.tsx](frontend/src/app/page.tsx)).

---

## API reference

Every `POST` endpoint takes the same body:

```json
{
  "config": {
    "name": "New Project",
    "voltage": 480,
    "phases": 3,
    "frequency": 60,
    "xfmr_kva": 500,
    "xfmr_z_pct": 5.75,
    "utility_fault_kva": 500000,
    "tariff_kwh": 0.12
  },
  "loads": [
    {
      "id": "1",
      "name": "Air Compressor",
      "load_type": "motor",
      "kw": 55.9,
      "pf": 0.87,
      "phases": 3,
      "voltage": 480,
      "qty": 1,
      "demand_factor": 0.85,
      "daily_hours": 12,
      "cable_length_ft": 250,
      "panel": "MDP-A",
      "hp": 75,
      "starting_method": "star_delta"
    }
  ]
}
```

- `load_type`: `motor | lighting | hvac | vfd | ups | welding | receptacle | server | heater | general`
- `starting_method`: `dol | star_delta | soft_starter | vfd` (motors only)

| Method | Endpoint | Returns |
|---|---|---|
| `POST` | `/api/loads` | Results for each load: FLA, cable, breaker, OL relay, ground conductor, demand, monthly kWh |
| `POST` | `/api/power` | System demand, PF, transformer sizing, capacitor bank, energy cost |
| `POST` | `/api/shortcircuit` | Transformer and per-bus fault currents, minimum AIC |
| `POST` | `/api/motors` | Comparison of starting methods and a recommendation for each motor |
| `POST` | `/api/protection` | Feeder and main breakers, selectivity, THD and IEEE 519 compliance |
| `POST` | `/api/ai-review` | Gemini design review (JSON) |
| `GET`  | `/api/sample` | Sample plant config and loads |

---

## Engineering basis

| Calculation | Reference / method |
|---|---|
| Conductor ampacity | NEC Table 310.15(B)(16), copper, 75 °C, in conduit |
| Continuous-load sizing | 125% of load (NEC 210.19(A) / 210.20) |
| Voltage drop | Smallest conductor with ≤ 3% drop, resistance only (Ω/1000 ft, steel conduit) |
| Motor FLA | NEC Table 430.250 at 480 V 3φ, linearly interpolated |
| Motor branch OCPD | 250% of FLA, inverse-time breaker (NEC 430.52) |
| Overload relay | 115% of FLA (NEC 430.32(A)) |
| Equipment ground | NEC Table 250.122 |
| Motor feeder | 125% of largest motor + sum of the others (NEC 430.24) |
| Transformer sizing | Demand kVA × 1.25, rounded up to the next standard kVA |
| Fault current | Infinite-bus transformer impedance + feeder resistance; asymmetric = 1.6 × symmetric; motor contribution = 4 × FLA |
| Motor starting dip | Starting current × (Z_xfmr + R_cable); limit 15% |
| Selectivity | Feeder breaker ≥ 1.6 × largest branch breaker |
| Harmonics | THD weighted by kW for each load type, compared with the 5% limit (IEEE 519-2022) |

---

## Assumptions & limitations

- Cables are copper only, and voltage drop uses resistance only (no reactance).
- Motor FLA always comes from the **480 V** table, even when a motor's voltage is set differently.
- The short-circuit model treats the utility as an infinite bus, so `utility_fault_kva` is not used in the calculation. The 1.6 asymmetry factor and 4× motor contribution are rules of thumb.
- The feeder length for each panel is taken as the longest branch cable on that panel.
- THD is estimated from typical values for each load type, not from a harmonic load-flow study.
- The AI Review uses `gemini-2.0-flash`, and its output can be wrong. Check every finding against the code text before acting on it.
- CORS is open to all origins (`*`), which is fine for local use. Restrict it before deploying.

---

## Tech stack

- **Backend:** FastAPI 0.115, Uvicorn, Pydantic 2, google-generativeai, python-dotenv
- **Frontend:** Next.js 14.2, React 18, TypeScript 5, Tailwind CSS 3
