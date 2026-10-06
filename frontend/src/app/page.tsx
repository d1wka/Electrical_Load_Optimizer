"use client";
import { useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type LoadType = "motor"|"lighting"|"hvac"|"vfd"|"ups"|"welding"|"receptacle"|"server"|"heater"|"general";
type StartMethod = "dol"|"star_delta"|"soft_starter"|"vfd";

interface Load {
  id: string; name: string; load_type: LoadType; kw: number; pf: number;
  phases: 1|3; voltage: number; qty: number; demand_factor: number;
  daily_hours: number; cable_length_ft: number; panel: string;
  hp?: number; starting_method?: StartMethod;
}
interface SysConfig {
  name: string; voltage: number; phases: number; frequency: number;
  xfmr_kva: number; xfmr_z_pct: number; utility_fault_kva: number; tariff_kwh: number;
}

const API = "http://localhost:8001";

const LOAD_TYPE_OPTIONS: { value: LoadType; label: string }[] = [
  { value: "motor",      label: "Induction Motor"  },
  { value: "lighting",   label: "Lighting"          },
  { value: "hvac",       label: "HVAC"              },
  { value: "vfd",        label: "VFD Drive"         },
  { value: "ups",        label: "UPS"               },
  { value: "welding",    label: "Welding"           },
  { value: "receptacle", label: "Receptacles"       },
  { value: "server",     label: "Server / IT"       },
  { value: "heater",     label: "Resistance Heater" },
  { value: "general",    label: "General"           },
];
const TYPE_COLORS: Record<string, string> = {
  motor:"text-blue-400", lighting:"text-yellow-400", hvac:"text-cyan-400",
  vfd:"text-purple-400", ups:"text-orange-400", welding:"text-red-400",
  receptacle:"text-gray-400", server:"text-green-400", heater:"text-rose-400", general:"text-gray-300",
};

const TABS = [
  { id: "config",      label: "System Setup"   },
  { id: "loads",       label: "Load Schedule"  },
  { id: "power",       label: "Power Analysis" },
  { id: "sc",          label: "Short Circuit"  },
  { id: "motors",      label: "Motor Starting" },
  { id: "protection",  label: "Protection"     },
  { id: "ai",          label: "AI Review"      },
] as const;
type TabId = typeof TABS[number]["id"];

function uid() { return Math.random().toString(36).slice(2,9); }

// ── Main Component ─────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState<TabId>("config");
  const [config, setConfig] = useState<SysConfig>({
    name:"New Project", voltage:480, phases:3, frequency:60,
    xfmr_kva:500, xfmr_z_pct:5.75, utility_fault_kva:500000, tariff_kwh:0.12,
  });
  const [loads, setLoads] = useState<Load[]>([]);

  const [loadRes, setLoadRes]   = useState<any[]>([]);
  const [powerRes, setPowerRes] = useState<any>(null);
  const [scRes, setScRes]       = useState<any>(null);
  const [motorRes, setMotorRes] = useState<any[]>([]);
  const [protRes, setProtRes]   = useState<any>(null);
  const [aiRes, setAiRes]       = useState<any>(null);

  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError]     = useState<Record<string, string>>({});

  const post = useCallback(async (endpoint: string, key: string, setter: (d: any) => void) => {
    setLoading(p => ({ ...p, [key]: true }));
    setError(p => ({ ...p, [key]: "" }));
    try {
      const r = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, loads }),
      });
      if (!r.ok) throw new Error(await r.text());
      setter(await r.json());
    } catch (e: any) {
      setError(p => ({ ...p, [key]: e.message }));
    } finally {
      setLoading(p => ({ ...p, [key]: false }));
    }
  }, [config, loads]);

  async function loadSample() {
    const r = await fetch(`${API}/api/sample`);
    const d = await r.json();
    setConfig(d.config as SysConfig);
    setLoads(d.loads as Load[]);
    setLoadRes([]); setPowerRes(null); setScRes(null);
    setMotorRes([]); setProtRes(null); setAiRes(null);
  }

  const totalKw    = loads.reduce((s, l) => s + l.kw * l.qty, 0);
  const demandKw   = loads.reduce((s, l) => s + l.kw * l.qty * l.demand_factor, 0);
  const motorLoads = loads.filter(l => l.load_type === "motor");
  const vfdLoads   = loads.filter(l => l.load_type === "vfd");

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950 text-gray-100 font-mono text-sm">

      {/* ── Left Nav ────────────────────────────────────────────────────── */}
      <aside className="w-52 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-800">
          <p className="text-xs font-bold text-yellow-400 tracking-widest uppercase">IEDS</p>
          <p className="text-[10px] text-gray-600 mt-0.5">Electrical Design Suite</p>
        </div>
        <nav className="flex-1 py-2">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`w-full text-left px-4 py-2.5 text-xs transition-colors
                ${tab === t.id
                  ? "bg-gray-800 border-l-2 border-yellow-400 text-white font-semibold"
                  : "border-l-2 border-transparent text-gray-500 hover:bg-gray-800 hover:text-gray-300"}`}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-gray-800 px-4 py-3 space-y-1">
          <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">System Live</p>
          {[
            { label: "Loads",     value: loads.length },
            { label: "Connected", value: `${totalKw.toFixed(1)} kW` },
            { label: "Demand",    value: `${demandKw.toFixed(1)} kW` },
            { label: "Motors",    value: motorLoads.length },
            { label: "VFDs",      value: vfdLoads.length },
            { label: "Voltage",   value: `${config.voltage}V ${config.phases}ph` },
            { label: "Xfmr",      value: `${config.xfmr_kva} kVA` },
          ].map(r => (
            <div key={r.label} className="flex justify-between text-[10px]">
              <span className="text-gray-600">{r.label}</span>
              <span className="text-gray-300">{r.value}</span>
            </div>
          ))}
          <button onClick={loadSample}
            className="mt-2 w-full py-1 text-[10px] text-yellow-400 border border-yellow-800
              hover:bg-yellow-900/20 rounded transition">
            Load Sample Plant
          </button>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        {tab === "config"     && <TabConfig config={config} setConfig={setConfig} />}
        {tab === "loads"      && <TabLoads loads={loads} setLoads={setLoads} config={config}
                                    loadRes={loadRes} setLoadRes={setLoadRes}
                                    loading={loading.loads} error={error.loads}
                                    onAnalyze={() => post("/api/loads", "loads", d => setLoadRes(d.load_results))} />}
        {tab === "power"      && <TabPower config={config} result={powerRes}
                                    loading={loading.power} error={error.power}
                                    onRun={() => post("/api/power", "power", setPowerRes)} />}
        {tab === "sc"         && <TabSC result={scRes}
                                    loading={loading.sc} error={error.sc}
                                    onRun={() => post("/api/shortcircuit", "sc", setScRes)} />}
        {tab === "motors"     && <TabMotors result={motorRes}
                                    loading={loading.motors} error={error.motors}
                                    onRun={() => post("/api/motors", "motors", d => setMotorRes(d.motor_results))} />}
        {tab === "protection" && <TabProtection result={protRes}
                                    loading={loading.protection} error={error.protection}
                                    onRun={() => post("/api/protection", "protection", setProtRes)} />}
        {tab === "ai"         && <TabAI config={config} loads={loads} result={aiRes}
                                    loading={loading.ai} error={error.ai}
                                    onRun={() => post("/api/ai-review", "ai", setAiRes)} />}
      </main>
    </div>
  );
}

