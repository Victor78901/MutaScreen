import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, ArrowLeft, ArrowRight, Atom, Beaker, Check, CheckCircle2,
  CircleHelp, Download, Dna, FlaskConical, Gauge, HeartPulse, Info,
  Menu, Moon, Search, ShieldCheck, Sparkles, Sun, Target,
  Upload, X, Zap,
} from "lucide-react";

type Molecule = {
  id: string; name: string; smiles: string; mw: number; source: string; reference: boolean;
  scores: Record<string, number>; resistance_score: number; spread: number;
  properties: { logP: number; hbd: number; hba: number; rotatable: number; tpsa: number };
  checks?: Record<string, boolean>; drug_like?: boolean;
};
type Variant = { id: string; name: string; mutation: string; pdb: string };
type UploadedMolecule = { name: string; smiles: string; source: string };

const stages = [
  { name: "Target", icon: Target, description: "Meet the changing lock" },
  { name: "Library", icon: Atom, description: "Browse possible keys" },
  { name: "Screen", icon: FlaskConical, description: "Try keys in the lock" },
  { name: "Resistance", icon: ShieldCheck, description: "Test every version" },
  { name: "Drug-likeness", icon: HeartPulse, description: "Check practical traits" },
  { name: "Shortlist", icon: CheckCircle2, description: "See promising leads" },
];
const variantFallback: Variant[] = [
  { id: "wild", name: "Wild type", mutation: "Reference target", pdb: "1J3I" },
  { id: "single", name: "S108N", mutation: "Single mutant", pdb: "1J3I" },
  { id: "double", name: "C59R + S108N", mutation: "Double mutant", pdb: "1J3I" },
  { id: "triple", name: "N51I + C59R + S108N", mutation: "Triple mutant", pdb: "1J3K" },
  { id: "quad", name: "N51I + C59R + S108N + I164L", mutation: "Quadruple mutant", pdb: "1J3K" },
];
const labels: Record<string, string> = {
  wild: "Wild type", single: "S108N", double: "C59R + S108N",
  triple: "N51I + C59R + S108N", quad: "Quadruple",
};

function ChemicalSketch({ small = false }: { small?: boolean }) {
  return <svg className={`chemical-sketch ${small ? "sketch-small" : ""}`} viewBox="0 0 150 90" role="img" aria-label="Illustrative molecule structure">
    <g fill="none" stroke="currentColor" strokeWidth="1.6" opacity=".82">
      <path d="M22 46 40 20 70 20 87 46 70 72 40 72Z M70 20 97 20 112 43 99 65 70 72 M112 43 135 31 M112 43 131 62 M40 20 31 7 M40 72 29 84 M87 46 112 43" />
      <path d="M27 45 42 24 M43 68 65 68 M74 24 91 24 M73 67 96 61" />
    </g>
    <g fill="var(--teal)" fontSize="8" fontFamily="sans-serif"><text x="24" y="9">N</text><text x="23" y="87">O</text><text x="133" y="30">N</text><text x="130" y="69">NH₂</text><text x="99" y="18">N</text></g>
    <g fill="var(--teal)" opacity=".75"><circle cx="22" cy="46" r="2"/><circle cx="112" cy="43" r="2"/></g>
  </svg>;
}

function ShapeLock({ variant, molecule, working }: { variant: number; molecule?: Molecule; working: boolean }) {
  return <div className={`lock-visual ${working ? "lock-working" : "lock-blocked"}`} aria-label={`Shape-shifting DHFR lock: ${variantFallback[variant]?.name}`}>
    <div className="lock-aura" />
    <div className="lock-shackle"><span /></div>
    <div className="lock-body"><div className="lock-keyhole" /><div className="lock-notch" /></div>
    <div className="lock-key"><span /><i /><b /></div>
    <div className="lock-label">{variantFallback[variant]?.name}</div>
    <div className="lock-status">{working ? "KEY FITS" : "LOCKED OUT"}</div>
    {molecule && <div className="lock-molecule">{molecule.name}</div>}
  </div>;
}

