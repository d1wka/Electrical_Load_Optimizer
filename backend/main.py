# Industrial Electrical Design Suite — Backend
# NEC 2023 / IEC 60364 calculations + Gemini AI review

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any, Literal
import google.generativeai as genai
import os, json, math

app = FastAPI(title="Industrial Electrical Design Suite API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
genai.configure(api_key=os.environ["GEMINI_API_KEY"])
gemini = genai.GenerativeModel("gemini-2.0-flash")

# ── NEC Reference Tables ──────────────────────────────────────────────────────

# Copper 75 °C in conduit — NEC Table 310.15(B)(16)
AMPACITY: Dict[str, float] = {
    "14AWG": 20, "12AWG": 25, "10AWG": 35, "8AWG": 50, "6AWG": 65,
    "4AWG": 85, "3AWG": 100, "2AWG": 115, "1AWG": 130, "1/0AWG": 150,
    "2/0AWG": 175, "3/0AWG": 200, "4/0AWG": 230, "250kcmil": 255,
    "300kcmil": 285, "350kcmil": 310, "400kcmil": 335, "500kcmil": 380,
    "600kcmil": 420, "750kcmil": 475,
}
# Resistance Ω/1000 ft, copper, steel conduit, 75 °C
RESISTANCE: Dict[str, float] = {
    "14AWG": 3.07, "12AWG": 1.93, "10AWG": 1.21, "8AWG": 0.764, "6AWG": 0.491,
    "4AWG": 0.308, "3AWG": 0.245, "2AWG": 0.194, "1AWG": 0.154, "1/0AWG": 0.122,
    "2/0AWG": 0.0967, "3/0AWG": 0.0766, "4/0AWG": 0.0608, "250kcmil": 0.0515,
    "300kcmil": 0.0429, "350kcmil": 0.0367, "400kcmil": 0.0321, "500kcmil": 0.0258,
    "600kcmil": 0.0214, "750kcmil": 0.0171,
}
SIZES = list(AMPACITY.keys())

NEC_BREAKERS = [
    15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90, 100, 110, 125, 150,
    175, 200, 225, 250, 300, 350, 400, 450, 500, 600, 800, 1000, 1200,
]
XFMR_KVA = [
    15, 25, 37.5, 50, 75, 100, 150, 167, 225, 300, 333, 500, 750,
    1000, 1500, 2000, 2500, 3000, 5000,
]
# NEC Table 430.250 — Full-load amps at 480 V, 3-phase
MOTOR_FLA_480: Dict[float, float] = {
    0.5: 1.0, 0.75: 1.4, 1: 1.8, 1.5: 2.6, 2: 3.4, 3: 4.8, 5: 7.6,
    7.5: 11, 10: 14, 15: 21, 20: 27, 25: 34, 30: 40, 40: 52, 50: 65,
    60: 77, 75: 96, 100: 124, 125: 156, 150: 180, 200: 240, 250: 302,
    300: 361, 350: 414, 400: 477, 450: 515, 500: 590,
}
# Typical harmonic content by load type (% THD_I)
HARMONIC_THD: Dict[str, float] = {
    "motor": 5, "lighting": 15, "hvac": 10, "vfd": 45, "ups": 25,
    "welding": 30, "receptacle": 20, "server": 35, "heater": 3, "general": 8,
}

# ── Helpers ──────────────────────────────────────────────────────────────────

def full_load_amps(kw: float, v: float, pf: float, phases: int) -> float:
    denom = (math.sqrt(3) * v * pf) if phases == 3 else (v * pf)
    return (kw * 1000) / denom

def motor_nec_fla(hp: float) -> float:
    hps = sorted(MOTOR_FLA_480)
    if hp <= hps[0]:
        return MOTOR_FLA_480[hps[0]]
    if hp >= hps[-1]:
        return MOTOR_FLA_480[hps[-1]] * (hp / hps[-1])
    for i in range(len(hps) - 1):
        if hps[i] <= hp <= hps[i + 1]:
            t = (hp - hps[i]) / (hps[i + 1] - hps[i])
            return MOTOR_FLA_480[hps[i]] + t * (MOTOR_FLA_480[hps[i + 1]] - MOTOR_FLA_480[hps[i]])
    return hp * 1.25

def size_cable(amps: float, length_ft: float, v: float, phases: int) -> dict:
    design = amps * 1.25  # NEC 210.19(A) continuous-load rule
    start = len(SIZES) - 1
    for i, s in enumerate(SIZES):
        if AMPACITY[s] >= design:
            start = i
            break
    for idx in range(start, len(SIZES)):
        s = SIZES[idx]
        k = math.sqrt(3) if phases == 3 else 2.0
        vd_v = k * amps * RESISTANCE[s] * length_ft / 1000.0
        vd_pct = vd_v / v * 100
        if vd_pct <= 3.0:
            return {
                "size": s, "ampacity": AMPACITY[s],
                "design_amps": round(design, 1),
                "vd_v": round(vd_v, 2), "vd_pct": round(vd_pct, 2), "vd_ok": True,
            }
    s = SIZES[-1]
    k = math.sqrt(3) if phases == 3 else 2.0
    vd_v = k * amps * RESISTANCE[s] * length_ft / 1000.0
    return {
        "size": s, "ampacity": AMPACITY[s],
        "design_amps": round(design, 1),
        "vd_v": round(vd_v, 2), "vd_pct": round(vd_v / v * 100, 2), "vd_ok": False,
    }

def next_breaker(a: float) -> int:
    for b in NEC_BREAKERS:
        if b >= a:
            return b
    return NEC_BREAKERS[-1]

def next_xfmr(kva: float) -> float:
    for s in XFMR_KVA:
        if s >= kva:
            return s
    return XFMR_KVA[-1]

# ── Pydantic Models ───────────────────────────────────────────────────────────

class SysConfig(BaseModel):
    name: str = "New Project"
    voltage: float = 480
    phases: int = 3
    frequency: int = 60
    xfmr_kva: float = 500
    xfmr_z_pct: float = 5.75
    utility_fault_kva: float = 500000
    tariff_kwh: float = 0.12

class LoadItem(BaseModel):
    id: str
    name: str
    load_type: str = "general"   # motor|lighting|hvac|vfd|ups|welding|receptacle|server|heater|general
    kw: float
    pf: float = 0.85
    phases: int = 3
    voltage: float = 480
    qty: int = 1
    demand_factor: float = 1.0
    daily_hours: float = 8.0
    cable_length_ft: float = 100
    panel: str = "MDP"
    hp: Optional[float] = None
    starting_method: Optional[str] = "dol"   # dol|star_delta|soft_starter|vfd

class SystemData(BaseModel):
    config: SysConfig
    loads: List[LoadItem]

# ── Endpoint 1: Analyze Loads ─────────────────────────────────────────────────

@app.post("/api/loads")
def analyze_loads(data: SystemData):
    results = []
    for ld in data.loads:
        total_kw = ld.kw * ld.qty
        # Use NEC motor FLA if it's a motor, otherwise calculate from kW/PF
        if ld.load_type == "motor" and ld.hp:
            base_amps = motor_nec_fla(ld.hp)
        else:
            base_amps = full_load_amps(ld.kw, ld.voltage, ld.pf, ld.phases)

        total_amps = base_amps * ld.qty
        cable = size_cable(base_amps, ld.cable_length_ft, ld.voltage, ld.phases)

        # Motor branch circuit protection — NEC 430.52 Table (250% for inverse-time CB)
        # General load — NEC 210.20: 125% of load
        if ld.load_type == "motor":
            max_ocpd = base_amps * 2.5  # 250% DOL motor protection
            breaker = next_breaker(max_ocpd)
        else:
            breaker = next_breaker(base_amps * 1.25)

        # Motor overload relay setting — NEC 430.32(A): 115% of nameplate
        ol_relay = round(base_amps * 1.15, 1) if ld.load_type == "motor" else None

        # Grounding conductor — NEC Table 250.122
        gc_map = {15: "14AWG", 20: "12AWG", 60: "10AWG", 100: "8AWG",
                  200: "6AWG", 300: "4AWG", 400: "3AWG", 500: "2AWG",
                  600: "1AWG", 800: "1/0AWG", 1000: "2/0AWG", 1200: "3/0AWG"}
        gc = next((v for k, v in sorted(gc_map.items()) if k >= breaker), "3/0AWG")

        demand_kw = total_kw * ld.demand_factor
        demand_kvar = demand_kw * math.tan(math.acos(ld.pf))
        monthly_kwh = total_kw * ld.daily_hours * 30

        results.append({
            "id": ld.id,
            "name": ld.name,
            "load_type": ld.load_type,
            "total_kw": round(total_kw, 2),
            "fla_per_unit": round(base_amps, 1),
            "total_amps": round(total_amps, 1),
            "demand_kw": round(demand_kw, 2),
            "demand_kvar": round(demand_kvar, 2),
            "cable": cable,
            "breaker_a": breaker,
            "ol_relay_a": ol_relay,
            "ground_conductor": gc,
            "monthly_kwh": round(monthly_kwh, 0),
            "status": "warn" if (not cable["vd_ok"] or cable["vd_pct"] > 2.5) else "ok",
        })
    return {"load_results": results}

# ── Endpoint 2: Power Analysis ────────────────────────────────────────────────

@app.post("/api/power")
def power_analysis(data: SystemData):
    cfg = data.config
    loads = data.loads

    connected_kw  = sum(l.kw * l.qty for l in loads)
    demand_kw     = sum(l.kw * l.qty * l.demand_factor for l in loads)
    demand_kvar   = sum(l.kw * l.qty * l.demand_factor * math.tan(math.acos(max(l.pf, 0.01))) for l in loads)
    demand_kva    = math.sqrt(demand_kw**2 + demand_kvar**2)
    system_pf     = demand_kw / demand_kva if demand_kva > 0 else 1.0

    # Transformer sizing: demand kVA × 1.25 growth factor (NEMA recommendation)
    req_kva        = demand_kva * 1.25
    rec_xfmr_kva   = next_xfmr(req_kva)
    xfmr_loading   = (demand_kva / cfg.xfmr_kva) * 100

    # Power factor correction to PF = 0.95
    target_pf = 0.95
    if system_pf < target_pf:
        q_target = demand_kw * math.tan(math.acos(target_pf))
        qc_needed = demand_kvar - q_target
        # Round up to nearest 5 kVAR increment
        qc_bank = math.ceil(qc_needed / 5) * 5
    else:
        qc_needed = 0
        qc_bank = 0

    # Monthly energy and cost
    monthly_kwh   = sum(l.kw * l.qty * l.demand_factor * l.daily_hours * 30 for l in loads)
    monthly_cost  = monthly_kwh * cfg.tariff_kwh

    # Energy by load type (for breakdown chart)
    type_energy: Dict[str, float] = {}
    for l in loads:
        kwh = l.kw * l.qty * l.demand_factor * l.daily_hours * 30
        type_energy[l.load_type] = round(type_energy.get(l.load_type, 0) + kwh, 0)

    # PF penalty estimate (most utilities penalise PF < 0.90)
    pf_penalty_monthly = max(0, (0.90 - system_pf)) * demand_kw * 0.5 * 30 if system_pf < 0.90 else 0

    # Transformer efficiency estimate (NEMA TP-1 at 35% load ≈ peak efficiency)
    xfmr_eff_pct = 98.5 if cfg.xfmr_kva >= 500 else 97.5

    # NEC demand factors for feeders — simplified by load mix
    largest_motor_kw = max((l.kw * l.qty for l in loads if l.load_type == "motor"), default=0)

    return {
        "connected_kw": round(connected_kw, 2),
        "demand_kw": round(demand_kw, 2),
        "demand_kva": round(demand_kva, 2),
        "demand_kvar": round(demand_kvar, 2),
        "system_pf": round(system_pf, 3),
        "xfmr_loading_pct": round(xfmr_loading, 1),
        "rec_xfmr_kva": rec_xfmr_kva,
        "qc_bank_kvar": qc_bank,
        "qc_needed_kvar": round(qc_needed, 1),
        "pf_after_correction": round(target_pf, 2),
        "monthly_kwh": round(monthly_kwh, 0),
        "monthly_cost_usd": round(monthly_cost, 2),
        "pf_penalty_monthly": round(pf_penalty_monthly, 2),
        "type_energy": type_energy,
        "xfmr_eff_pct": xfmr_eff_pct,
        "largest_motor_kw": round(largest_motor_kw, 1),
    }

# ── Endpoint 3: Short Circuit Study ──────────────────────────────────────────

@app.post("/api/shortcircuit")
def short_circuit_study(data: SystemData):
    cfg = data.config

    # Transformer secondary fault current
    # Ztr = V² × (%Z/100) / (kVA × 1000)  [Ω]
    z_tr = (cfg.voltage**2) * (cfg.xfmr_z_pct / 100) / (cfg.xfmr_kva * 1000)
    # Utility contribution impedance (assume infinite bus from transformer primary)
    # Isc_sym at xfmr secondary
    if cfg.phases == 3:
        isc_xfmr = (cfg.voltage / math.sqrt(3)) / z_tr
    else:
        isc_xfmr = cfg.voltage / (2 * z_tr)

    isc_xfmr_asym = isc_xfmr * 1.6  # asymmetric factor NEC 110.9

    # Motor contribution (IEEE C37.13: ~4× FLA for each motor load)
    motor_isc_contribution = sum(
        motor_nec_fla(l.hp) * l.qty * 4
        for l in data.loads
        if l.load_type == "motor" and l.hp
    )
    isc_total = isc_xfmr + motor_isc_contribution

    # Fault current at each panel after cable impedance
    panels: Dict[str, list] = {}
    for l in data.loads:
        panels.setdefault(l.panel, []).append(l)

    bus_results = []
    for panel, plds in panels.items():
        # Use the longest cable in this panel as the feeder length to panel
        max_len = max(pl.cable_length_ft for pl in plds)
        # Representative cable size for panel feeder: size from largest load
        total_panel_kw = sum(pl.kw * pl.qty for pl in plds)
        panel_amps = full_load_amps(total_panel_kw, cfg.voltage, 0.85, cfg.phases)
        feeder_cable = size_cable(panel_amps, max_len, cfg.voltage, cfg.phases)
        r_feeder = RESISTANCE.get(feeder_cable["size"], 0.1) * max_len / 1000.0
        z_total_bus = z_tr + r_feeder

        if cfg.phases == 3:
            isc_bus = (cfg.voltage / math.sqrt(3)) / z_total_bus
        else:
            isc_bus = cfg.voltage / (2 * z_total_bus)

        min_aic = 10000 if isc_bus < 10000 else (22000 if isc_bus < 22000 else 42000)

        bus_results.append({
            "panel": panel,
            "feeder_cable": feeder_cable["size"],
            "feeder_length_ft": max_len,
            "z_total_ohm": round(z_total_bus, 5),
            "isc_sym_ka": round(isc_bus / 1000, 2),
            "isc_asym_ka": round(isc_bus * 1.6 / 1000, 2),
            "min_aic_ka": min_aic // 1000,
        })

    return {
        "xfmr_isc_sym_ka": round(isc_xfmr / 1000, 2),
        "xfmr_isc_asym_ka": round(isc_xfmr_asym / 1000, 2),
        "motor_contribution_a": round(motor_isc_contribution, 0),
        "total_isc_ka": round(isc_total / 1000, 2),
        "z_transformer_ohm": round(z_tr, 5),
        "bus_results": bus_results,
    }

# ── Endpoint 4: Motor Starting Analysis ──────────────────────────────────────

@app.post("/api/motors")
def motor_starting(data: SystemData):
    cfg = data.config
    # Source impedance for voltage dip calculation
    z_tr = (cfg.voltage**2) * (cfg.xfmr_z_pct / 100) / (cfg.xfmr_kva * 1000)

    results = []
    motors = [l for l in data.loads if l.load_type == "motor" and l.hp]
    for m in motors:
        fla = motor_nec_fla(m.hp)
        cable = size_cable(fla, m.cable_length_ft, cfg.voltage, cfg.phases)
        r_cable = RESISTANCE.get(cable["size"], 0.1) * m.cable_length_ft / 1000.0
        z_total = z_tr + r_cable

        def vdip(i_start: float) -> float:
            if cfg.phases == 3:
                v_drop = math.sqrt(3) * i_start * z_total
            else:
                v_drop = 2 * i_start * z_total
            return round(v_drop / cfg.voltage * 100, 1)

        # Starting current multipliers per method
        methods = {
            "dol":          {"mult": 6.5, "torque_pct": 100, "label": "Direct On-Line"},
            "star_delta":   {"mult": 2.2, "torque_pct": 33,  "label": "Star-Delta"},
            "soft_starter": {"mult": 3.0, "torque_pct": 50,  "label": "Soft Starter"},
            "vfd":          {"mult": 1.1, "torque_pct": 100, "label": "VFD"},
        }
        method_results = {}
        for key, mdata in methods.items():
            istart = fla * mdata["mult"]
            vd = vdip(istart)
            method_results[key] = {
                "label": mdata["label"],
                "start_amps": round(istart, 0),
                "voltage_dip_pct": vd,
                "torque_pct": mdata["torque_pct"],
                "acceptable": vd <= 15,  # IEEE 519 / NEMA guideline: max 15% voltage dip
            }

        # Recommendation logic
        if m.hp >= 75 or method_results["dol"]["voltage_dip_pct"] > 20:
            rec = "vfd"
            rec_reason = "High HP or excessive voltage dip — VFD recommended for soft start and energy savings"
        elif m.hp >= 25 or method_results["dol"]["voltage_dip_pct"] > 15:
            rec = "star_delta"
            rec_reason = "Moderate HP — Star-Delta reduces starting stress on supply"
        elif m.hp >= 10:
            rec = "soft_starter"
            rec_reason = "Soft starter provides smooth ramp-up without full DOL inrush"
        else:
            rec = "dol"
            rec_reason = "Small motor — DOL is acceptable; voltage dip within limits"

        # NEC 430.52 max overcurrent protection (250% for inverse-time CB)
        max_ocpd = fla * 2.5
        motor_breaker = next_breaker(max_ocpd)
        # OL relay: NEC 430.32(A) = 115% of nameplate FLA
        ol_relay = round(fla * 1.15, 1)
        # Run capacitor for PF improvement (optional, for large motors)
        kvar_cap = round(m.kw * m.qty * 0.3, 1) if m.hp >= 20 else 0

        results.append({
            "id": m.id,
            "name": m.name,
            "hp": m.hp,
            "fla_nec": round(fla, 1),
            "kw": m.kw * m.qty,
            "methods": method_results,
            "selected_method": m.starting_method or "dol",
            "recommended_method": rec,
            "recommendation_reason": rec_reason,
            "motor_breaker_a": motor_breaker,
            "ol_relay_a": ol_relay,
            "run_capacitor_kvar": kvar_cap,
        })

    return {"motor_results": results}

# ── Endpoint 5: Protection Coordination ──────────────────────────────────────

@app.post("/api/protection")
def protection_coordination(data: SystemData):
    cfg = data.config

    # Gather panel groups
    panels: Dict[str, list] = {}
    for l in data.loads:
        panels.setdefault(l.panel, []).append(l)

    panel_protection = []
    for panel, plds in panels.items():
        # Determine panel feeder current
        # NEC 430.24: motor feeder = 125% of largest motor FLA + sum of others
        motor_flas = [motor_nec_fla(l.hp) * l.qty for l in plds if l.load_type == "motor" and l.hp]
        other_amps = sum(
            full_load_amps(l.kw, l.voltage, l.pf, l.phases) * l.qty
            for l in plds if l.load_type != "motor"
        )
        if motor_flas:
            largest = max(motor_flas)
            rest = sum(motor_flas) - largest
            feeder_amps = largest * 1.25 + rest + other_amps
        else:
            feeder_amps = other_amps * 1.25

        feeder_breaker = next_breaker(feeder_amps)

        # Selectivity: main breaker should be ≥ 1.6× largest branch breaker
        branch_breakers = []
        for l in plds:
            if l.load_type == "motor" and l.hp:
                b = next_breaker(motor_nec_fla(l.hp) * l.qty * 2.5)
            else:
                b = next_breaker(full_load_amps(l.kw, l.voltage, l.pf, l.phases) * l.qty * 1.25)
            branch_breakers.append(b)

        max_branch = max(branch_breakers) if branch_breakers else 0
        selectivity_ok = feeder_breaker >= max_branch * 1.6

        panel_protection.append({
            "panel": panel,
            "feeder_amps": round(feeder_amps, 1),
            "feeder_breaker_a": feeder_breaker,
            "max_branch_breaker_a": max_branch,
            "selectivity_ok": selectivity_ok,
            "selectivity_ratio": round(feeder_breaker / max_branch, 2) if max_branch > 0 else None,
            "num_loads": len(plds),
        })

    # Main service entrance
    total_feeder_amps = sum(p["feeder_amps"] for p in panel_protection)
    main_breaker = next_breaker(total_feeder_amps * 1.25)

    # Harmonic distortion estimate (IEEE 519)
    total_kw = sum(l.kw * l.qty for l in data.loads)
    thd_contributions = []
    for l in data.loads:
        weight = (l.kw * l.qty) / total_kw if total_kw > 0 else 0
        thd_contributions.append(HARMONIC_THD.get(l.load_type, 8) * weight)
    estimated_thd = sum(thd_contributions)

    ieee519_limit = 5.0  # IEEE 519-2022 Table 2: 5% THD_I for Isc/IL > 50
    thd_ok = estimated_thd <= ieee519_limit

    vfd_count = sum(l.qty for l in data.loads if l.load_type == "vfd")
    filter_recommendation = None
    if not thd_ok:
        if vfd_count > 0:
            filter_recommendation = f"Install 3% line reactors on all {vfd_count} VFD(s). Consider 12-pulse or 18-pulse rectifiers for drives >75kW."
        else:
            filter_recommendation = "Install passive harmonic filters at MDP for non-linear loads."

    return {
        "panel_protection": panel_protection,
        "main_service_amps": round(total_feeder_amps, 1),
        "main_breaker_a": main_breaker,
        "estimated_thd_pct": round(estimated_thd, 1),
        "ieee519_limit_pct": ieee519_limit,
        "thd_compliant": thd_ok,
        "filter_recommendation": filter_recommendation,
    }

# ── Endpoint 6: AI Engineering Review ────────────────────────────────────────

AI_SYSTEM = """You are a senior electrical engineer with 25+ years of experience in industrial power system design.
You are performing a formal engineering design review of an electrical system.
Your review must reference specific NEC 2023, IEC 60364, IEEE 519, and NEMA standards.
Be precise, technically accurate, and actionable.

Respond in valid JSON with exactly these fields:
{
  "grade": "A+" | "A" | "B+" | "B" | "C+" | "C" | "D" | "F",
  "grade_justification": "2-3 sentences explaining the grade",
  "compliance_issues": [
    {"standard": "NEC 430.52", "description": "...", "severity": "CRITICAL|HIGH|MEDIUM|LOW", "fix": "..."}
  ],
  "safety_concerns": [
    {"description": "...", "risk_level": "CRITICAL|HIGH|MEDIUM|LOW", "recommendation": "..."}
  ],
  "efficiency_opportunities": [
    {"description": "...", "estimated_saving_pct": 12, "implementation": "...", "payback_years": 3}
  ],
  "design_strengths": ["...", "..."],
  "specific_recommendations": [
    {"component": "...", "issue": "...", "action": "...", "nec_reference": "..."}
  ],
  "executive_summary": "3-4 paragraph engineering summary"
}"""

@app.post("/api/ai-review")
async def ai_review(data: SystemData):
    # Build system description
    load_summary = "\n".join(
        f"  - {l.name}: {l.load_type}, {l.kw}kW × {l.qty}, PF={l.pf}, "
        f"{l.phases}Φ {l.voltage}V, panel={l.panel}, "
        f"{'HP=' + str(l.hp) + ', start=' + str(l.starting_method) if l.hp else ''}"
        for l in data.loads
    )
    cfg = data.config
    system_desc = f"""
FACILITY: {cfg.name}
SYSTEM: {cfg.voltage}V, {cfg.phases}-phase, {cfg.frequency}Hz
TRANSFORMER: {cfg.xfmr_kva} kVA, %Z = {cfg.xfmr_z_pct}%
UTILITY: {cfg.utility_fault_kva/1000:.0f} MVA available fault capacity
TARIFF: ${cfg.tariff_kwh}/kWh

LOAD INVENTORY ({len(data.loads)} loads):
{load_summary}

CALCULATED METRICS:
- Total connected load: {sum(l.kw*l.qty for l in data.loads):.1f} kW
- Estimated demand: {sum(l.kw*l.qty*l.demand_factor for l in data.loads):.1f} kW
- Motor loads: {sum(l.kw*l.qty for l in data.loads if l.load_type == 'motor'):.1f} kW
- Non-linear loads (VFD/UPS/welding): {sum(l.kw*l.qty for l in data.loads if l.load_type in ['vfd','ups','welding']):.1f} kW
"""
    prompt = f"{AI_SYSTEM}\n\nSYSTEM DATA FOR REVIEW:\n{system_desc}\n\nProvide your review as valid JSON only."

    try:
        resp = gemini.generate_content(prompt)
        raw = resp.text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Sample Data Endpoint ──────────────────────────────────────────────────────

@app.get("/api/sample")
def sample_plant():
    return {
        "config": {
            "name": "Midsize Manufacturing Plant — Building A",
            "voltage": 480, "phases": 3, "frequency": 60,
            "xfmr_kva": 1000, "xfmr_z_pct": 5.75,
            "utility_fault_kva": 500000, "tariff_kwh": 0.115,
        },
        "loads": [
            {"id":"1","name":"Conveyor Drive 1","load_type":"motor","kw":15,"pf":0.85,"phases":3,"voltage":480,"qty":1,"demand_factor":0.9,"daily_hours":16,"cable_length_ft":120,"panel":"MDP-A","hp":20,"starting_method":"dol"},
            {"id":"2","name":"Conveyor Drive 2","load_type":"motor","kw":15,"pf":0.85,"phases":3,"voltage":480,"qty":1,"demand_factor":0.9,"daily_hours":16,"cable_length_ft":180,"panel":"MDP-A","hp":20,"starting_method":"star_delta"},
            {"id":"3","name":"Air Compressor","load_type":"motor","kw":55.9,"pf":0.87,"phases":3,"voltage":480,"qty":1,"demand_factor":0.85,"daily_hours":12,"cable_length_ft":250,"panel":"MDP-A","hp":75,"starting_method":"star_delta"},
            {"id":"4","name":"Hydraulic Pump","load_type":"motor","kw":7.46,"pf":0.85,"phases":3,"voltage":480,"qty":2,"demand_factor":0.75,"daily_hours":8,"cable_length_ft":90,"panel":"MDP-B","hp":10,"starting_method":"dol"},
            {"id":"5","name":"CNC Machining Center","load_type":"vfd","kw":22,"pf":0.90,"phases":3,"voltage":480,"qty":3,"demand_factor":0.80,"daily_hours":10,"cable_length_ft":150,"panel":"MDP-B"},
            {"id":"6","name":"Robotic Welding Cell","load_type":"welding","kw":18,"pf":0.70,"phases":3,"voltage":480,"qty":2,"demand_factor":0.60,"daily_hours":8,"cable_length_ft":130,"panel":"MDP-B"},
            {"id":"7","name":"LED Factory Lighting","load_type":"lighting","kw":45,"pf":0.95,"phases":3,"voltage":480,"qty":1,"demand_factor":1.0,"daily_hours":14,"cable_length_ft":200,"panel":"LP-1"},
            {"id":"8","name":"Chiller Unit (HVAC)","load_type":"hvac","kw":110,"pf":0.88,"phases":3,"voltage":480,"qty":1,"demand_factor":0.85,"daily_hours":12,"cable_length_ft":300,"panel":"MDP-A","hp":150,"starting_method":"vfd"},
            {"id":"9","name":"UPS — Server Room","load_type":"ups","kw":30,"pf":0.90,"phases":3,"voltage":480,"qty":1,"demand_factor":1.0,"daily_hours":24,"cable_length_ft":80,"panel":"LP-2"},
            {"id":"10","name":"Office Receptacles","load_type":"receptacle","kw":20,"pf":0.85,"phases":1,"voltage":120,"qty":1,"demand_factor":0.50,"daily_hours":10,"cable_length_ft":160,"panel":"LP-2"},
        ]
    }