// ── Shared UI Atoms ────────────────────────────────────────────────────────────

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
        <h2 className="text-xs font-bold text-yellow-400 uppercase tracking-widest">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function RunBtn({ onClick, loading, label }: { onClick: () => void; loading?: boolean; label: string }) {
  return (
    <button onClick={onClick} disabled={loading}
      className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-40
        rounded-lg text-xs font-bold text-gray-950 transition">
      {loading ? "Running..." : label}
    </button>
  );
}

function Badge({ v, ok }: { v: string | number; ok: boolean }) {
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
      ok ? "bg-green-900/60 text-green-400 border border-green-800"
         : "bg-red-900/60 text-red-400 border border-red-800"}`}>
      {v}
    </span>
  );
}

function Kpi({ label, value, sub, color = "text-white" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
      <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function Err({ msg }: { msg?: string }) {
  return msg ? <p className="text-red-400 text-xs mt-2 bg-red-900/20 border border-red-800 rounded px-3 py-2">{msg}</p> : null;
}

// ── Tab 1: System Config ───────────────────────────────────────────────────────

function TabConfig({ config, setConfig }: { config: SysConfig; setConfig: (c: SysConfig) => void }) {
  const set = (k: keyof SysConfig) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setConfig({ ...config, [k]: isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value) });

  const field = (label: string, k: keyof SysConfig, type = "number") => (
    <div>
      <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      <input type={type} value={config[k] as string | number} onChange={set(k)}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm
          focus:outline-none focus:border-yellow-500" />
    </div>
  );

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <div className="mb-2">
        <h1 className="text-xl font-bold text-yellow-400">System Configuration</h1>
        <p className="text-xs text-gray-500 mt-0.5">Define the electrical system parameters before adding loads</p>
      </div>

      <Panel title="Project Identity">
        {field("Project / Facility Name", "name", "text")}
      </Panel>

      <Panel title="Supply System">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">System Voltage (V)</label>
            <select value={config.voltage} onChange={set("voltage")}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500">
              {[120,208,240,480,600,2400,4160,6900,13800].map(v =>
                <option key={v} value={v}>{v} V</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">Phases</label>
            <select value={config.phases} onChange={set("phases")}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500">
              <option value={1}>Single Phase (1ph)</option>
              <option value={3}>Three Phase (3ph)</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">Frequency (Hz)</label>
            <select value={config.frequency} onChange={set("frequency")}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500">
              <option value={60}>60 Hz (North America)</option>
              <option value={50}>50 Hz (Europe / Asia)</option>
            </select>
          </div>
        </div>
      </Panel>

      <Panel title="Main Transformer">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">Transformer Rating (kVA)</label>
            <select value={config.xfmr_kva} onChange={set("xfmr_kva")}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500">
              {[15,25,37.5,50,75,100,150,167,225,300,333,500,750,1000,1500,2000,2500,3000,5000].map(v =>
                <option key={v} value={v}>{v} kVA</option>)}
            </select>
          </div>
          {field("Transformer %Z (default 5.75%)", "xfmr_z_pct")}
          {field("Utility Available Fault (kVA)", "utility_fault_kva")}
        </div>
      </Panel>

      <Panel title="Tariff and Economics">
        <div className="grid grid-cols-2 gap-3">
          {field("Electricity Tariff ($/kWh)", "tariff_kwh")}
          <div className="bg-gray-800 rounded-lg p-3 border border-gray-700 text-xs text-gray-400 flex items-center">
            Cost calculations use this rate for monthly energy estimates and PF penalty analysis.
          </div>
        </div>
      </Panel>

      <div className="bg-gray-900 rounded-xl border border-yellow-800/40 p-4 text-xs text-gray-400">
        <p className="text-yellow-400 font-semibold mb-1">Next steps:</p>
        <p>- Go to Load Schedule to add electrical loads and run cable sizing analysis.</p>
        <p>- Use the &quot;Load Sample Plant&quot; button in the sidebar to pre-fill with a manufacturing facility dataset.</p>
      </div>
    </div>
  );
}

// ── Tab 2: Load Schedule ───────────────────────────────────────────────────────

function TabLoads({ loads, setLoads, config, loadRes, setLoadRes, loading, error, onAnalyze }:
  { loads: Load[]; setLoads: (l: Load[]) => void; config: SysConfig;
    loadRes: any[]; setLoadRes: (r: any[]) => void;
    loading?: boolean; error?: string; onAnalyze: () => void }) {

  const [newLoad, setNewLoad] = useState<Partial<Load>>({
    load_type: "general", pf: 0.85, phases: 3, voltage: 480,
    qty: 1, demand_factor: 1.0, daily_hours: 8, cable_length_ft: 100,
    panel: "MDP", starting_method: "dol",
  });

  function addLoad() {
    if (!newLoad.name || !newLoad.kw) return;
    setLoads([...loads, { ...newLoad, id: uid() } as Load]);
    setNewLoad(p => ({ ...p, name: "", kw: undefined, hp: undefined }));
  }

  function deleteLoad(id: string) {
    setLoads(loads.filter(l => l.id !== id));
    setLoadRes(loadRes.filter((r: any) => r.id !== id));
  }

  const resultMap = Object.fromEntries(loadRes.map((r: any) => [r.id, r]));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-end justify-between mb-2">
        <div>
          <h1 className="text-xl font-bold text-yellow-400">Load Schedule and Cable Sizing</h1>
          <p className="text-xs text-gray-500 mt-0.5">NEC 310 conductor sizing · NEC 210.19 voltage drop · NEC 430.52 motor protection</p>
        </div>
        <RunBtn onClick={onAnalyze} loading={loading} label={`Analyze All ${loads.length} Loads`} />
      </div>
      <Err msg={error} />

      <Panel title="Add Load">
        <div className="grid grid-cols-5 gap-2 mb-2">
          <div className="col-span-2">
            <label className="block text-[10px] text-gray-500 mb-0.5">Load Name *</label>
            <input value={newLoad.name || ""} onChange={e => setNewLoad(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Conveyor Motor 1"
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-yellow-500" />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">Type</label>
            <select value={newLoad.load_type} onChange={e => setNewLoad(p => ({ ...p, load_type: e.target.value as LoadType }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-yellow-500">
              {LOAD_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">kW *</label>
            <input type="number" value={newLoad.kw || ""} onChange={e => setNewLoad(p => ({ ...p, kw: +e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-yellow-500" />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">HP (motors)</label>
            <input type="number" value={newLoad.hp || ""} onChange={e => setNewLoad(p => ({ ...p, hp: +e.target.value || undefined }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-yellow-500" />
          </div>
        </div>
        <div className="grid grid-cols-7 gap-2 mb-3">
          {[
            { label: "PF",       key: "pf"              },
            { label: "Phases",   key: "phases"          },
            { label: "Voltage",  key: "voltage"         },
            { label: "Qty",      key: "qty"             },
            { label: "Dem. F.",  key: "demand_factor"   },
            { label: "Hrs/day",  key: "daily_hours"     },
            { label: "Cable ft", key: "cable_length_ft" },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-[10px] text-gray-500 mb-0.5">{f.label}</label>
              <input type="number"
                value={(newLoad as any)[f.key] ?? ""}
                onChange={e => setNewLoad(p => ({ ...p, [f.key]: +e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-yellow-500" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2 items-end">
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">Panel</label>
            <input value={newLoad.panel || ""} onChange={e => setNewLoad(p => ({ ...p, panel: e.target.value }))}
              placeholder="MDP"
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-yellow-500" />
          </div>
          {newLoad.load_type === "motor" && (
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">Start Method</label>
              <select value={newLoad.starting_method}
                onChange={e => setNewLoad(p => ({ ...p, starting_method: e.target.value as StartMethod }))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-yellow-500">
                <option value="dol">DOL</option>
                <option value="star_delta">Star-Delta</option>
                <option value="soft_starter">Soft Starter</option>
                <option value="vfd">VFD</option>
              </select>
            </div>
          )}
          <button onClick={addLoad}
            className="col-span-1 py-1.5 bg-yellow-600 hover:bg-yellow-500 rounded text-xs font-bold text-gray-950 transition">
            + Add Load
          </button>
        </div>
      </Panel>

      {loads.length > 0 && (
        <Panel title={`Load Inventory — ${loads.length} loads · ${loads.reduce((s,l)=>s+l.kw*l.qty,0).toFixed(1)} kW connected`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-gray-800">
                <tr className="text-[10px] text-gray-500 uppercase">
                  <th className="text-left py-1.5 pr-3">Name</th>
                  <th className="text-left pr-2">Type</th>
                  <th className="text-right pr-2">kW</th>
                  <th className="text-right pr-2">Qty</th>
                  <th className="text-right pr-2">Total kW</th>
                  <th className="text-right pr-2">PF</th>
                  <th className="text-left pr-2">Panel</th>
                  {loadRes.length > 0 && <>
                    <th className="text-right pr-2">FLA (A)</th>
                    <th className="text-right pr-2">Cable</th>
                    <th className="text-right pr-2">VD%</th>
                    <th className="text-right pr-2">Breaker</th>
                    <th className="text-right pr-2">Status</th>
                  </>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loads.map(l => {
                  const r = resultMap[l.id];
                  const typeInfo = LOAD_TYPE_OPTIONS.find(o => o.value === l.load_type);
                  return (
                    <tr key={l.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-1.5 pr-3 text-gray-200 font-medium">{l.name}</td>
                      <td className={`pr-2 ${TYPE_COLORS[l.load_type]}`}>{typeInfo?.label}</td>
                      <td className="text-right pr-2 text-gray-300">{l.kw}</td>
                      <td className="text-right pr-2 text-gray-400">x{l.qty}</td>
                      <td className="text-right pr-2 font-mono text-white">{(l.kw*l.qty).toFixed(1)}</td>
                      <td className="text-right pr-2 text-gray-400">{l.pf}</td>
                      <td className="pr-2 text-gray-500 font-mono">{l.panel}</td>
                      {loadRes.length > 0 && r && <>
                        <td className="text-right pr-2 font-mono text-cyan-300">{r.fla_per_unit}</td>
                        <td className="text-right pr-2 font-mono text-yellow-300">{r.cable.size}</td>
                        <td className="text-right pr-2">
                          <Badge v={`${r.cable.vd_pct}%`} ok={r.cable.vd_ok} />
                        </td>
                        <td className="text-right pr-2 font-mono text-purple-300">{r.breaker_a}A</td>
                        <td className="text-right pr-2">
                          <Badge v={r.status === "ok" ? "OK" : "WARN"} ok={r.status === "ok"} />
                        </td>
                      </>}
                      <td>
                        <button onClick={() => deleteLoad(l.id)} className="text-gray-700 hover:text-red-400 px-1">x</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {loads.length === 0 && (
        <div className="text-center py-12 text-gray-600 text-sm">
          No loads added yet. Use the form above or click <strong className="text-yellow-500">&quot;Load Sample Plant&quot;</strong> in the sidebar.
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Power Analysis ──────────────────────────────────────────────────────

function TabPower({ config, result, loading, error, onRun }:
  { config: SysConfig; result: any; loading?: boolean; error?: string; onRun: () => void }) {
  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-end justify-between mb-2">
        <div>
          <h1 className="text-xl font-bold text-yellow-400">Power Demand Analysis</h1>
          <p className="text-xs text-gray-500 mt-0.5">Demand calculation · Transformer sizing · PF correction · Energy cost</p>
        </div>
        <RunBtn onClick={onRun} loading={loading} label="Run Power Analysis" />
      </div>
      <Err msg={error} />

      {result && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <Kpi label="Connected Load" value={`${result.connected_kw.toFixed(1)} kW`} />
            <Kpi label="Demand Load" value={`${result.demand_kw.toFixed(1)} kW`} sub="After demand factors" />
            <Kpi label="Demand kVA" value={`${result.demand_kva.toFixed(1)} kVA`} />
            <Kpi label="System PF" value={result.system_pf.toFixed(3)}
              color={result.system_pf >= 0.90 ? "text-green-400" : result.system_pf >= 0.80 ? "text-yellow-400" : "text-red-400"}
              sub={result.system_pf < 0.90 ? "Below 0.90 threshold" : "Acceptable"} />
          </div>

          <Panel title="Transformer Sizing">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] text-gray-500 uppercase mb-1">Current Transformer</p>
                <p className="text-2xl font-bold text-white">{config.xfmr_kva} kVA</p>
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                    <span>Loading</span>
                    <span className={result.xfmr_loading_pct > 90 ? "text-red-400" : result.xfmr_loading_pct > 80 ? "text-yellow-400" : "text-green-400"}>
                      {result.xfmr_loading_pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${
                      result.xfmr_loading_pct > 90 ? "bg-red-500" : result.xfmr_loading_pct > 80 ? "bg-yellow-500" : "bg-green-500"
                    }`} style={{ width: `${Math.min(result.xfmr_loading_pct, 100)}%` }} />
                  </div>
                </div>
              </div>
              <div className="border-l border-gray-800 pl-4">
                <p className="text-[10px] text-gray-500 uppercase mb-1">Recommended Size</p>
                <p className="text-2xl font-bold text-yellow-400">{result.rec_xfmr_kva} kVA</p>
                <p className="text-[10px] text-gray-500 mt-1">Demand x 1.25 growth factor (NEMA)</p>
              </div>
              <div className="border-l border-gray-800 pl-4">
                <p className="text-[10px] text-gray-500 uppercase mb-1">Efficiency</p>
                <p className="text-2xl font-bold text-green-400">{result.xfmr_eff_pct}%</p>
                <p className="text-[10px] text-gray-500 mt-1">NEMA TP-1 rated efficiency</p>
              </div>
            </div>
          </Panel>

          <Panel title="Power Factor Correction">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] text-gray-500 uppercase mb-1">Current PF</p>
                <p className={`text-2xl font-bold ${result.system_pf >= 0.90 ? "text-green-400" : "text-red-400"}`}>
                  {result.system_pf.toFixed(3)}
                </p>
                <p className="text-[10px] text-gray-500 mt-1">Demand kVAR: {result.demand_kvar.toFixed(1)}</p>
              </div>
              {result.qc_bank_kvar > 0 ? (
                <>
                  <div className="border-l border-gray-800 pl-4">
                    <p className="text-[10px] text-gray-500 uppercase mb-1">Capacitor Bank Required</p>
                    <p className="text-2xl font-bold text-cyan-400">{result.qc_bank_kvar} kVAR</p>
                    <p className="text-[10px] text-gray-500 mt-1">To reach PF = {result.pf_after_correction}</p>
                  </div>
                  <div className="border-l border-gray-800 pl-4">
                    <p className="text-[10px] text-gray-500 uppercase mb-1">PF Penalty (Monthly)</p>
                    <p className="text-2xl font-bold text-red-400">${result.pf_penalty_monthly.toFixed(0)}</p>
                    <p className="text-[10px] text-gray-500 mt-1">Utility penalty for PF below 0.90</p>
                  </div>
                </>
              ) : (
                <div className="col-span-2 border-l border-gray-800 pl-4 flex items-center">
                  <p className="text-green-400 text-sm">Power factor is acceptable — no correction capacitors required.</p>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Energy Cost Estimate">
            <div className="grid grid-cols-4 gap-3">
              <Kpi label="Monthly kWh" value={result.monthly_kwh.toLocaleString()} />
              <Kpi label="Monthly Cost" value={`$${result.monthly_cost_usd.toLocaleString()}`} color="text-yellow-400" />
              <Kpi label="Annual Cost" value={`$${(result.monthly_cost_usd*12).toLocaleString()}`} color="text-orange-400" />
              <Kpi label="Largest Motor" value={`${result.largest_motor_kw} kW`} sub="Highest demand contributor" />
            </div>
            {Object.keys(result.type_energy).length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] text-gray-500 uppercase mb-2">Monthly kWh by Load Category</p>
                <div className="space-y-1.5">
                  {Object.entries(result.type_energy as Record<string, number>)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, kwh]) => {
                      const pct = (kwh / result.monthly_kwh) * 100;
                      const typeInfo = LOAD_TYPE_OPTIONS.find(o => o.value === type);
                      return (
                        <div key={type}>
                          <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
                            <span className={TYPE_COLORS[type]}>{typeInfo?.label ?? type}</span>
                            <span>{kwh.toLocaleString()} kWh ({pct.toFixed(1)}%)</span>
                          </div>
                          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-yellow-600 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </Panel>
        </>
      )}
      {!result && !loading && (
        <div className="text-center py-16 text-gray-600 text-sm">
          Click <strong className="text-yellow-500">Run Power Analysis</strong> to calculate demand, transformer sizing, and PF correction.
        </div>
      )}
    </div>
  );
}