function App() {
  const [molecules, setMolecules] = useState<Molecule[]>([]);
  const [uploadedMolecules, setUploadedMolecules] = useState<UploadedMolecule[]>([]);
  const [variants, setVariants] = useState<Variant[]>(variantFallback);
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Molecule | null>(null);
  const [shortlist, setShortlist] = useState<string[]>([]);
  const [variantIndex, setVariantIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [hasScreened, setHasScreened] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [progress, setProgress] = useState(0);
  const [threshold, setThreshold] = useState(-7);
  const [showResistantOnly, setShowResistantOnly] = useState(false);
  const [dark, setDark] = useState(true);
  const [tour, setTour] = useState(false);
  const [notice, setNotice] = useState("");
  const [mwLimit, setMwLimit] = useState(500);
  const [mobileMenu, setMobileMenu] = useState(false);

  const load = useCallback(async () => {
    try {
      const [moleculeResponse, variantResponse] = await Promise.all([
        fetch("/api/library"), fetch("/api/variants"),
      ]);
      if (!moleculeResponse.ok || !variantResponse.ok) throw new Error("API unavailable");
      const library = await moleculeResponse.json() as { molecules: Molecule[] };
      const data = await variantResponse.json() as { variants: Variant[] };
      setMolecules(library.molecules);
      setVariants(data.variants);
    } catch {
      setNotice("The demo API is not connected. Start the app with `npm run dev` to load the bundled molecule set.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!sessionStorage.getItem("keyforge-tour-seen")) {
      const timer = window.setTimeout(() => setTour(true), 1200);
      return () => window.clearTimeout(timer);
    }
  }, []);

  const filteredMolecules = useMemo(() => molecules.filter(m =>
    `${m.name} ${m.id} ${m.smiles}`.toLowerCase().includes(query.toLowerCase())),
  [molecules, query]);
  const activeMolecule = selected ?? molecules.find(m => m.id === shortlist[0]) ?? molecules[0];
  const bindingCandidates = useMemo(() => molecules
    .filter(m => variants.every(v => m.scores[v.id] <= threshold))
    .sort((a, b) => b.resistance_score - a.resistance_score || a.spread - b.spread),
  [molecules, threshold, variants]);
  const passedThreshold = bindingCandidates.length;
  const resistanceRows = useMemo(() => {
    const rows = [...molecules].sort((a, b) => Number(b.reference) - Number(a.reference) || b.resistance_score - a.resistance_score);
    return rows.filter(m => !showResistantOnly || m.resistance_score >= 45).slice(0, 32);
  }, [molecules, showResistantOnly]);
  const best = useMemo(() => [...molecules].sort((a, b) => b.resistance_score - a.resistance_score || a.spread - b.spread).slice(0, 10), [molecules]);

  const runDemo = async () => {
    setStep(2);
    setRunning(true);
    setProgress(0);
    for (let i = 1; i <= 10; i += 1) {
      await new Promise(resolve => window.setTimeout(resolve, 360));
      setProgress(i * 10);
    }
    setHasScreened(true);
    setRunning(false);
    setStep(stages.length);
    setNotice("Screen complete — choose which passing candidates to add to your shortlist.");
    window.setTimeout(() => setNotice(""), 4500);
  };

  const toggleShortlist = (id: string) => setShortlist(current =>
    current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  const nextStep = () => setStep(current => Math.min(current + 1, stages.length));
  const showTour = () => { setTour(true); sessionStorage.setItem("keyforge-tour-seen", "1"); };
  const toggleMode = async () => {
    if (liveMode) {
      setLiveMode(false);
      await load();
      return;
    }
    if (!activeMolecule) {
      setNotice("Load a molecule before requesting live descriptors.");
      return;
    }
    try {
      const response = await fetch("/api/descriptors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smiles: activeMolecule.smiles }),
      });
      const result = await response.json() as { mw: number; logP: number; hbd: number; hba: number; rotatable: number; tpsa: number; mode: string; notice?: string; detail?: string };
      if (!response.ok) throw new Error(result.detail || "Live descriptors could not be calculated.");
      setMolecules(current => current.map(m => m.id === activeMolecule.id ? {
        ...m, mw: result.mw, properties: {
          ...m.properties, logP: result.logP, hbd: result.hbd, hba: result.hba,
          rotatable: result.rotatable, tpsa: result.tpsa,
        },
      } : m));
      setLiveMode(true);
      setNotice(result.notice || (result.mode === "live" ? "RDKit descriptors calculated for the selected molecule." : "RDKit is unavailable; approximate descriptors are shown."));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Live descriptors could not be calculated.");
    }
  };

  const intro = <section className="hero-grid">
    <div className="hero-copy">
      <div className="eyebrow"><span className="pulse-dot" /> A DRUG DISCOVERY EXPLORER</div>
      <h1>Find keys that<br /><span>keep on working.</span></h1>
      <p className="hero-lede">Malaria’s drug target keeps changing shape. Explore molecules that could still fit—across every known resistance variant.</p>
      <div className="hero-actions">
        <button className="button button-primary" onClick={() => void runDemo()} disabled={running}>
          {running ? <><Activity className="spin" size={17} /> Screening {progress}%</> : <><Zap size={17} /> Run demo pipeline</>}
        </button>
        <button className="button button-quiet" onClick={showTour}><CircleHelp size={17} /> Start guided mode</button>
      </div>
      <div className="honesty-line"><Info size={15} /><span>Research exploration only. Computer predictions are not medical advice.</span></div>
    </div>
    <div className="hero-art">
      <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
      <div className="blood-cell cell-one" /><div className="blood-cell cell-two" /><div className="blood-cell cell-three" />
      <ShapeLock variant={variantIndex} molecule={activeMolecule} working={activeMolecule ? activeMolecule.scores[variantFallback[variantIndex].id] < -6 : false} />
      <div className="shape-controls">
        <div className="shape-control-head"><span>THE SHAPE-SHIFTING LOCK</span><span>{variantIndex + 1} / 5</span></div>
        <input aria-label="Change DHFR mutation" type="range" min="0" max="4" value={variantIndex} onChange={e => setVariantIndex(Number(e.target.value))} />
        <div className="shape-control-ends"><span>Wild type</span><span>Hardest mutant</span></div>
      </div>
    </div>
    <div className="hero-stats">
      <div><strong>{molecules.length || "300"}</strong><span>keys screened</span></div>
      <div><strong>{variants.length}</strong><span>target shapes</span></div>
      <div><strong>{shortlist.length || best.length || "10"}</strong><span>promising leads</span></div>
      <div className="demo-pill"><span /> DEMO DATA</div>
    </div>
  </section>;

  const renderStage = () => {
    if (step === 0) return intro;
    const stageIndex = step - 1;
    if (stageIndex === 0) return <div className="content-grid">
      <article className="panel target-panel">
        <div className="panel-heading"><div><div className="eyebrow">01 / TARGET EXPLORER</div><h2>Meet the changing lock</h2></div><span className="tag"><Dna size={14} /> PfDHFR</span></div>
        <p className="muted">The parasite’s DHFR enzyme helps it grow. Resistance mutations reshape its binding pocket, so a drug that once fit may no longer do so.</p>
        <div className="protein-stage">
          <div className="protein-glow" /><div className="protein-ribbon ribbon-a" /><div className="protein-ribbon ribbon-b" /><div className="protein-ribbon ribbon-c" />
          <div className="pocket"><span className="pocket-label">BINDING POCKET</span><span className="residue residue-one">51</span><span className="residue residue-two">59</span><span className="residue residue-three">108</span><span className="residue residue-four">164</span></div>
          <div className="structure-caption"><span className="live-dot" /> Pocket schematic · structure fetch is optional</div>
        </div>
        <div className="select-row"><label htmlFor="variant">Target structure <span title="The target is the lock; the structure shows its shape."><Info size={14} /></span></label>
          <select id="variant" value={variantIndex} onChange={e => setVariantIndex(Number(e.target.value))}>{variants.map((v, i) => <option key={v.id} value={i}>{v.name} · PDB {v.pdb}</option>)}</select>
        </div>
      </article>
      <aside className="panel side-panel"><div className="eyebrow">MUTATION BUILDER</div><h3>Which parts changed?</h3>
        <div className="mutation-list">{["N51I", "C59R", "S108N", "I164L"].map((mutation, i) => <button key={mutation} className={`mutation-row ${variantIndex >= [3, 2, 1, 4][i] ? "mutation-active" : ""}`} onClick={() => setVariantIndex(i === 0 ? 3 : i === 1 ? 2 : i === 2 ? 1 : 4)}><span className="mutation-check">{variantIndex >= [3, 2, 1, 4][i] ? <Check size={13} /> : "+"}</span><span><b>{mutation}</b><small>{["A small swap narrows the pocket.", "A charge change reshapes the entrance.", "The classic resistance switch.", "A subtle swap shifts the deepest pocket."][i]}</small></span><ArrowRight size={15} /></button>)}</div>
        <div className="plain-note"><Sparkles size={16} /><p><b>In plain words:</b> mutations are tiny edits in the lock that can make familiar keys stop fitting.</p></div>
        <button className="button button-primary button-full" onClick={nextStep}>Explore molecule keys <ArrowRight size={16} /></button>
      </aside>
    </div>;
    if (stageIndex === 1) return <section className="panel">
      <div className="panel-heading"><div><div className="eyebrow">02 / MOLECULE LIBRARY</div><h2>Browse the keys</h2></div><button className="button button-soft" onClick={() => document.getElementById("upload")?.click()}><Upload size={16} /> Upload CSV</button><input id="upload" type="file" accept=".csv,.sdf" hidden onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return;
        const body = new FormData(); body.append("file", file);
        try { const response = await fetch("/api/upload", { method: "POST", body }); const result = await response.json() as { total: number; molecules: UploadedMolecule[]; detail?: string }; if (!response.ok) throw new Error(result.detail || "Upload failed"); setUploadedMolecules(result.molecules); setNotice(`${result.total} uploaded structures are ready to review. They do not have demo docking scores.`); }
        catch (error) { setNotice(error instanceof Error ? error.message : "Upload could not be read."); }
      }} /></div>
      <p className="muted">A demo set of {molecules.length} candidates and reference medicines. Search by name or structure notation.</p>
      <div className="toolbar"><label className="search-box"><Search size={16} /><input aria-label="Search molecules" placeholder="Search molecules…" value={query} onChange={e => setQuery(e.target.value)} /><kbd>/</kbd></label><span className="tag">{filteredMolecules.length} molecules</span></div>
      <div className="table-scroll"><table><thead><tr><th>MOLECULE</th><th>STRUCTURE</th><th>WEIGHT</th><th>ORIGIN</th><th>WORST BINDING</th></tr></thead><tbody>{filteredMolecules.slice(0, 18).map(m => <tr key={m.id} onClick={() => setSelected(m)} tabIndex={0} onKeyDown={e => e.key === "Enter" && setSelected(m)}><td><b>{m.name}</b><small>{m.id} {m.reference && <span className="reference-badge">CONTROL</span>}</small></td><td><ChemicalSketch small /></td><td>{m.mw.toFixed(0)} <small>g/mol</small></td><td>{m.source}</td><td className={m.scores.quad <= -7 ? "score-good" : "score-warn"}>{m.scores.quad.toFixed(1)} <small>kcal/mol</small></td></tr>)}</tbody></table></div>
      <div className="table-footer">Showing the first 18 matches · Select a molecule to inspect its profile</div>
      {uploadedMolecules.length > 0 && <div className="upload-preview"><div className="eyebrow">UPLOADED STRUCTURES · {uploadedMolecules.length}</div><p className="muted">Your structures are kept separate from demo scores. Live descriptors are available by selecting a demo molecule in this version.</p>{uploadedMolecules.slice(0, 5).map((m, i) => <div className="uploaded-row" key={`${m.name}-${i}`}><b>{m.name}</b><code>{m.smiles}</code></div>)}</div>}
      <div className="next-row"><span className="plain-note inline-note"><Info size={15} /> SMILES is a compact text recipe for a molecule’s structure.</span><button className="button button-primary" onClick={nextStep}>Next: virtual screening <ArrowRight size={16} /></button></div>
    </section>;
    if (stageIndex === 2) return <section className="content-grid">
      <article className="panel"><div className="eyebrow">03 / VIRTUAL SCREENING</div><h2>Try each key in the lock</h2><p className="muted">“Docking” is a computer estimate of how snugly a molecule may sit in a target pocket. Lower (more negative) scores indicate a closer predicted fit.</p>
        <div className="screen-hero"><div className="screen-icon"><FlaskConical size={30} /></div><div><span className="eyebrow">SIMULATED SCREENING</span><h3>{running ? `${progress * 3} / 300 molecules screened` : `${molecules.length} molecules ready`}</h3><p>{running ? "Comparing keys against five target shapes…" : "This demo uses bundled scores; no docking software is required."}</p></div><Gauge size={28} className="screen-gauge" /></div>
        <div className="progress-track"><span style={{ width: `${running ? progress : 100}%` }} /></div>
        <div className="screen-metrics"><div><span>Best wild-type fit</span><b>{Math.min(...molecules.map(m => m.scores.wild), -9.2).toFixed(1)} <small>kcal/mol</small></b></div><div><span>Pass all five shapes</span><b>{passedThreshold} <small>molecules</small></b></div><div><span>Mutants tested</span><b>5 <small>shapes</small></b></div></div>
        <div className="range-setting"><label htmlFor="score-threshold">Binding score threshold · every target shape <span title="A more negative number means a predicted tighter fit. A candidate must meet this threshold on all five shapes."><Info size={14} /></span></label><strong>{threshold.toFixed(1)} kcal/mol</strong><input id="score-threshold" type="range" min="-10" max="-4" step=".1" value={threshold} onChange={e => setThreshold(Number(e.target.value))} /><div className="scale-note"><span>Stricter · −10</span><span>More permissive · −4</span></div></div>
        <button className="button button-primary" disabled={running} onClick={() => void runDemo()}><Zap size={16} /> {running ? "Screening…" : "Run screening demo"}</button>
      </article>
      <aside className="panel side-panel"><div className="eyebrow">TOP OF THE QUEUE</div><h3>Strongest broad binders</h3>{best.slice(0, 5).map((m, i) => <button className="leader-row" key={m.id} onClick={() => setSelected(m)}><span className="leader-rank">0{i + 1}</span><span><b>{m.name}</b><small>Resistance-proof score {m.resistance_score}</small></span><strong>{m.scores.quad.toFixed(1)}</strong></button>)}<div className="plain-note"><Info size={16} /><p><b>Demo mode:</b> scores are illustrative estimates, not experimental measurements.</p></div></aside>
    </section>;
    if (stageIndex === 3) return <section className="panel">
      <div className="panel-heading"><div><div className="eyebrow">04 / RESISTANCE TEST</div><h2>Only keep keys that still fit</h2></div><label className="switch-label"><input type="checkbox" checked={showResistantOnly} onChange={e => setShowResistantOnly(e.target.checked)} /><span className="switch" /> All-variant winners</label></div>
      <p className="muted">Compare predicted binding across all five target shapes. Green is a closer predicted fit; amber means weaker binding. “Resistance-proof” rewards strong worst-case fit and a small score spread.</p>
      <div className="matrix-legend"><span><i className="legend-good" /> Stronger predicted fit</span><span><i className="legend-mid" /> Less strong</span><span><i className="legend-bad" /> Weak fit</span><span className="plain-note inline-note"><Info size={14} /> Hover cells for details · click rows to inspect</span></div>
      <div className="heat-scroll"><table className="heat-table"><thead><tr><th>MOLECULE</th>{variants.map(v => <th key={v.id}>{labels[v.id]}</th>)}<th>RESISTANCE<br /> SCORE</th></tr></thead><tbody>{resistanceRows.map(m => <tr key={m.id} onClick={() => setSelected(m)}><td><b>{m.name}</b>{m.reference && <span className="reference-badge"> REF</span>}</td>{variants.map(v => <td key={v.id} title={`${m.name} · ${v.name}: ${m.scores[v.id]} kcal/mol`}><span className={`heat-cell ${m.scores[v.id] <= -8 ? "heat-best" : m.scores[v.id] <= -6.5 ? "heat-mid" : "heat-low"}`}>{m.scores[v.id].toFixed(1)}</span></td>)}<td><b className={m.resistance_score > 55 ? "score-good" : "score-warn"}>{m.resistance_score}</b></td></tr>)}</tbody></table></div>
      <div className="table-footer">Reference medicines stay pinned at the top. Displaying {resistanceRows.length} rows.</div><div className="next-row"><span className="mini-stat"><ShieldCheck size={16} /> {best.filter(m => m.resistance_score >= 45).length} broad-binding candidates</span><button className="button button-primary" onClick={nextStep}>Check drug-likeness <ArrowRight size={16} /></button></div>
    </section>;
    if (stageIndex === 4) {
      const passCount = molecules.filter(m => m.mw <= mwLimit && m.properties.logP <= 5 && m.properties.hbd <= 5 && m.properties.hba <= 10).length;
      return <section className="content-grid">
        <article className="panel"><div className="eyebrow">05 / DRUG-LIKENESS FILTER</div><h2>Could a key be practical?</h2><p className="muted">Simple chemistry guidelines flag molecules that may be harder to develop. Passing these checks does not mean a drug is safe or effective.</p>
          <div className="filter-controls"><label htmlFor="mw-limit">Maximum molecular weight <b>{mwLimit} g/mol</b></label><input id="mw-limit" type="range" min="300" max="650" step="10" value={mwLimit} onChange={e => setMwLimit(Number(e.target.value))} /></div>
          <div className="rules-grid">{[["Weight", "Under 500 g/mol", "Small enough to travel more easily"], ["Grease balance", "LogP under 5", "Not too water-shy"], ["H-bond donors", "5 or fewer", "A useful balance for reaching cells"], ["H-bond acceptors", "10 or fewer", "Not too many sticky points"], ["PAINS alerts", "No obvious alert", "Avoids some known assay-interfering patterns"]].map(([title, rule, explanation], i) => <div className="rule-card" key={title}><span className={`rule-icon ${i === 4 ? "rule-amber" : ""}`}><Check size={15} /></span><div><b>{title}</b><small>{rule} · {explanation}</small></div></div>)}</div>
          <div className="filter-count"><div><span>Pass these simple checks</span><b>{passCount} <small>/ {molecules.length}</small></b></div><div className="pass-track"><i style={{ width: `${passCount / Math.max(molecules.length, 1) * 100}%` }} /></div></div>
          <div className="plain-note"><Info size={16} /><p>The Rule of Five is a rough early filter, not a measure of clinical success. Demo property values are illustrative.</p></div>
        </article><aside className="panel side-panel"><div className="eyebrow">SELECTED MOLECULE</div>{activeMolecule ? <><ChemicalSketch /><h3>{activeMolecule.name}</h3><div className="property-grid"><span>Weight<b>{activeMolecule.mw} g/mol</b></span><span>LogP<b>{activeMolecule.properties.logP}</b></span><span>Donors<b>{activeMolecule.properties.hbd}</b></span><span>Acceptors<b>{activeMolecule.properties.hba}</b></span></div><button className="button button-primary button-full" onClick={nextStep}>Build my shortlist <ArrowRight size={16} /></button></> : <p className="muted">Load the demo library to inspect a molecule.</p>}</aside>
      </section>;
    }
    const selectedCandidates = hasScreened
      ? bindingCandidates
      : shortlist.length ? molecules.filter(m => shortlist.includes(m.id)) : best.slice(0, 5);
    return <section className="shortlist-view">
      <div className="shortlist-heading"><div><div className="eyebrow"><span className="pulse-dot" /> 06 / {hasScreened ? "SCREENING RESULTS" : "FINAL SHORTLIST"}</div><h2>{hasScreened ? `${bindingCandidates.length} candidates passed` : "Promising keys, not promises."}</h2><p className="muted">{hasScreened ? `Showing candidates that meet the ${threshold.toFixed(1)} kcal/mol threshold across all five target shapes. Select the molecules you want to add to your shortlist.` : "A first-pass shortlist of molecules predicted to keep binding as the target changes."}</p></div><a className="button button-soft" href="/api/export.csv" download><Download size={16} /> Export CSV</a></div>
      {hasScreened && <div className="selection-summary"><CheckCircle2 size={16} /> {shortlist.length} selected for your shortlist</div>}
      {selectedCandidates.length > 0 ? <div className="candidate-grid">{selectedCandidates.map((m, i) => <motion.article layout key={m.id} className={`candidate-card ${shortlist.includes(m.id) ? "is-selected" : ""}`} onClick={() => setSelected(m)} whileHover={{ y: -4 }}>
        <div className="candidate-card-top"><span className="candidate-index">0{i + 1}</span><span className="candidate-score"><ShieldCheck size={14} /> {m.resistance_score} <small>resilience</small></span></div>
        <ChemicalSketch /><h3>{m.name}</h3><p>{m.reference ? "Known reference · included for comparison" : "Across-the-board predicted pocket fit"}</p>
        <div className="score-chips">{variants.map(v => <span key={v.id} className={m.scores[v.id] <= -7 ? "chip-good" : "chip-warn"} title={`${v.name}: ${m.scores[v.id]} kcal/mol`}>{labels[v.id].split(" ")[0]} <b>{m.scores[v.id].toFixed(1)}</b></span>)}</div>
        <div className="why-box"><Sparkles size={14} /><span><b>Why it stands out:</b> {m.spread < 2 ? "Its predicted fit stays steady across changing target shapes." : "It has one of the stronger worst-case fits in this demo set."}</span></div>
        <button className={`shortlist-control ${shortlist.includes(m.id) ? "is-added" : ""}`} onClick={e => { e.stopPropagation(); toggleShortlist(m.id); }}>{shortlist.includes(m.id) ? <><Check size={15} /> On your shortlist</> : <>+ Add to shortlist</>}</button>
      </motion.article>)}</div> : <div className="empty-candidates"><h3>No candidates passed this filter</h3><p>Return to virtual screening and make the threshold more permissive to see more possible binders.</p><button className="button button-soft" onClick={() => setStep(3)}>Adjust binding threshold</button></div>}
      <div className="honest-panel"><div className="honest-icon"><Info size={20} /></div><div><b>Honest limits</b><p>Docking scores are estimates. Demo data and rankings are illustrative—not lab results. Laboratory testing, safety studies, and clinical trials are still required before any medicine can be considered for people.</p></div></div>
      <div className="next-row"><button className="button button-quiet" onClick={() => setStep(0)}><ArrowLeft size={16} /> Back to mission</button><button className="button button-soft" onClick={() => void runDemo()}><Zap size={16} /> Run again</button></div>
    </section>;
  };

  return <div className={`app-shell ${dark ? "theme-dark" : "theme-light"}`}>
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="topbar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setStep(0); }}><span className="brand-mark"><Atom size={21} /></span><span><span className="brand-name">MUTA<span>SCREEN</span></span><small>BEATING MALARIA RESISTANCE</small></span></a>
      <div className="topbar-right"><button className={`mode-badge mode-toggle ${liveMode ? "mode-live" : ""}`} aria-label={liveMode ? "Switch back to demo data" : "Calculate live descriptors for selected molecule"} onClick={() => void toggleMode()}><span /> {liveMode ? "LIVE DESCRIPTORS" : "DEMO MODE"}</button><button className="icon-button help-button" aria-label="Open guided tour" onClick={showTour}><CircleHelp size={18} /></button><button className="icon-button" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={() => setDark(!dark)}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button><button className="icon-button mobile-toggle" aria-label="Toggle navigation" onClick={() => setMobileMenu(!mobileMenu)}><Menu size={18} /></button></div>
    </header>
    <nav className={`stepper ${mobileMenu ? "stepper-open" : ""}`} aria-label="Pipeline steps">
      <button className={`stepper-home ${step === 0 ? "step-active" : step > 0 ? "step-done" : ""}`} onClick={() => { setStep(0); setMobileMenu(false); }}><span className="step-number">{step > 0 ? <Check size={13} /> : "✦"}</span><span>Mission</span></button>
      <div className="stepper-line" />
      {stages.map((stage, i) => { const Icon = stage.icon; const value = i + 1; return <button key={stage.name} className={`step-item ${step === value ? "step-active" : step > value ? "step-done" : ""}`} aria-current={step === value ? "step" : undefined} onClick={() => { setStep(value); setMobileMenu(false); }}><span className="step-number">{step > value ? <Check size={13} /> : <Icon size={14} />}</span><span>{stage.name}</span></button>; })}
      <div className="stepper-progress"><span style={{ width: `${step / stages.length * 100}%` }} /></div>
    </nav>
    <main className="main-content">
      <AnimatePresence mode="wait"><motion.div key={step} className="stage-container" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .24 }}>{renderStage()}</motion.div></AnimatePresence>
      {step > 0 && step < stages.length && <div className="sticky-next"><span><span className="mini-progress"><i style={{ width: `${step / stages.length * 100}%` }} /></span>Step {step} of {stages.length}</span><button className="button button-primary" onClick={nextStep}>Next step <ArrowRight size={15} /></button></div>}
    </main>
    <footer className="footer"><span><Beaker size={14} /> Built for exploration, not clinical decisions.</span><span>MutaScreen · Demo dataset · No patient data</span></footer>

    <AnimatePresence>{selected && <><motion.button className="drawer-backdrop" aria-label="Close molecule details" onClick={() => setSelected(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} /><motion.aside className="detail-drawer" role="dialog" aria-modal="true" aria-label={`${selected.name} molecule details`} initial={{ x: 460 }} animate={{ x: 0 }} exit={{ x: 460 }} transition={{ type: "spring", damping: 29, stiffness: 240 }}>
      <div className="drawer-header"><div><span className="eyebrow">MOLECULE PROFILE · {selected.id}</span><h2>{selected.name}</h2></div><button className="icon-button" aria-label="Close details" onClick={() => setSelected(null)}><X size={19} /></button></div>
      <div className="drawer-structure"><ChemicalSketch /></div><div className="smiles-box"><span>STRUCTURE RECIPE · SMILES</span><code>{selected.smiles}</code></div>
      <h3>Fit across target shapes</h3><div className="drawer-scores">{variants.map(v => <div key={v.id}><span>{v.name}</span><b className={selected.scores[v.id] <= -7 ? "score-good" : "score-warn"}>{selected.scores[v.id].toFixed(1)} <small>kcal/mol</small></b></div>)}</div>
      <h3>Quick properties</h3><div className="property-grid"><span>Weight<b>{selected.mw} g/mol</b></span><span>Grease balance<b>{selected.properties.logP} LogP</b></span><span>H-bond donors<b>{selected.properties.hbd}</b></span><span>H-bond acceptors<b>{selected.properties.hba}</b></span></div>
      <div className="resilience-card"><ShieldCheck size={18} /><span>Resistance-proof score</span><b>{selected.resistance_score}/100</b></div>
      <p className="drawer-caveat">Scores and descriptors in this demo are illustrative and should not be used to make treatment decisions.</p>
      <button className={`button ${shortlist.includes(selected.id) ? "button-soft" : "button-primary"} button-full`} onClick={() => toggleShortlist(selected.id)}>{shortlist.includes(selected.id) ? <><Check size={16} /> Remove from shortlist</> : <>+ Add to shortlist</>}</button>
    </motion.aside></>}</AnimatePresence>

    <AnimatePresence>{tour && <motion.div className="tour-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.div className="tour-card" initial={{ y: 18, scale: .97 }} animate={{ y: 0, scale: 1 }}><button className="icon-button tour-close" aria-label="Close tour" onClick={() => { setTour(false); sessionStorage.setItem("keyforge-tour-seen", "1"); }}><X size={18} /></button><div className="tour-mark"><Sparkles size={22} /></div><span className="eyebrow">WELCOME TO MUTASCREEN</span><h2>A guided tour of changing locks and clever keys.</h2><p>This explorer compares candidate molecules against five shapes of the malaria parasite’s DHFR target. Follow the steps, or run the demo pipeline to jump straight to a shortlist.</p><div className="tour-steps"><span><i>1</i> Explore the target</span><span><i>2</i> Compare molecule fits</span><span><i>3</i> Review promising leads</span></div><button className="button button-primary button-full" onClick={() => { setTour(false); sessionStorage.setItem("keyforge-tour-seen", "1"); setStep(1); }}>Show me around <ArrowRight size={16} /></button><button className="skip-tour" onClick={() => { setTour(false); sessionStorage.setItem("keyforge-tour-seen", "1"); }}>Maybe later</button></motion.div></motion.div>}</AnimatePresence>
    <AnimatePresence>{notice && <motion.div className="toast" role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}><CheckCircle2 size={17} />{notice}<button aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={15} /></button></motion.div>}</AnimatePresence>
  </div>;
}

export default App;
