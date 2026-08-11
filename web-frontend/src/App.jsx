import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  CircleUserRound,
  Cloud,
  CloudOff,
  Database,
  Download,
  FileImage,
  FlaskConical,
  History,
  Home,
  ImagePlus,
  Info,
  Leaf,
  Menu,
  MoreHorizontal,
  RefreshCw,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  LogOut,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { diseases, getDisease, seedDiagnoses } from './data';
import { analyzeLeaf } from './services/inferenceService';
import { api, authenticate, getToken, logout, setToken } from './services/api';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'scan', label: 'New diagnosis', icon: ScanLine },
  { id: 'history', label: 'Diagnosis history', icon: History },
  { id: 'library', label: 'Disease library', icon: BookOpen },
  { id: 'research', label: 'Research metrics', icon: BarChart3 },
];

const formatDate = (date, includeTime = false) =>
  new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(new Date(date));

function IconButton({ label, children, className = '', ...props }) {
  return (
    <button className={`icon-button ${className}`} aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

function StatusPill({ disease }) {
  return <span className={`status-pill ${disease.tone}`}>{disease.name}</span>;
}

function Sidebar({ active, setActive, open, onClose, user, onProfile }) {
  return (
    <>
      {open && <button className="scrim" aria-label="Close menu" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'is-open' : ''}`}>
        <div className="brand">
          <span className="brand-mark"><Leaf size={22} strokeWidth={2.3} /></span>
          <span><strong>BananaCare</strong><small>Field Intelligence</small></span>
        </div>

        <div className="workspace-label">Workspace</div>
        <nav className="side-nav" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={active === item.id ? 'active' : ''}
                onClick={() => { setActive(item.id); onClose(); }}
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-spacer" />
        <div className="field-mode">
          <span className="field-icon"><ShieldCheck size={18} /></span>
          <div><strong>Field mode ready</strong><small>Offline model available</small></div>
          <Check size={16} />
        </div>
        <button className="profile-button" onClick={onProfile}>
          <span className="avatar">{user?.name?.split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase()}</span>
          <span><strong>{user?.name}</strong><small>{user?.role}</small></span>
          <MoreHorizontal size={18} />
        </button>
      </aside>
    </>
  );
}

function Topbar({ title, isOnline, onMenu, onProfile, onLogout }) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <IconButton label="Open navigation" className="menu-button" onClick={onMenu}><Menu size={21} /></IconButton>
        <div><span className="breadcrumb">BANANACARE /</span><strong>{title}</strong></div>
      </div>
      <div className="topbar-actions">
        <span className={`connectivity ${isOnline ? '' : 'offline'}`}>
          {isOnline ? <Cloud size={16} /> : <CloudOff size={16} />}
          {isOnline ? 'Online' : 'Offline'}
        </span>
        <IconButton label="User profile" onClick={onProfile}><CircleUserRound size={20} /></IconButton>
        <IconButton label="Log out" onClick={onLogout}><LogOut size={19} /></IconButton>
      </div>
    </header>
  );
}

function Metric({ label, value, detail, icon: Icon, tone = '' }) {
  return (
    <div className="metric">
      <span className={`metric-icon ${tone}`}><Icon size={20} /></span>
      <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    </div>
  );
}

function EmptyLeaf({ size = 'normal' }) {
  return <div className={`leaf-placeholder ${size}`}><Leaf size={size === 'small' ? 18 : 28} /></div>;
}

function DiagnosisRow({ record, onOpen }) {
  const disease = getDisease(record.diseaseId);
  return (
    <button className="diagnosis-row" onClick={() => onOpen(record)}>
      <span className="record-image">
        {record.image ? <img src={record.image} alt="Banana leaf sample" /> : <EmptyLeaf size="small" />}
      </span>
      <span className="record-main"><strong>{disease.name}</strong><small>{record.id} · {record.source}</small></span>
      <span className="confidence-cell"><strong>{record.confidence.toFixed(1)}%</strong><small>confidence</small></span>
      <span className="date-cell"><strong>{formatDate(record.date)}</strong><small>{record.location}</small></span>
      <span className="sync-cell">{record.synced ? <Cloud size={15} /> : <CloudOff size={15} />}{record.synced ? 'Synced' : 'Local'}</span>
      <ChevronRight className="row-chevron" size={18} />
    </button>
  );
}

function Overview({ records, setActive, onOpen }) {
  const counts = records.reduce((acc, record) => ({ ...acc, [record.diseaseId]: (acc[record.diseaseId] || 0) + 1 }), {});
  const diseased = records.filter((record) => record.diseaseId !== 'healthy').length;
  const averageConfidence = records.length ? records.reduce((sum, record) => sum + record.confidence, 0) / records.length : 0;
  const averageLatency = records.length ? records.reduce((sum, record) => sum + (record.latency || 0), 0) / records.length : 0;
  return (
    <div className="page-stack">
      <section className="welcome-row">
        <div><p className="eyebrow">FIELD OVERVIEW</p><h1>Good morning, Ana.</h1><p>Monitor leaf health and capture a new field diagnosis.</p></div>
        <button className="primary-button" onClick={() => setActive('scan')}><ScanLine size={19} />New diagnosis</button>
      </section>

      <section className="metrics-grid" aria-label="Diagnosis summary">
        <Metric label="Total diagnoses" value={records.length} detail="Your database records" icon={Database} />
        <Metric label="Disease detected" value={`${records.length ? ((diseased / records.length) * 100).toFixed(1) : '0.0'}%`} detail={`${diseased} of ${records.length} samples`} icon={AlertTriangle} tone="amber" />
        <Metric label="Average confidence" value={`${averageConfidence.toFixed(1)}%`} detail="Across your diagnoses" icon={Activity} tone="green" />
        <Metric label="Average latency" value={`${averageLatency.toFixed(0)} ms`} detail="Recorded inference time" icon={FlaskConical} tone="blue" />
      </section>

      <section className="overview-grid">
        <div className="scan-callout">
          <div className="scan-copy">
            <span className="section-kicker"><Sparkles size={15} />Enhanced MobileNetV3</span>
            <h2>Check a banana leaf in seconds</h2>
            <p>Use a clear photo of one leaf. Diagnosis works on-device and can sync when a connection is available.</p>
            <div className="scan-actions">
              <button className="primary-button" onClick={() => setActive('scan')}><Camera size={18} />Capture or upload</button>
              <button className="text-button" onClick={() => setActive('library')}>View disease guide<ChevronRight size={17} /></button>
            </div>
          </div>
          <div className="scan-visual" aria-hidden="true">
            <div className="focus-corner top-left" /><div className="focus-corner top-right" />
            <Leaf size={72} strokeWidth={1.25} />
            <div className="focus-corner bottom-left" /><div className="focus-corner bottom-right" />
          </div>
        </div>

        <div className="panel distribution-panel">
          <div className="panel-heading"><div><span className="section-label">CLASS DISTRIBUTION</span><h3>Diagnosis mix</h3></div><span className="period">Last 30 days</span></div>
          <div className="distribution-list">
            {diseases.map((disease, index) => {
              const values = diseases.map((item) => records.length ? ((counts[item.id] || 0) / records.length) * 100 : 0);
              return (
                <div className="distribution-item" key={disease.id}>
                  <span className={`legend-dot c${index}`} /><span>{disease.name}</span>
                  <div className="bar-track"><span className={`bar-fill c${index}`} style={{ width: `${values[index]}%` }} /></div>
                  <strong>{values[index]}%</strong>
                </div>
              );
            })}
          </div>
          <div className="distribution-total"><span><strong>{records.length}</strong>Total samples</span><span><strong>{counts['black-sigatoka'] || 0}</strong>Black Sigatoka</span></div>
        </div>
      </section>

      <section className="panel records-panel">
        <div className="panel-heading">
          <div><span className="section-label">LATEST ACTIVITY</span><h3>Recent diagnoses</h3></div>
          <button className="text-button" onClick={() => setActive('history')}>View all<ChevronRight size={17} /></button>
        </div>
        <div className="diagnosis-list">{records.slice(0, 4).map((record) => <DiagnosisRow key={record.id} record={record} onOpen={onOpen} />)}</div>
      </section>
    </div>
  );
}

function ScanWorkspace({ onSaved, setActive }) {
  const inputRef = useRef(null);
  const [image, setImage] = useState(null);
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);

  const useFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (image?.startsWith('blob:')) URL.revokeObjectURL(image);
    setImage(URL.createObjectURL(file));
    setFileName(file.name);
    setResult(null);
    setStatus('ready');
  };

  const useSample = () => {
    setImage('/assets/black-sigatoka-sample.png');
    setFileName('black-sigatoka-sample.png');
    setResult(null);
    setStatus('ready');
  };

  const runAnalysis = async () => {
    setStatus('analyzing');
    const output = await analyzeLeaf(image);
    setResult(output);
    setStatus('complete');
  };

  const saveResult = async () => {
    const record = {
      id: `DX-${1050 + Math.floor(Math.random() * 8000)}`,
      diseaseId: result.diseaseId,
      confidence: result.confidence,
      latency: result.latency,
      date: new Date().toISOString(),
      location: 'Current field location',
      source: 'Web',
      synced: navigator.onLine,
      model: result.model,
      image: image === '/assets/black-sigatoka-sample.png' ? image : null,
    };
    try { await onSaved(record); setActive('history'); }
    catch (exception) { window.alert(exception.message || 'The diagnosis could not be saved.'); }
  };

  const reset = () => {
    if (image?.startsWith('blob:')) URL.revokeObjectURL(image);
    setImage(null); setFileName(''); setResult(null); setStatus('idle');
  };

  if (status === 'complete' && result) {
    return <DiagnosisResult image={image} result={result} onReset={reset} onSave={saveResult} />;
  }

  return (
    <div className="scan-page page-stack">
      <section className="page-heading">
        <div><p className="eyebrow">NEW DIAGNOSIS</p><h1>Scan a banana leaf</h1><p>Upload a clear image with the leaf surface visible and in focus.</p></div>
        <span className="model-badge"><span />EMV3-INT8 v1.4</span>
      </section>

      <section className="scan-grid">
        <div className="panel upload-panel">
          <div className="step-heading"><span>1</span><div><h3>Add a leaf image</h3><p>JPG, PNG, or WEBP up to 10 MB</p></div></div>
          {!image ? (
            <div
              className={`drop-zone ${dragging ? 'dragging' : ''}`}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); useFile(event.dataTransfer.files[0]); }}
            >
              <span className="upload-icon"><ImagePlus size={28} /></span>
              <h3>Drop a leaf image here</h3>
              <p>or select one from your device</p>
              <button className="secondary-button" onClick={() => inputRef.current?.click()}><Upload size={17} />Choose image</button>
              <button className="sample-link" onClick={useSample}>Try the sample image</button>
              <input ref={inputRef} type="file" accept="image/*" hidden onChange={(event) => useFile(event.target.files[0])} />
            </div>
          ) : (
            <div className="image-preview">
              <img src={image} alt="Selected banana leaf" />
              {status === 'analyzing' && <div className="analyzing-overlay"><span className="scan-line" /><span className="loader" /><strong>Analyzing leaf tissue...</strong><small>Running the demo inference adapter</small></div>}
              <div className="image-toolbar"><span><FileImage size={16} />{fileName}</span><IconButton label="Remove image" onClick={reset}><Trash2 size={17} /></IconButton></div>
            </div>
          )}
          <div className="quality-row">
            <span><Check size={16} />One leaf</span><span><Check size={16} />Natural light</span><span><Check size={16} />Sharp focus</span>
          </div>
        </div>

        <div className="panel analysis-panel">
          <div className="step-heading"><span>2</span><div><h3>Run diagnosis</h3><p>Review image readiness before analysis</p></div></div>
          <div className="readiness-card">
            <span className={image ? 'ready' : ''}>{image ? <Check size={22} /> : <ImagePlus size={22} />}</span>
            <div><strong>{image ? 'Image ready' : 'Waiting for image'}</strong><small>{image ? 'The selected file can be analyzed.' : 'Add a clear banana leaf photo to continue.'}</small></div>
          </div>
          <dl className="model-details">
            <div><dt>Inference</dt><dd>Enhanced MobileNetV3</dd></div>
            <div><dt>Classes</dt><dd>5 leaf conditions</dd></div>
            <div><dt>Processing</dt><dd><ShieldCheck size={15} />Local demo</dd></div>
          </dl>
          <div className="notice"><Info size={17} /><p>This prototype returns a simulated result until the trained model or inference API is connected.</p></div>
          <button className="primary-button full" disabled={!image || status === 'analyzing'} onClick={runAnalysis}>
            {status === 'analyzing' ? <><RefreshCw className="spin" size={18} />Analyzing...</> : <><ScanLine size={18} />Analyze leaf</>}
          </button>
        </div>
      </section>
    </div>
  );
}

function DiagnosisResult({ image, result, onReset, onSave }) {
  const disease = getDisease(result.diseaseId);
  return (
    <div className="result-page page-stack">
      <section className="page-heading result-heading">
        <div><button className="back-button" onClick={onReset}><ArrowLeft size={17} />New scan</button><p className="eyebrow">DIAGNOSIS COMPLETE</p><h1>Analysis result</h1></div>
        <div className="result-actions"><button className="secondary-button"><Download size={17} />Export</button><button className="primary-button" onClick={onSave}><Database size={17} />Save diagnosis</button></div>
      </section>

      <section className="result-grid">
        <div className="panel evidence-panel">
          <div className="panel-heading"><div><span className="section-label">VISUAL EVIDENCE</span><h3>Model attention</h3></div><span className="demo-chip">Demo overlay</span></div>
          <div className="compare-images">
            <figure><img src={image} alt="Original banana leaf" /><figcaption>Original image</figcaption></figure>
            <figure className="heatmap"><img src={image} alt="Banana leaf with attention overlay" /><span className="heat-overlay" /><figcaption>Attention preview</figcaption></figure>
          </div>
          <p className="evidence-note"><Info size={16} />Highlighted regions represent a visualization placeholder. Connect the Python Grad-CAM output for research use.</p>
        </div>

        <div className="panel result-summary">
          <div className="result-state"><span><AlertTriangle size={22} /></span><div><small>DISEASE DETECTED</small><h2>{disease.name}</h2><p><i>{disease.scientific}</i></p></div></div>
          <div className="confidence-score"><div><span>Model confidence</span><strong>{result.confidence.toFixed(1)}%</strong></div><div className="confidence-track"><span style={{ width: `${result.confidence}%` }} /></div><small>High-confidence prediction</small></div>
          <div className="result-meta"><span><small>Inference time</small><strong>{result.latency} ms</strong></span><span><small>Model</small><strong>{result.model}</strong></span></div>
          <div className="probability-list">
            <span className="section-label">ALL CLASS SCORES</span>
            {result.probabilities.map((item, index) => <div key={item.label}><span>{item.label}</span><i><b style={{ width: `${item.value}%` }} /></i><strong>{item.value.toFixed(1)}%</strong></div>)}
          </div>
        </div>
      </section>

      <section className="guidance-grid">
        <div className="panel guidance-panel"><span className="section-label">ABOUT THIS CONDITION</span><h3>{disease.summary}</h3><ul>{disease.symptoms.map((symptom) => <li key={symptom}><span /><p>{symptom}</p></li>)}</ul></div>
        <div className="panel action-panel"><span className="action-icon"><ShieldCheck size={21} /></span><div><span className="section-label">RECOMMENDED NEXT ACTION</span><h3>Protect nearby plants</h3><p>{disease.management}</p><button className="text-button">Open full disease guide<ChevronRight size={17} /></button></div></div>
      </section>
    </div>
  );
}

function HistoryPage({ records, onOpen, onDelete }) {
  const [query, setQuery] = useState('');
  const filtered = records.filter((record) => {
    const disease = getDisease(record.diseaseId);
    return `${record.id} ${disease.name} ${record.location}`.toLowerCase().includes(query.toLowerCase());
  });
  return (
    <div className="page-stack">
      <section className="page-heading"><div><p className="eyebrow">RECORDS</p><h1>Diagnosis history</h1><p>Review field scans saved across mobile and web devices.</p></div><button className="secondary-button"><Download size={17} />Export CSV</button></section>
      <section className="panel history-panel">
        <div className="history-tools"><label className="search-box"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search diagnosis, ID, or location" /></label><span>{filtered.length} records</span></div>
        <div className="history-table-head"><span>Diagnosis</span><span>Confidence</span><span>Date & location</span><span>Sync status</span><span /></div>
        <div className="diagnosis-list">
          {filtered.map((record) => <div className="history-row-wrap" key={record.id}><DiagnosisRow record={record} onOpen={onOpen} /><IconButton label={`Delete ${record.id}`} className="delete-row" onClick={(event) => { event.stopPropagation(); onDelete(record.id); }}><Trash2 size={16} /></IconButton></div>)}
        </div>
        {!filtered.length && <div className="empty-state"><Search size={26} /><h3>No matching records</h3><p>Try a disease name, record ID, or field location.</p></div>}
      </section>
    </div>
  );
}

function LibraryPage() {
  const [catalog, setCatalog] = useState([]); const [selected, setSelected] = useState(null); const [loaded, setLoaded] = useState(false);
  useEffect(() => { api('/diseases').then((payload) => { const items = payload.data.map((item) => ({ id: item.slug, name: item.name, scientific: item.scientific_name || '', tone: item.slug === 'healthy' ? 'healthy' : 'warning', summary: item.description, symptoms: item.symptoms, management: item.management })); setCatalog(items); setSelected(items[0] || null); }).catch(() => setCatalog([])).finally(() => setLoaded(true)); }, []);
  return (
    <div className="page-stack">
      <section className="page-heading"><div><p className="eyebrow">REFERENCE</p><h1>Disease library</h1><p>Disease information managed by the central API.</p></div></section>
      {!loaded && <div className="empty-state"><RefreshCw className="spin" size={25} /><p>Loading disease information…</p></div>}
      {loaded && !selected && <div className="empty-state"><BookOpen size={26} /><h3>No disease records</h3><p>An administrator can add records after the final label map is available.</p></div>}
      {selected && <section className="library-layout">
        <div className="disease-tabs" role="tablist">
          {catalog.map((disease) => <button role="tab" aria-selected={selected.id === disease.id} className={selected.id === disease.id ? 'active' : ''} key={disease.id} onClick={() => setSelected(disease)}><span className={`disease-symbol ${disease.tone}`}><Leaf size={20} /></span><span><strong>{disease.name}</strong><small>{disease.scientific}</small></span><ChevronRight size={17} /></button>)}
        </div>
        <article className="panel disease-detail">
          <div className="disease-detail-header"><span className={`disease-symbol large ${selected.tone}`}><Leaf size={27} /></span><div><StatusPill disease={selected} /><h2>{selected.name}</h2><p><i>{selected.scientific}</i></p></div></div>
          <p className="disease-summary">{selected.summary}</p>
          <div className="detail-section"><span className="section-label">COMMON VISUAL SYMPTOMS</span><ul>{selected.symptoms.map((symptom) => <li key={symptom}><Check size={16} />{symptom}</li>)}</ul></div>
          <div className="management-box"><span><ShieldCheck size={20} /></span><div><strong>Management guidance</strong><p>{selected.management}</p></div></div>
          <div className="disclaimer"><Info size={16} />AI output supports screening and does not replace laboratory confirmation or advice from local crop authorities.</div>
        </article>
      </section>}
    </div>
  );
}

function ResearchPage() {
  const latency = [96, 88, 90, 82, 85, 79, 84];
  return (
    <div className="page-stack">
      <section className="page-heading"><div><p className="eyebrow">MODEL MONITORING</p><h1>Research metrics</h1><p>Deployment telemetry for the Enhanced MobileNetV3 evaluation.</p></div><span className="model-badge"><span />EMV3-INT8 v1.4</span></section>
      <section className="metrics-grid research-metrics"><Metric label="Model accuracy" value="94.8%" detail="Held-out test set" icon={Activity} tone="green" /><Metric label="Macro F1 score" value="0.943" detail="Across five classes" icon={BarChart3} tone="blue" /><Metric label="Model size" value="4.7 MB" detail="INT8 quantized artifact" icon={Database} /><Metric label="Median latency" value="84 ms" detail="Android field devices" icon={FlaskConical} tone="amber" /></section>
      <section className="research-grid">
        <div className="panel latency-panel"><div className="panel-heading"><div><span className="section-label">INFERENCE PERFORMANCE</span><h3>Median device latency</h3></div><span className="period">7-day view</span></div><div className="bar-chart">{latency.map((value, i) => <div key={i}><span style={{ height: `${value}%` }}><b>{value}</b></span><small>{['Thu','Fri','Sat','Sun','Mon','Tue','Wed'][i]}</small></div>)}</div></div>
        <div className="panel model-card"><span className="section-label">DEPLOYMENT ARTIFACT</span><div className="model-file"><span><FileImage size={22} /></span><div><strong>banana_disease_model.tflite</strong><small>INT8 · 4.7 MB · SHA verified</small></div><Check size={18} /></div><dl className="model-details"><div><dt>Input shape</dt><dd>224 × 224 × 3</dd></div><div><dt>Output classes</dt><dd>5</dd></div><div><dt>Quantization</dt><dd>Full integer INT8</dd></div><div><dt>Released</dt><dd>Aug 8, 2026</dd></div></dl></div>
      </section>
    </div>
  );
}

function RecordDrawer({ record, onClose }) {
  if (!record) return null;
  const disease = getDisease(record.diseaseId);
  return (
    <><button className="drawer-scrim" aria-label="Close details" onClick={onClose} /><aside className="record-drawer">
      <div className="drawer-header"><div><span className="section-label">DIAGNOSIS RECORD</span><h2>{record.id}</h2></div><IconButton label="Close details" onClick={onClose}><X size={20} /></IconButton></div>
      <div className="drawer-image">{record.image ? <img src={record.image} alt="Diagnosed banana leaf" /> : <EmptyLeaf />}</div>
      <StatusPill disease={disease} /><h2 className="drawer-disease">{disease.name}</h2><p className="drawer-scientific"><i>{disease.scientific}</i></p>
      <div className="drawer-score"><span>Confidence</span><strong>{record.confidence.toFixed(1)}%</strong><i><b style={{ width: `${record.confidence}%` }} /></i></div>
      <dl className="drawer-details"><div><dt>Date captured</dt><dd>{formatDate(record.date, true)}</dd></div><div><dt>Location</dt><dd>{record.location}</dd></div><div><dt>Source</dt><dd>{record.source}</dd></div><div><dt>Inference time</dt><dd>{record.latency} ms</dd></div><div><dt>Model</dt><dd>{record.model}</dd></div><div><dt>Cloud status</dt><dd>{record.synced ? 'Synced' : 'Saved locally'}</dd></div></dl>
      <div className="management-box compact"><span><ShieldCheck size={19} /></span><div><strong>Recommended action</strong><p>{disease.management}</p></div></div>
    </aside></>
  );
}

function MobileNav({ active, setActive }) {
  return <nav className="mobile-nav">{NAV_ITEMS.slice(0, 4).map((item) => { const Icon = item.icon; return <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => setActive(item.id)}><Icon size={20} /><span>{item.id === 'scan' ? 'Scan' : item.label.split(' ')[0]}</span></button>; })}</nav>;
}

function FieldApp({ user, initialActive = 'overview', navigate, onSignedOut }) {
  const [active, setActiveState] = useState(initialActive);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [records, setRecords] = useState([]);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  useEffect(() => {
    api('/diagnoses?per_page=100').then((payload) => setRecords(payload.data.items.map((item) => ({
      id: String(item.id), diseaseId: item.disease?.slug || item.predicted_class, confidence: Number(item.confidence),
      latency: item.inference_time_ms || 0, date: item.diagnosed_at, location: 'Not recorded', source: item.source,
      synced: item.sync_status === 'synced' || item.source === 'web', model: item.model_version || 'Unspecified', image: item.image_url,
    })))).catch(() => setRecords([]));
  }, []);

  const setActive = (next) => {
    setActiveState(next);
    const routes = { overview: '/dashboard', scan: '/diagnose', history: '/history', library: '/dashboard', research: '/dashboard' };
    window.history.replaceState({}, '', routes[next] || '/dashboard');
  };

  const title = useMemo(() => NAV_ITEMS.find((item) => item.id === active)?.label || 'Overview', [active]);
  const addRecord = async (record) => {
    const payload = await api('/diagnoses', { method: 'POST', body: JSON.stringify({ predicted_class: record.diseaseId, confidence: record.confidence, inference_time_ms: record.latency, model_version: record.model, source: 'web', diagnosed_at: record.date }) });
    setRecords((current) => [{ ...record, id: String(payload.data.id), synced: true }, ...current]);
  };
  const deleteRecord = async (id) => { await api(`/diagnoses/${id}`, { method: 'DELETE' }); setRecords((current) => current.filter((record) => record.id !== id)); if (selectedRecord?.id === id) setSelectedRecord(null); };
  const signOut = async () => { await logout(); onSignedOut(); };

  return (
    <div className="app-shell">
      <Sidebar active={active} setActive={setActive} open={menuOpen} onClose={() => setMenuOpen(false)} user={user} onProfile={() => navigate('/profile')} />
      <main className="main-area">
        <Topbar title={title} isOnline={isOnline} onMenu={() => setMenuOpen(true)} onProfile={() => navigate('/profile')} onLogout={signOut} />
        <div className="page-container">
          {active === 'overview' && <Overview records={records} setActive={setActive} onOpen={setSelectedRecord} />}
          {active === 'scan' && <ScanWorkspace onSaved={addRecord} setActive={setActive} />}
          {active === 'history' && <HistoryPage records={records} onOpen={setSelectedRecord} onDelete={deleteRecord} />}
          {active === 'library' && <LibraryPage />}
          {active === 'research' && <ResearchPage />}
        </div>
      </main>
      <MobileNav active={active} setActive={setActive} />
      <RecordDrawer record={selectedRecord} onClose={() => setSelectedRecord(null)} />
    </div>
  );
}

function AuthPage({ mode, onAuthenticated, navigate }) {
  const signup = mode === 'register';
  const [form, setForm] = useState({ name: '', email: '', password: '', password_confirmation: '' });
  const [error, setError] = useState(''); const [errors, setErrors] = useState({}); const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setErrors({});
    try { onAuthenticated(await authenticate(mode, form)); navigate('/dashboard'); }
    catch (exception) { setError(exception.message); setErrors(exception.errors || {}); }
    finally { setBusy(false); }
  };
  return <main className="auth-page"><section className="auth-card"><div className="auth-brand"><span className="brand-mark"><Leaf size={22} /></span><div><strong>BananaCare</strong><small>FIELD INTELLIGENCE</small></div></div><p className="eyebrow">{signup ? 'CREATE ACCOUNT' : 'WELCOME BACK'}</p><h1>{signup ? 'Start your field workspace' : 'Sign in to continue'}</h1><p className="auth-intro">Secure access to diagnosis history, disease information, and synchronization.</p><form onSubmit={submit} className="auth-form">{signup && <label>Full name<input autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />{errors.name && <small>{errors.name[0]}</small>}</label>}<label>Email<input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />{errors.email && <small>{errors.email[0]}</small>}</label><label>Password<input type="password" autoComplete={signup ? 'new-password' : 'current-password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />{errors.password && <small>{errors.password[0]}</small>}</label>{signup && <label>Confirm password<input type="password" autoComplete="new-password" value={form.password_confirmation} onChange={(event) => setForm({ ...form, password_confirmation: event.target.value })} required /></label>}{error && <div className="form-error">{error}</div>}<button className="primary-button" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}</button></form><p className="auth-switch">{signup ? 'Already have an account?' : 'Need an account?'} <button onClick={() => navigate(signup ? '/login' : '/signup')}>{signup ? 'Sign in' : 'Sign up'}</button></p></section></main>;
}

function ProfilePage({ user, onUser, navigate, onSignedOut }) {
  const [profile, setProfile] = useState({ name: user.name, email: user.email });
  const [passwords, setPasswords] = useState({ current_password: '', password: '', password_confirmation: '' });
  const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const save = async (event) => { event.preventDefault(); setError(''); try { const payload = await api('/profile', { method: 'PUT', body: JSON.stringify(profile) }); onUser(payload.data.user); setMessage('Profile updated.'); } catch (exception) { setError(exception.message); } };
  const changePassword = async (event) => { event.preventDefault(); setError(''); try { await api('/profile/password', { method: 'PUT', body: JSON.stringify(passwords) }); setPasswords({ current_password: '', password: '', password_confirmation: '' }); setMessage('Password updated.'); } catch (exception) { setError(exception.message); } };
  const remove = async () => { if (!confirm('Permanently delete your account and its diagnosis records?')) return; await api('/profile', { method: 'DELETE' }); setToken(null); onSignedOut(); };
  return <main className="standalone-page"><div className="standalone-header"><button className="text-button" onClick={() => navigate('/dashboard')}><ArrowLeft size={17} />Dashboard</button><button className="text-button" onClick={async () => { await logout(); onSignedOut(); }}><LogOut size={17} />Log out</button></div><section className="settings-grid"><div className="panel settings-panel"><p className="eyebrow">ACCOUNT</p><h1>Profile</h1><form className="auth-form" onSubmit={save}><label>Name<input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></label><label>Email<input type="email" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} /></label><button className="primary-button">Save profile</button></form></div><div className="panel settings-panel"><p className="eyebrow">SECURITY</p><h2>Change password</h2><form className="auth-form" onSubmit={changePassword}><label>Current password<input type="password" value={passwords.current_password} onChange={(event) => setPasswords({ ...passwords, current_password: event.target.value })} /></label><label>New password<input type="password" value={passwords.password} onChange={(event) => setPasswords({ ...passwords, password: event.target.value })} /></label><label>Confirm new password<input type="password" value={passwords.password_confirmation} onChange={(event) => setPasswords({ ...passwords, password_confirmation: event.target.value })} /></label><button className="secondary-button">Update password</button></form><button className="danger-button" onClick={remove}>Delete account</button></div></section>{message && <div className="page-message">{message}</div>}{error && <div className="form-error page-message">{error}</div>}</main>;
}

function AdminShell({ user, path, navigate, onSignedOut }) {
  const tabs = [['/admin', 'Analytics'], ['/admin/users', 'Users'], ['/admin/diseases', 'Diseases'], ['/admin/diagnoses', 'Diagnoses']];
  return <div className="admin-shell"><header className="admin-header"><div className="auth-brand"><span className="brand-mark"><Leaf size={20} /></span><strong>BananaCare Admin</strong></div><nav>{tabs.map(([route, label]) => <button className={path === route ? 'active' : ''} key={route} onClick={() => navigate(route)}>{label}</button>)}</nav><div><span>{user.name}</span><button onClick={async () => { await logout(); onSignedOut(); }}><LogOut size={17} /></button></div></header><main className="admin-content">{path === '/admin' ? <AdminDashboard /> : <AdminResource kind={path.split('/').pop()} />}</main></div>;
}

function AdminDashboard() {
  const [data, setData] = useState(null); const [error, setError] = useState('');
  useEffect(() => { api('/admin/dashboard').then((payload) => setData(payload.data)).catch((exception) => setError(exception.message)); }, []);
  if (error) return <div className="form-error">{error}</div>; if (!data) return <div className="loading-page">Loading analytics…</div>;
  return <div className="page-stack"><section className="page-heading"><div><p className="eyebrow">ADMINISTRATION</p><h1>System dashboard</h1><p>Live statistics from persisted diagnosis and user records.</p></div></section><section className="metrics-grid"><Metric label="Total users" value={data.total_users} detail="Registered accounts" icon={CircleUserRound} /><Metric label="Total diagnoses" value={data.total_diagnoses} detail="All sources" icon={Database} /><Metric label="Diagnoses today" value={data.diagnoses_today} detail="Current database date" icon={Activity} /><Metric label="Average confidence" value={`${Number(data.average_confidence).toFixed(1)}%`} detail="All diagnosis records" icon={BarChart3} /></section><section className="admin-panels"><div className="panel settings-panel"><h2>Diagnoses per class</h2>{Object.keys(data.diagnoses_per_class).length ? Object.entries(data.diagnoses_per_class).map(([label, total]) => <div className="admin-stat" key={label}><span>{label}</span><strong>{total}</strong></div>) : <p className="empty-copy">No diagnoses yet.</p>}</div><div className="panel settings-panel"><h2>Mobile versus web</h2>{Object.keys(data.diagnoses_per_source).length ? Object.entries(data.diagnoses_per_source).map(([label, total]) => <div className="admin-stat" key={label}><span>{label}</span><strong>{total}</strong></div>) : <p className="empty-copy">No diagnoses yet.</p>}</div></section></div>;
}

function AdminResource({ kind }) {
  const endpoint = kind === 'diseases' ? '/diseases' : `/admin/${kind}`;
  const emptyForm = kind === 'users' ? { name: '', email: '', role: 'user', password: '', password_confirmation: '' } : { slug: '', name: '', scientific_name: '', description: '', symptoms: '', management: '', prevention: '' };
  const [items, setItems] = useState([]); const [error, setError] = useState(''); const [search, setSearch] = useState(''); const [form, setForm] = useState(emptyForm); const [editing, setEditing] = useState(null);
  const load = () => api(`${endpoint}${kind === 'users' && search ? `?search=${encodeURIComponent(search)}` : ''}`).then((payload) => setItems(payload.data.items || payload.data)).catch((exception) => setError(exception.message));
  useEffect(load, [kind]);
  const remove = async (id) => { if (!confirm(`Delete this ${kind.slice(0, -1)}?`)) return; await api(`/admin/${kind}/${id}`, { method: 'DELETE' }); load(); };
  const edit = (item) => { setEditing(item.id); setForm(kind === 'users' ? { name: item.name, email: item.email, role: item.role, password: '', password_confirmation: '' } : { ...emptyForm, ...item, symptoms: (item.symptoms || []).join('\n') }); };
  const submit = async (event) => { event.preventDefault(); setError(''); const data = { ...form }; if (kind === 'users' && !data.password) { delete data.password; delete data.password_confirmation; } if (kind === 'diseases') data.symptoms = data.symptoms.split('\n').map((value) => value.trim()).filter(Boolean); try { await api(`/admin/${kind}${editing ? `/${editing}` : ''}`, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(data) }); setEditing(null); setForm(emptyForm); load(); } catch (exception) { setError(exception.message); } };
  return <div className="page-stack"><section className="page-heading"><div><p className="eyebrow">ADMINISTRATION</p><h1>{kind[0].toUpperCase() + kind.slice(1)}</h1><p>{kind === 'diagnoses' ? 'Predictions are immutable; administrators may inspect or delete records.' : 'Create, review, update, and delete authorized records.'}</p></div></section>{kind === 'users' && <form className="admin-search" onSubmit={(event) => { event.preventDefault(); load(); }}><input placeholder="Search name or email" value={search} onChange={(event) => setSearch(event.target.value)} /><button className="secondary-button">Search</button></form>}{kind !== 'diagnoses' && <form className="panel admin-form" onSubmit={submit}><h2>{editing ? 'Update' : 'Create'} {kind.slice(0, -1)}</h2><div className="admin-form-grid">{Object.entries(form).map(([field, value]) => field === 'role' ? <label key={field}>Role<select value={value} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="user">User</option><option value="admin">Admin</option></select></label> : field === 'symptoms' || field === 'description' || field === 'management' || field === 'prevention' ? <label key={field}>{field.replaceAll('_', ' ')}<textarea value={value ?? ''} onChange={(event) => setForm({ ...form, [field]: event.target.value })} /></label> : <label key={field}>{field.replaceAll('_', ' ')}<input type={field.includes('password') ? 'password' : field === 'email' ? 'email' : 'text'} value={value ?? ''} required={!['scientific_name', 'prevention', 'password', 'password_confirmation'].includes(field) || (!editing && kind === 'users')} onChange={(event) => setForm({ ...form, [field]: event.target.value })} /></label>)}</div><div className="admin-form-actions"><button className="primary-button">{editing ? 'Save changes' : 'Create record'}</button>{editing && <button type="button" className="secondary-button" onClick={() => { setEditing(null); setForm(emptyForm); }}>Cancel</button>}</div></form>}{error && <div className="form-error">{error}</div>}<section className="panel admin-table"><div className="admin-table-head"><span>Record</span><span>Details</span><span>Action</span></div>{items.map((item) => <div className="admin-table-row" key={item.id}><strong>{item.name || item.predicted_class}</strong><span>{kind === 'users' ? `${item.email} · ${item.role}` : kind === 'diseases' ? item.scientific_name || item.slug : `${item.user?.email || 'Unknown user'} · ${item.confidence}% · ${item.source}`}</span><div className="admin-row-actions">{kind !== 'diagnoses' && <button className="edit-link" onClick={() => edit(item)}>Edit</button>}<button className="danger-link" onClick={() => remove(item.id)}>Delete</button></div></div>)}{!items.length && <div className="empty-state"><p>No records found.</p></div>}</section></div>;
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname === '/' ? '/dashboard' : window.location.pathname);
  const [user, setUser] = useState(null); const [loading, setLoading] = useState(Boolean(getToken()));
  const navigate = (next) => { window.history.pushState({}, '', next); setPath(next); };
  useEffect(() => { const pop = () => setPath(window.location.pathname); window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop); }, []);
  useEffect(() => { if (!getToken()) { setLoading(false); return; } api('/auth/me').then((payload) => setUser(payload.data.user)).catch(() => setToken(null)).finally(() => setLoading(false)); }, []);
  useEffect(() => { if (!loading && !user && path !== '/login' && path !== '/signup') navigate('/login'); }, [loading, user, path]);
  if (loading) return <div className="loading-page">Restoring your secure session…</div>;
  if (!user) return path === '/signup' ? <AuthPage mode="register" onAuthenticated={setUser} navigate={navigate} /> : <AuthPage mode="login" onAuthenticated={setUser} navigate={navigate} />;
  const signedOut = () => { setUser(null); navigate('/login'); };
  if (path.startsWith('/admin')) return user.role === 'admin' ? <AdminShell user={user} path={path} navigate={navigate} onSignedOut={signedOut} /> : <main className="auth-page"><section className="auth-card"><h1>Access denied</h1><p>Administrator permission is required.</p><button className="primary-button" onClick={() => navigate('/dashboard')}>Return to dashboard</button></section></main>;
  if (path === '/profile') return <ProfilePage user={user} onUser={setUser} navigate={navigate} onSignedOut={signedOut} />;
  const active = path === '/diagnose' ? 'scan' : path === '/history' ? 'history' : 'overview';
  return <FieldApp key={active} user={user} initialActive={active} navigate={navigate} onSignedOut={signedOut} />;
}