// ── Tab 4: Short Circuit ───────────────────────────────────────────────────────

function TabSC({ result, loading, error, onRun }:
  { result: any; loading?: boolean; error?: string; onRun: () => void }) {
  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-end justify-between mb-2">
        <div>
          <h1 className="text-xl font-bold text-yellow-400">Short Circuit Study</h1>
          <p className="text-xs text-gray-500 mt-0.5">Symmetrical fault currents · Transformer impedance · Point-to-point method · AIC requirements</p>
        </div>
        <RunBtn onClick={onRun} loading={loading} label="Run Short Circuit Study" />
      </div>
      <Err msg={error} />

      {result && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <Kpi label="Transformer Sec. Fault" value={`${result.xfmr_isc_sym_ka} kA`} color="text-red-400" sub="Symmetrical (rms)" />
            <Kpi label="Asymmetrical Fault" value={`${result.xfmr_isc_asym_ka} kA`} color="text-orange-400" sub="x1.6 factor (NEC 110.9)" />
            <Kpi label="Motor Contribution" value={`${(result.motor_contribution_a/1000).toFixed(2)} kA`} sub="IEEE C37.13 estimate" />
            <Kpi label="Total Available Fault" value={`${result.total_isc_ka} kA`} color="text-red-500" sub="Transformer + motors" />
          </div>

          <Panel title="Fault Current at Each Distribution Bus">
            <table className="w-full text-xs">
              <thead className="border-b border-gray-800">
                <tr className="text-[10px] text-gray-500 uppercase">
                  <th className="text-left py-1.5 pr-4">Panel / Bus</th>
                  <th className="text-right pr-3">Feeder Cable</th>
                  <th className="text-right pr-3">Feeder (ft)</th>
                  <th className="text-right pr-3">Z Total (ohm)</th>
                  <th className="text-right pr-3">Isc Sym (kA)</th>
                  <th className="text-right pr-3">Isc Asym (kA)</th>
                  <th className="text-right pr-3">Min AIC (kA)</th>
                </tr>
              </thead>
              <tbody>
                {result.bus_results.map((b: any) => (
                  <tr key={b.panel} className="border-b border-gray-800/50">
                    <td className="py-1.5 pr-4 font-mono text-yellow-300">{b.panel}</td>
                    <td className="text-right pr-3 text-cyan-300">{b.feeder_cable}</td>
                    <td className="text-right pr-3 text-gray-400">{b.feeder_length_ft}</td>
                    <td className="text-right pr-3 font-mono text-gray-400">{b.z_total_ohm}</td>
                    <td className="text-right pr-3 text-red-400 font-semibold">{b.isc_sym_ka} kA</td>
                    <td className="text-right pr-3 text-orange-400">{b.isc_asym_ka} kA</td>
                    <td className="text-right pr-3">
                      <Badge v={`${b.min_aic_ka} kA`} ok={b.isc_asym_ka <= b.min_aic_ka} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel title="NEC 110.9 Interrupting Capacity Requirements">
            <div className="text-xs text-gray-400 space-y-1.5">
              <p>Per <strong className="text-white">NEC 110.9</strong>: Equipment must have an interrupting rating sufficient for the available fault current.</p>
              <p>Standard breaker AIC ratings: <span className="text-yellow-300">10 kA / 22 kA / 42 kA / 65 kA / 100 kA / 200 kA</span></p>
              <p>Transformer impedance Z = <span className="text-cyan-300">{result.z_transformer_ohm} ohm</span> (secondary side, line-to-neutral)</p>
              <p className="text-gray-600">Motor contribution calculated at 4x FLA per IEEE C37.13. Point-to-point method uses DC resistance only — add 1.15 safety margin for actual design.</p>
            </div>
          </Panel>
        </>
      )}
      {!result && !loading && (
        <div className="text-center py-16 text-gray-600 text-sm">
          Click <strong className="text-yellow-500">Run Short Circuit Study</strong> to calculate fault currents at all distribution buses.
        </div>
      )}
    </div>
  );
}

// ── Tab 5: Motor Starting Analysis ────────────────────────────────────────────

function TabMotors({ result, loading, error, onRun }:
  { result: any[]; loading?: boolean; error?: string; onRun: () => void }) {

  const METHOD_ORDER = ["dol", "star_delta", "soft_starter", "vfd"];

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-end justify-between mb-2">
        <div>
          <h1 className="text-xl font-bold text-yellow-400">Motor Starting Analysis</h1>
          <p className="text-xs text-gray-500 mt-0.5">NEC Table 430.250 FLA · Starting currents · Voltage dip · IEEE guidelines (max 15% VD)</p>
        </div>
        <RunBtn onClick={onRun} loading={loading} label="Analyze Motors" />
      </div>
      <Err msg={error} />

      {result?.length > 0 ? result.map((m: any) => (
        <Panel key={m.id} title={`${m.name} — ${m.hp} HP / ${m.kw.toFixed(1)} kW`}>
          <div className="grid grid-cols-4 gap-3 mb-4">
            <Kpi label="NEC FLA (480V 3ph)" value={`${m.fla_nec} A`} sub="NEC Table 430.250" />
            <Kpi label="Branch Breaker" value={`${m.motor_breaker_a} A`} sub="NEC 430.52 (250% max)" />
            <Kpi label="OL Relay Setting" value={`${m.ol_relay_a} A`} sub="NEC 430.32(A) = 115% FLA" />
            {m.run_capacitor_kvar > 0 && (
              <Kpi label="Run Capacitor" value={`${m.run_capacitor_kvar} kVAR`} sub="PF improvement option" />
            )}
          </div>

          <p className="text-[10px] text-gray-500 uppercase mb-2">Starting Method Comparison</p>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {METHOD_ORDER.map(key => {
              const md = m.methods[key];
              if (!md) return null;
              const isRec = m.recommended_method === key;
              const isSelected = m.selected_method === key;
              return (
                <div key={key} className={`rounded-lg border p-3 ${
                  isRec ? "border-yellow-600 bg-yellow-900/20"
                  : isSelected ? "border-cyan-800 bg-cyan-900/10"
                  : "border-gray-800 bg-gray-800/50"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-white">{md.label}</span>
                    {isRec && <span className="text-[9px] text-yellow-400 border border-yellow-600 px-1 rounded">REC</span>}
                    {isSelected && !isRec && <span className="text-[9px] text-cyan-400 border border-cyan-700 px-1 rounded">CURR</span>}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-gray-500">Start amps</span>
                      <span className="text-orange-300 font-mono">{md.start_amps} A</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-gray-500">Voltage dip</span>
                      <span className={`font-mono ${md.voltage_dip_pct > 15 ? "text-red-400" : md.voltage_dip_pct > 10 ? "text-yellow-400" : "text-green-400"}`}>
                        {md.voltage_dip_pct}%
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-gray-500">Start torque</span>
                      <span className="text-gray-300">{md.torque_pct}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${md.voltage_dip_pct > 15 ? "bg-red-500" : md.voltage_dip_pct > 10 ? "bg-yellow-500" : "bg-green-500"}`}
                        style={{ width: `${Math.min(md.voltage_dip_pct * 4, 100)}%` }} />
                    </div>
                    <Badge v={md.acceptable ? "ACCEPTABLE" : "EXCEEDS LIMIT"} ok={md.acceptable} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg p-3 text-xs">
            <span className="text-yellow-400 font-semibold">Recommendation: </span>
            <span className="text-gray-300">{m.recommendation_reason}</span>
          </div>
        </Panel>
      )) : !loading && (
        <div className="text-center py-16 text-gray-600 text-sm">
          Click <strong className="text-yellow-500">Analyze Motors</strong> to evaluate starting methods for all motor loads.
        </div>
      )}
    </div>
  );
}

// ── Tab 6: Protection Coordination ────────────────────────────────────────────

function TabProtection({ result, loading, error, onRun }:
  { result: any; loading?: boolean; error?: string; onRun: () => void }) {
  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-end justify-between mb-2">
        <div>
          <h1 className="text-xl font-bold text-yellow-400">Protection Coordination</h1>
          <p className="text-xs text-gray-500 mt-0.5">Feeder sizing · Breaker selectivity · THD analysis · IEEE 519 compliance</p>
        </div>
        <RunBtn onClick={onRun} loading={loading} label="Run Protection Study" />
      </div>
      <Err msg={error} />

      {result && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Kpi label="Main Service Current" value={`${result.main_service_amps.toFixed(0)} A`} />
            <Kpi label="Main Service Breaker" value={`${result.main_breaker_a} A`} sub="NEC 230.90" />
            <Kpi label="Estimated THD" value={`${result.estimated_thd_pct.toFixed(1)}%`}
              color={result.thd_compliant ? "text-green-400" : "text-red-400"}
              sub={result.thd_compliant ? "IEEE 519 compliant" : "Exceeds 5% limit"} />
          </div>

          <Panel title="Panel Feeder Protection (NEC 430.24 / 210.20)">
            <table className="w-full text-xs">
              <thead className="border-b border-gray-800">
                <tr className="text-[10px] text-gray-500 uppercase">
                  <th className="text-left py-1.5 pr-4">Panel</th>
                  <th className="text-right pr-3">Loads</th>
                  <th className="text-right pr-3">Feeder Amps</th>
                  <th className="text-right pr-3">Feeder Breaker</th>
                  <th className="text-right pr-3">Largest Branch</th>
                  <th className="text-right pr-3">Selectivity</th>
                  <th className="text-right pr-3">Ratio</th>
                </tr>
              </thead>
              <tbody>
                {result.panel_protection.map((p: any) => (
                  <tr key={p.panel} className="border-b border-gray-800/50">
                    <td className="py-1.5 pr-4 font-mono text-yellow-300">{p.panel}</td>
                    <td className="text-right pr-3 text-gray-400">{p.num_loads}</td>
                    <td className="text-right pr-3 font-mono text-gray-300">{p.feeder_amps.toFixed(0)} A</td>
                    <td className="text-right pr-3 font-mono text-cyan-300">{p.feeder_breaker_a} A</td>
                    <td className="text-right pr-3 font-mono text-gray-400">{p.max_branch_breaker_a} A</td>
                    <td className="text-right pr-3">
                      <Badge v={p.selectivity_ok ? "OK" : "FAIL"} ok={p.selectivity_ok} />
                    </td>
                    <td className="text-right pr-3 text-gray-500">{p.selectivity_ratio}x</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel title="Harmonic Distortion — IEEE 519-2022">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-gray-400">Estimated Total THD</span>
                  <span className={result.thd_compliant ? "text-green-400" : "text-red-400"}>
                    {result.estimated_thd_pct.toFixed(1)}% (limit: {result.ieee519_limit_pct}%)
                  </span>
                </div>
                <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${result.thd_compliant ? "bg-green-500" : "bg-red-500"}`}
                    style={{ width: `${Math.min(result.estimated_thd_pct / 20 * 100, 100)}%` }} />
                </div>
                <p className="text-[10px] text-gray-600 mt-2">
                  Estimated from load type mix (VFDs ~45%, UPS ~25%, welding ~30% THD contribution).
                  Install a power quality analyser for accurate measurement.
                </p>
              </div>
              <div>
                {result.filter_recommendation ? (
                  <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-xs">
                    <p className="text-red-400 font-semibold mb-1">Mitigation Required</p>
                    <p className="text-gray-300">{result.filter_recommendation}</p>
                  </div>
                ) : (
                  <div className="bg-green-900/20 border border-green-800 rounded-lg p-3 text-xs">
                    <p className="text-green-400">Estimated THD is within IEEE 519-2022 limits for this point of common coupling.</p>
                  </div>
                )}
              </div>
            </div>
          </Panel>
        </>
      )}
      {!result && !loading && (
        <div className="text-center py-16 text-gray-600 text-sm">
          Click <strong className="text-yellow-500">Run Protection Study</strong> to analyze feeder breakers, selectivity, and harmonic distortion.
        </div>
      )}
    </div>
  );
}

// ── Tab 7: AI Engineering Review ───────────────────────────────────────────────

const GRADE_STYLE: Record<string, string> = {
  "A+": "bg-green-600", "A": "bg-green-500",  "B+": "bg-teal-500",
  "B":  "bg-blue-500",  "C+": "bg-yellow-500", "C": "bg-orange-500",
  "D":  "bg-red-500",   "F":  "bg-red-700",
};
const SEV_COLORS: Record<string, string> = {
  CRITICAL: "text-red-400 border-red-800 bg-red-900/30",
  HIGH:     "text-orange-400 border-orange-800 bg-orange-900/20",
  MEDIUM:   "text-yellow-400 border-yellow-800 bg-yellow-900/20",
  LOW:      "text-blue-400 border-blue-800 bg-blue-900/20",
};

function TabAI({ config, loads, result, loading, error, onRun }:
  { config: SysConfig; loads: Load[]; result: any; loading?: boolean; error?: string; onRun: () => void }) {
  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-end justify-between mb-2">
        <div>
          <h1 className="text-xl font-bold text-yellow-400">AI Engineering Review</h1>
          <p className="text-xs text-gray-500 mt-0.5">Gemini AI · NEC 2023 · IEC 60364 · IEEE 519 · NEMA standards compliance</p>
        </div>
        <RunBtn onClick={onRun} loading={loading} label="Run AI Design Review" />
      </div>
      <Err msg={error} />

      {loading && (
        <div className="text-center py-16 text-gray-500 text-sm animate-pulse">
          Gemini is reviewing your system design against NEC, IEC, and IEEE standards...
        </div>
      )}

      {result && (
        <>
          <div className="flex items-center gap-6 bg-gray-900 rounded-xl border border-gray-800 p-5">
            <div className={`w-20 h-20 rounded-xl ${GRADE_STYLE[result.grade] ?? "bg-gray-600"} flex items-center justify-center`}>
              <span className="text-3xl font-black text-white">{result.grade}</span>
            </div>
            <div>
              <p className="text-lg font-bold text-white mb-1">{config.name}</p>
              <p className="text-sm text-gray-300 max-w-lg">{result.grade_justification}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {result.compliance_issues?.length > 0 && (
              <Panel title={`Compliance Issues (${result.compliance_issues.length})`}>
                <div className="space-y-2">
                  {result.compliance_issues.map((c: any, i: number) => (
                    <div key={i} className={`border rounded-lg p-2.5 text-xs ${SEV_COLORS[c.severity] ?? "border-gray-700"}`}>
                      <div className="flex justify-between mb-1">
                        <span className="font-semibold">{c.standard}</span>
                        <span className="text-[10px] uppercase tracking-wide opacity-70">{c.severity}</span>
                      </div>
                      <p className="mb-1">{c.description}</p>
                      <p className="opacity-70">Fix: {c.fix}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {result.safety_concerns?.length > 0 && (
              <Panel title={`Safety Concerns (${result.safety_concerns.length})`}>
                <div className="space-y-2">
                  {result.safety_concerns.map((s: any, i: number) => (
                    <div key={i} className={`border rounded-lg p-2.5 text-xs ${SEV_COLORS[s.risk_level] ?? "border-gray-700"}`}>
                      <div className="flex justify-between mb-1">
                        <span className="font-semibold">{s.risk_level} RISK</span>
                      </div>
                      <p className="mb-1">{s.description}</p>
                      <p className="opacity-70">{s.recommendation}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>

          {result.efficiency_opportunities?.length > 0 && (
            <Panel title="Efficiency Opportunities">
              <div className="space-y-2">
                {result.efficiency_opportunities.map((e: any, i: number) => (
                  <div key={i} className="bg-gray-800 rounded-lg p-3 border border-gray-700 text-xs flex gap-4">
                    <div className="flex-1">
                      <p className="font-semibold text-green-400 mb-0.5">{e.description}</p>
                      <p className="text-gray-400">{e.implementation}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-green-400 font-bold">{e.estimated_saving_pct}% savings</p>
                      {e.payback_years && <p className="text-gray-500">{e.payback_years} yr payback</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {result.design_strengths?.length > 0 && (
            <Panel title="Design Strengths">
              <ul className="space-y-1">
                {result.design_strengths.map((s: string, i: number) => (
                  <li key={i} className="text-xs text-gray-300 flex gap-2">
                    <span className="text-green-500 shrink-0">+</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {result.specific_recommendations?.length > 0 && (
            <Panel title="Specific Design Recommendations">
              <div className="space-y-2">
                {result.specific_recommendations.map((r: any, i: number) => (
                  <div key={i} className="bg-gray-800 rounded-lg p-3 text-xs border border-gray-700">
                    <div className="flex gap-3 mb-1">
                      <span className="text-cyan-400 font-mono shrink-0">{r.nec_reference}</span>
                      <span className="text-yellow-300 font-semibold">{r.component}</span>
                    </div>
                    <p className="text-gray-400 mb-1">{r.issue}</p>
                    <p className="text-gray-200">- {r.action}</p>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {result.executive_summary && (
            <Panel title="Executive Summary">
              <div className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
                {result.executive_summary}
              </div>
            </Panel>
          )}
        </>
      )}

      {!result && !loading && (
        <div className="space-y-3">
          <div className="text-center py-10 text-gray-600 text-sm">
            <p>Click <strong className="text-yellow-500">Run AI Design Review</strong> to get a comprehensive engineering review.</p>
            <p className="mt-2 text-xs">Gemini will analyze {loads.length} loads against NEC 2023, IEC 60364, IEEE 519, and NEMA standards.</p>
          </div>
          <Panel title="What the AI Review covers">
            <ul className="text-xs text-gray-400 space-y-1.5 grid grid-cols-2 gap-1">
              {[
                "Design grade (A+ to F) with justification",
                "NEC 2023 code compliance issues",
                "IEC 60364 / IEEE 519 violations",
                "Safety hazard identification",
                "Power quality and harmonic concerns",
                "Energy efficiency opportunities",
                "Motor starting and protection issues",
                "Transformer sizing adequacy",
                "Specific component recommendations",
                "Grounding and bonding assessment",
              ].map((item, i) => (
                <li key={i} className="flex gap-2"><span className="text-yellow-600">-</span>{item}</li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </div>
  );
}
