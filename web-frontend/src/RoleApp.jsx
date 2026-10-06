import { tr, useLanguage, setLanguage, getLanguage } from './i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, Bell, ArrowLeft, ArrowRightLeft, BarChart3, BookOpen, Camera, Check, ChevronDown, ChevronRight, CircleUserRound, Cloud, CloudOff, Database, Eye, EyeOff, FileImage, GitCompareArrows, History, Home, ImagePlus, Info, Leaf, Library, Lightbulb, Link2, LockKeyhole, LogOut, Mail, Menu, MessageCircle, Plus, RefreshCw, ScanLine, Search, Send, Settings, ShieldCheck, Trash2, Upload, Users, X } from 'lucide-react';
import { analyzeLeaf } from './services/inferenceService';
import { CLASS_NAMES, getHighestClass, normalizeClassProbabilities } from './services/classificationResults';
import { AUTH_EXPIRED_EVENT, api, apiFileUrl, authenticate, logout, requestPasswordReset, setToken } from './services/api';
import { cacheHistory, clearWebAccountData, countPendingWebChanges, flushWebDiagnosisOutbox, listPendingWebDiagnoses, pullWebDiagnosisChanges, queueWebDiagnosis, queueWebDiagnosisDeletion, readCachedHistory } from './services/offlineDiagnoses';
import { normalizeChatText } from './utils/chatText';
import { ARTICLE_IMAGE_LINE, numberedLineText, parseInline } from './utils/articleFormat';
import { ArticleEditor } from './ArticleEditor';

const THRESHOLD = Number(import.meta.env.VITE_CONFIDENCE_THRESHOLD ?? 70);
const FARMER_NAV = [['/farmer/dashboard', 'Home', Home], ['/farmer/scan', 'Scan', ScanLine], ['/farmer/history', 'History', History], ['/farmer/diseases', 'Guide', BookOpen], ['/farmer/profile', 'Profile', CircleUserRound]];
const ADMIN_NAV = [['/admin/dashboard', 'Dashboard', Home], ['/admin/accounts', 'Accounts', Users], ['/admin/diagnoses', 'Diagnoses', ScanLine], ['/admin/diseases', 'Disease Knowledge', BookOpen], ['/admin/sources', 'Research Sources', Link2], ['/admin/articles', 'Article Library', Library], ['/admin/dataset', 'Dataset Candidates', Database], ['/admin/analytics', 'Analytics', BarChart3], ['/admin/model-comparison', 'Model Comparison', GitCompareArrows], ['/admin/system', 'Model Information', Settings], ['/admin/profile', 'Profile', CircleUserRound]];
const EXPERT_NAV = [['/expert/dashboard', 'Home', Home], ['/expert/cases', 'Review Queue', ScanLine], ['/expert/reviewed', 'Reviewed Cases', History], ['/expert/diseases', 'Disease Knowledge', BookOpen], ['/expert/sources', 'Research Sources', Link2], ['/expert/library', 'Article Library', Library], ['/expert/dataset', 'Dataset Candidates', Database], ['/expert/profile', 'Profile', CircleUserRound]];
const GUIDE_MEDIA = {
  healthy: { images: ['/assets/disease-guide/healthy-1.webp', '/assets/disease-guide/healthy-2.webp', '/assets/disease-guide/healthy-3.webp'], source: 'Banana Disease Recognition Dataset', sourceUrl: 'https://data.mendeley.com/datasets/79w2n6b4kf/1' },
  sigatoka: { images: ['/assets/disease-guide/sigatoka-1.webp', '/assets/disease-guide/sigatoka-2.webp', '/assets/disease-guide/sigatoka-3.webp', '/assets/disease-guide/sigatoka-4.webp', '/assets/disease-guide/sigatoka-5.webp', '/assets/disease-guide/sigatoka-6.webp'], source: 'Banana Disease Recognition Dataset', sourceUrl: 'https://data.mendeley.com/datasets/79w2n6b4kf/1' },
  'panama-disease': { images: ['/assets/disease-guide/panama-stages/01-early-margin-yellowing/panama-leaf-stage-1.webp', '/assets/disease-guide/panama-stages/02-expanding-chlorosis/panama-leaf-stage-2.webp', '/assets/disease-guide/panama-stages/03-widespread-yellowing/panama-leaf-stage-3.webp', '/assets/disease-guide/panama-stages/04-advanced-edge-necrosis/panama-leaf-stage-4.webp', '/assets/disease-guide/panama-stages/05-near-total-leaf-death/panama-leaf-stage-5.webp'], source: 'Banana Leaves Imagery Dataset (educational references only)', sourceUrl: 'https://doi.org/10.5281/zenodo.7670326' },
  'cordana-leaf-spot': { images: ['/assets/disease-guide/cordana-1.webp', '/assets/disease-guide/cordana-2.webp', '/assets/disease-guide/cordana-3.webp'], source: 'Banana Leaf Spot Diseases (BananaLSD) Dataset', sourceUrl: 'https://data.mendeley.com/datasets/9tb7k297ff/1' },
  'banana-freckle': { images: ['/assets/disease-guide/banana-freckle.webp'], source: '© State of Queensland, Business Queensland', sourceUrl: 'https://www.business.qld.gov.au/industries/farms-fishing-forestry/agriculture/biosecurity/plants/priority-pest-disease/banana-freckle', license: 'CC BY 4.0' },
  'banana-bunchy-top': { images: ['/assets/disease-guide/banana-bunchy-top.webp'], source: 'Scot Nelson, Wikimedia Commons', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Banana_bunchy_top_virus_symptoms.jpg', license: 'CC0' },
};
const FPA_PRODUCTS_URL = 'https://mirrored.fpa-gov.ph/wp-content/uploads/2026/09/UPDATED-LIST-OF-REGISTERED-PRODUCTS-As-of-August-31-2026-PMID.pdf#page=243';
const GUIDE_PRODUCTS = {
  sigatoka: [{ name: 'Leader 500 SC', description: 'Chlorothalonil fungicide listed by the Philippine FPA for banana Sigatoka. It protects new growth; it does not heal dead tissue.', sourceUrl: FPA_PRODUCTS_URL }],
  'banana-freckle': [{ name: 'Leader 500 SC', description: 'Chlorothalonil fungicide listed by the Philippine FPA for banana freckles. Confirm the diagnosis and current label before use.', sourceUrl: FPA_PRODUCTS_URL }],
};
const ADDITIONAL_LEAF_GUIDES = [
  {
    id: 'guide-banana-freckle', slug: 'banana-freckle', model_class_key: null, name: 'Banana Freckle', scientific_name: 'Phyllosticta spp.',
    short_description: 'Rough dark spots on banana leaves and fruit',
    description: 'Small, rough dark spots may join into streaks on leaves and fruit. The example photo shows affected leaf tissue; other diseases can look similar.',
    symptoms: ['Small dark brown to black spots that feel rough like sandpaper', 'Spots may merge into streaks', 'Severe infection can yellow and dry leaves'],
    management: 'Ask an agriculturist to confirm the cause. A labeled fungicide can protect new tissue, but cannot restore damaged leaves.',
    prevention: 'Avoid moving infected planting material and leaves; reduce splash between plants and monitor new growth.',
    professional_referral: 'Seek local agricultural advice before spraying, especially when spots spread to fruit.',
    causal_agent: 'Several Phyllosticta fungi can cause banana freckle.',
    image_only_limitations: 'The fungal species and suitability of a product cannot be confirmed from a photograph.',
    sources: [{ id: 'freckle-guidance', authors: 'Business Queensland', year: 2026, title: 'Freckle disease of banana', journal_or_institution: 'Queensland Government', reference_url: 'https://www.business.qld.gov.au/industries/farms-fishing-forestry/agriculture/biosecurity/plants/priority-pest-disease/banana-freckle' }],
  },
  {
    id: 'guide-banana-bunchy-top', slug: 'banana-bunchy-top', model_class_key: null, name: 'Banana Bunchy Top', scientific_name: 'Banana bunchy top virus',
    short_description: 'Short upright leaves and dark green streaking',
    description: 'New leaves become short, narrow and upright, often with dark green streaks along veins and leaf stalks.',
    symptoms: ['New leaves are narrow, stunted and upright', 'Dark green streaks can appear on leaf veins and stalks', 'The plant may stop producing fruit'],
    management: 'There is no curative spray. Ask an agriculturist to confirm the virus and advise on aphid control and removal of confirmed infected mats.',
    prevention: 'Do not move suckers from affected plants. Replant with virus-free material and manage banana aphids under local guidance.',
    professional_referral: 'Report a suspected plant promptly; removal and vector control should follow local agricultural advice.',
    causal_agent: 'Banana bunchy top virus, spread by the banana aphid.',
    image_only_limitations: 'A photograph alone cannot confirm infection or distinguish every cause of stunting.',
    sources: [{ id: 'bunchy-guidance', authors: 'University of Hawaiʻi CTAHR', year: null, title: 'IPM Strategies against BBTV', journal_or_institution: 'Banana Pest and Disease Management in the Tropical Pacific', reference_url: 'https://cms.ctahr.hawaii.edu/wangkh/Research-and-Extension/Banana-IPM/Guidebook/CHPT4-IPM-BBTV' }],
  },
];
const formatDate = (value, time = false) => value ? new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', ...(time ? { hour: 'numeric', minute: '2-digit' } : {}) }).format(new Date(value)) : 'Not available';
const titleCase = (value = '') => value.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
// How sure a result is, in words a farmer can act on (same as the phone app); exact scores stay under "See model scores".
const confidenceText = (value) => tr(value < THRESHOLD ? 'Not sure' : value >= 85 ? 'Very likely' : 'Likely');
const confidenceBars = (value) => value < THRESHOLD ? 1 : value >= 85 ? 3 : 2;
function CertaintyBadge({ value }) { const bars = confidenceBars(value); return <span className={`certainty-badge level-${bars}`} aria-label={confidenceText(value)}><span className="certainty-bars" aria-hidden="true">{[1, 2, 3].map((bar) => <i key={bar} className={bar <= bars ? 'on' : ''} />)}</span>{confidenceText(value)}</span>; }
const percent = (value, digits = 1) => `${Math.min(100 - 10 ** -digits, Math.max(0, Number(value))).toFixed(digits)}%`;
const COMPARISON_BASE_BAR = '#c3cdc7';
const COMPARISON_ENHANCED_BAR = '#245f43';
const COMPARISON_PLOT_HEIGHT = 150;
const COMPARISON_MIN_BAR_HEIGHT = 10;
const COMPARISON_GRID_LEVELS = [0, 25, 50, 75, 100];
const COMPARISON_AXIS_SHORT_NAMES = { healthy: 'Healthy', sigatoka: 'Sigatoka', 'panama-disease': 'Panama', 'cordana-leaf-spot': 'Cordana' };
const comparisonBarLabel = (pct) => pct >= 0.05 ? `${pct.toFixed(1)}%` : '<0.1%';
// A completed assessment the farmer has not opened yet.
const isNewReview = (review) => Boolean(review && review.review_status !== 'pending' && !review.farmer_seen_at);
const mapDiagnosis = (item) => ({ id: String(item.id), syncUuid: item.sync_uuid || null, diseaseId: item.disease?.slug || item.predicted_class, predictedClass: item.predicted_class, disease: item.disease, confidence: Number(item.confidence), date: item.diagnosed_at, source: item.source, synced: item.sync_status === 'synced' || item.source === 'web', syncStatus: item.sync_status || (item.source === 'web' ? 'synced' : null), isSimulated: Boolean(item.is_simulated), image: item.image_url, serverImage: Boolean(item.image_url), gradcam: item.gradcam_url, farmerNotes: item.farmer_notes || '', researchConsent: Boolean(item.research_consent), researchConsentCurrent: Boolean(item.research_consent_current), researchConsentedAt: item.research_consented_at, priority: Number(item.review_priority || 0), reviewReasons: item.review_reasons || [], latency: item.inference_time_ms || 0, model: item.model_version || 'Not specified', user: item.user, review: item.review || null, reviewClaim: item.review_claim || null, farmerHistory: item.farmer_history || [], location: item.location || null, reviewInProgressUntil: item.review_in_progress_until || null });
// A queued scan stays in the outbox until its review request or photo upload
// succeeds; once the server has the scan, show the server copy only.
const mergeRecords = (pending, server) => { const followUps = new Map(pending.filter((item) => item.lastError).map((item) => [item.syncUuid, item.lastError])); const synced = new Set(server.map((item) => item.syncUuid).filter(Boolean)); return [...pending.filter((item) => !synced.has(item.syncUuid)), ...server.map((item) => followUps.has(item.syncUuid) ? { ...item, followUpError: followUps.get(item.syncUuid) } : item)]; };
const roleHome = (role) => role === 'admin' ? '/admin/dashboard' : role === 'agricultural_expert' ? '/expert/dashboard' : '/farmer/dashboard';

function IconButton({ label, children, ...props }) { return <button className="icon-button" aria-label={label} title={label} {...props}>{children}</button>; }
function LogoMark({ inverse = false }) { return <img className="logo-mark" src={inverse ? '/assets/brand/dahonmd-logo-white.webp' : '/assets/brand/dahonmd-logo-green.webp'} alt="" aria-hidden="true" />; }
function Loading({ text = 'Loading...' }) { return <div className="role-loading"><RefreshCw className="spin" size={24} /><p>{text}</p></div>; }
function Empty({ icon: Icon = Leaf, title, text, action, actionLabel }) { return <div className="empty-state role-empty"><Icon size={30} /><h3>{title}</h3><p>{text}</p>{action && <button className="primary-button" onClick={action}>{actionLabel}</button>}</div>; }
function ModalShell({ open, title, description, onClose, children, size = 'medium', variant = 'modal' }) {
  const panel = useRef(null);
  const onCloseRef = useRef(onClose);
  const dragStart = useRef(null);
  const dragged = useRef(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [visibleViewport, setVisibleViewport] = useState(null);
  onCloseRef.current = onClose;
  const dragLimit = () => Math.min((visibleViewport?.height ?? window.innerHeight) * .22, 180);
  useEffect(() => {
    if (!open || variant !== 'auth' || !window.visualViewport) return undefined;
    const viewport = window.visualViewport;
    const update = () => setVisibleViewport({ top: viewport.offsetTop, left: viewport.offsetLeft, width: viewport.width, height: viewport.height });
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => { viewport.removeEventListener('resize', update); viewport.removeEventListener('scroll', update); };
  }, [open, variant]);
  // The on-screen keyboard opens after a field is focused, so the dialog
  // shrinks afterwards; bring the focused field back into the scrollable area.
  useEffect(() => {
    if (variant !== 'auth' || !visibleViewport) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const active = document.activeElement;
      if (panel.current?.contains(active) && active.matches('input, select, textarea')) active.scrollIntoView({ block: 'nearest' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [variant, visibleViewport?.height]);
  const onHandleDown = (event) => {
    if (event.button !== 0) return;
    dragStart.current = { y: event.clientY, offset: dragOffset };
    dragged.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const onHandleMove = (event) => {
    if (!dragStart.current) return;
    if (Math.abs(event.clientY - dragStart.current.y) > 5) dragged.current = true;
    setDragOffset(Math.max(0, Math.min(window.innerHeight, dragStart.current.offset + event.clientY - dragStart.current.y)));
  };
  const onHandleUp = (event) => {
    if (!dragStart.current) return;
    const delta = event.clientY - dragStart.current.y;
    const fromCollapsed = dragStart.current.offset >= dragLimit() * .6;
    dragStart.current = null;
    setDragging(false);
    if (fromCollapsed && delta > 80) { setDragOffset(window.innerHeight); window.setTimeout(() => { onCloseRef.current(); setDragOffset(0); }, 190); return; }
    if (delta > 45) { setDragOffset(dragLimit()); return; }
    if (delta < -35) { setDragOffset(0); return; }
    setDragOffset((value) => value > dragLimit() / 2 ? dragLimit() : 0);
  };
  useEffect(() => {
    if (!open) return undefined;
    setDragOffset(0);
    setDragging(false);
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    const handleDialogKeys = (event) => {
      const dialogs = [...document.querySelectorAll('.crud-dialog')];
      if (dialogs.at(-1) !== panel.current) return;
      if (event.key === 'Escape') { onCloseRef.current(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleDialogKeys);
    window.requestAnimationFrame(() => panel.current?.querySelector('input, select, textarea, button')?.focus());
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', handleDialogKeys); previousFocus?.focus(); };
  }, [open]);
  if (!open) return null;
  return <div className={`crud-overlay ${variant}`} style={variant === 'auth' && visibleViewport ? { top: visibleViewport.top, left: visibleViewport.left, width: visibleViewport.width, height: visibleViewport.height, right: 'auto', bottom: 'auto' } : undefined}>
    <button type="button" className="crud-scrim" aria-label={`Dismiss ${title}`} onClick={onClose} />
    <section ref={panel} className={`crud-dialog ${variant} ${size} ${dragging ? 'dragging' : ''}`} role="dialog" aria-modal="true" aria-label={title} style={variant === 'auth' ? { '--auth-drag-offset': `${dragOffset}px`, '--auth-visual-max-height': visibleViewport ? `${Math.floor(visibleViewport.height * .94)}px` : '94dvh' } : undefined}>
      {variant === 'auth' && <button type="button" className="auth-drag-handle" aria-label="Drag up to expand or down to minimize" onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={() => { dragStart.current = null; setDragging(false); setDragOffset(0); }} onClick={() => { if (dragged.current) { dragged.current = false; return; } setDragOffset((value) => value ? 0 : dragLimit()); }}><span /></button>}
      <header className="crud-dialog-header">{variant !== 'auth' && <span className="crud-dialog-mark"><LogoMark /></span>}<div><h2>{title}</h2>{description && <p>{description}</p>}</div><IconButton label={`Close ${title}`} onClick={onClose}><X size={20} /></IconButton></header>
      <div className="crud-dialog-body">{children}</div>
    </section>
  </div>;
}
function ConfirmDialog({ open, title, text, confirmLabel = 'Confirm', danger = false, busy = false, confirmDisabled = false, onCancel, onConfirm, children }) {
  return <ModalShell open={open} title={title} description={text} onClose={() => { if (!busy) onCancel(); }} size="small">
    {children}
    <div className="confirm-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>Cancel</button><button type="button" className={danger ? 'danger-button' : 'primary-button'} disabled={busy || confirmDisabled} onClick={onConfirm}>{busy ? 'Please wait…' : confirmLabel}</button></div>
  </ModalShell>;
}
const userInitials = (name = '') => name.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
// Profile photo with an initials fallback; the parent element sets the size and shape.
function AvatarContent({ user }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [user?.avatar_url]);
  return user?.avatar_url && !failed ? <img className="user-avatar-img" src={user.avatar_url} alt="" onError={() => setFailed(true)} /> : userInitials(user?.name);
}

function ReviewRequestForm({ initialNotes = '', hasPhoto = true, onSubmit }) { const [notes, setNotes] = useState(initialNotes); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const send = async () => { if (busy) return; setBusy(true); setError(''); try { await onSubmit(notes); } catch (exception) { setError(exception.message || tr('Your request was not sent. Please try again.')); } finally { setBusy(false); } }; return <div className="review-request-form"><h3>{tr('Think this result is wrong?')}</h3><p>{tr('An expert will look at your {item} and tell you what to do.', { item: hasPhoto ? tr('photo') : tr('note') })}</p><label>{tr('Tell the expert what you see (optional)')}<textarea value={notes} maxLength={1000} onChange={(event) => setNotes(event.target.value)} placeholder="Example: the spots spread after rain." /></label>{!hasPhoto && <p>{tr('This scan has no photo, so the expert can only read your note.')}</p>}{error && <p className="form-error" role="alert">{error}</p>}<button type="button" className="primary-button full" disabled={busy} onClick={send}><ShieldCheck size={17} />{busy ? tr('Sending…') : tr('Ask an expert')}</button></div>; }

// Plain-language wording for farmers; the server keeps the original status codes.
const FARMER_CLASS_NAMES = { healthy: 'Healthy', sigatoka: 'Black Sigatoka', 'panama-disease': 'Panama Disease', 'cordana-leaf-spot': 'Cordana' };
const FARMER_STEP_TEXT = {
  retake_photo: 'Take a new, clear photo of the leaf in daylight.',
  monitor_plant: 'Check the plant again over the next few days.',
  isolate_affected_plant: 'Do not move soil, water, or tools from this plant to healthy plants.',
  seek_field_inspection: 'Ask your local agriculture office to check the plant in person.',
};
function farmerReviewOutcome(review, predictedClass) {
  const steps = (review.next_steps || []).map((step) => FARMER_STEP_TEXT[step]).filter(Boolean).map((text) => tr(text));
  const isClass = review.review_status === 'confirmed' || review.review_status === 'alternate_class';
  const label = review.review_status === 'confirmed' ? review.verified_label || predictedClass : review.verified_label;
  if (isClass && label === 'healthy') return { title: tr('Expert says: no disease seen'), message: tr('The expert did not see Black Sigatoka, Panama disease, or Cordana leaf spot in this photo.'), steps };
  if (isClass) {
    const name = FARMER_CLASS_NAMES[label] || tr('a different result'); const scanName = FARMER_CLASS_NAMES[predictedClass];
    return { title: tr('Expert says: {name}', { name }), message: review.review_status === 'confirmed' || !scanName ? tr('The expert agrees with your scan.') : tr('The expert thinks this is {name}, not {scan}.', { name, scan: scanName }), steps };
  }
  if (review.review_status === 'cannot_determine') return { title: tr('The expert could not tell from this photo'), message: tr('The photo was not clear enough to decide.'), steps };
  if (review.review_status === 'possible_outside_supported_classes') return { title: tr('This may be a different problem'), message: tr('It does not look like one of the 3 diseases this app checks.'), steps };
  return { title: tr('The plant needs to be checked in person'), message: tr('The photo alone is not enough to decide.'), steps: steps.length ? steps : [tr(FARMER_STEP_TEXT.seek_field_inspection)] };
}
function agriculturistVerdict(review, predictedClass) {
  if (!review) return 'Not reviewed';
  if (review.review_status === 'pending') return 'Waiting for agriculturist';
  if (review.review_status === 'confirmed' || review.review_status === 'alternate_class') {
    const label = review.verified_label || (review.review_status === 'confirmed' ? predictedClass : null);
    return FARMER_CLASS_NAMES[label] || (label ? titleCase(label) : 'Unable to determine');
  }
  if (review.review_status === 'cannot_determine') return 'Cannot determine from photo';
  if (review.review_status === 'possible_outside_supported_classes') return 'Possible other condition';
  if (review.review_status === 'field_or_laboratory_required') return 'Field or laboratory check needed';
  return titleCase(review.review_status);
}
// An agriculturist holding the case means it is being reviewed; an expired hold means it is waiting again.
const reviewInProgress = (record) => Boolean(record.reviewInProgressUntil && Date.parse(record.reviewInProgressUntil) > Date.now());
function FarmerReviewProgress({ inProgress = false }) { return <ol className="farmer-review-progress"><li className="done"><Check size={14} />{tr('Sent')}</li><li className={inProgress ? 'current' : ''}>{inProgress ? <>{tr('Expert reviewing')}</> : tr('Expert review')}</li><li>{tr('Answer ready')}</li></ol>; }

function AuthPanel({ mode, onAuthenticated, onMode, onDirtyChange }) {
  const signup = mode === 'register'; const [form, setForm] = useState({ name: '', email: '', password: '', password_confirmation: '' }); const [error, setError] = useState(''); const [errors, setErrors] = useState({}); const [busy, setBusy] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false); const [researchPhotoConsent, setResearchPhotoConsent] = useState(false);
  const [showPassword, setShowPassword] = useState(false); const [remember, setRemember] = useState(true); const [notice, setNotice] = useState('');
  useEffect(() => { onDirtyChange?.(busy || termsAccepted || researchPhotoConsent || Object.values(form).some(Boolean)); }, [form, busy, termsAccepted, researchPhotoConsent, onDirtyChange]);
  const submit = async (event) => { event.preventDefault(); if (signup && !termsAccepted) { setError(tr('Please agree to the Terms of Use to create an account.')); return; } setBusy(true); setError(''); setErrors({}); setNotice(''); try { const user = await authenticate(mode, signup ? { ...form, terms_accepted: termsAccepted, research_photo_consent: researchPhotoConsent } : form, remember); onAuthenticated(user); } catch (exception) { setError(exception.message); setErrors(exception.errors || {}); } finally { setBusy(false); } };
  const loginProfile = async (email) => {
    if (busy) return;
    setBusy(true); setError(''); setErrors({}); setNotice('');
    setForm((current) => ({ ...current, email }));
    try { onAuthenticated(await authenticate('login', { email, password: 'DahonMD@2026' }, remember)); }
    catch (exception) { setError(exception.message); }
    finally { setBusy(false); }
  };
  const forgotPassword = async () => { if (!form.email.trim()) { setNotice(''); setError(tr('Enter your email address first.')); return; } setBusy(true); setError(''); setNotice(''); try { setNotice(await requestPasswordReset(form.email)); } catch (exception) { setError(exception.message); } finally { setBusy(false); } };
  return <div className="auth-modal-content">
    <div className="auth-welcome">
      <div className="auth-brand-row"><span className="auth-modal-mark"><LogoMark /></span><span>DahonMD</span></div>
      <h3>{signup ? tr('Create your account') : tr('Log in to your account')}</h3>
      <p>{signup ? tr('Save your scans and keep them in sync across devices.') : tr('Your scans and account are ready when you are.')}</p>
    </div>
    <form className="auth-form" onSubmit={submit}>
      {!signup && import.meta.env.VITE_TEST_PROFILES === 'true' && <div className="auth-test-profiles">
        {[[tr('Farmer'), 'maria.santos@dahonmd.test', Leaf], [tr('Agriculturist'), 'agriculturist@dahonmd.test', ShieldCheck], [tr('Admin'), 'admin@dahonmd.test', Settings]].map(([label, email, Icon]) => <button key={email} type="button" disabled={busy} aria-label={`Log in as test ${label}, ${email}`} title={email} onClick={() => loginProfile(email)}><Icon size={23} /><span>{label}</span><small className="auth-test-email">{email}</small></button>)}
      </div>}
      {signup && <label>{tr('Full name')}<div className="auth-field"><CircleUserRound size={18} /><input autoComplete="name" placeholder="Your name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></div>{errors.name && <small>{errors.name[0]}</small>}</label>}
      <label>{tr('Email address')}<div className="auth-field"><Mail size={18} /><input type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></div>{errors.email && <small>{errors.email[0]}</small>}</label>
      <label>{tr('Password')}<div className="auth-field"><LockKeyhole size={18} /><input type={showPassword ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} placeholder="Enter your password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /><button type="button" className="auth-eye" aria-label={showPassword ? tr('Hide password') : tr('Show password')} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>{errors.password && <small>{errors.password[0]}</small>}</label>
      {signup && <label>{tr('Confirm password')}<div className="auth-field"><LockKeyhole size={18} /><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Repeat your password" value={form.password_confirmation} onChange={(event) => setForm({ ...form, password_confirmation: event.target.value })} required /></div></label>}
      {signup && <div className="auth-consent"><label><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} required /> {tr('I agree to the')} <a href="/api/terms" target="_blank" rel="noreferrer">{tr('Terms of Use')}</a> {tr('and have read the')} <a href="/privacy" target="_blank" rel="noreferrer">{tr('Privacy Policy')}</a>.</label><label><input type="checkbox" checked={researchPhotoConsent} onChange={(event) => setResearchPhotoConsent(event.target.checked)} /> {tr('Optional: Automatically share my future account scan photos for research consideration after expert review. An approved private copy may remain after I delete a scan. I can turn this off in Profile.')}</label></div>}
      <div className="auth-options"><label className="remember-control"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span><Check size={12} /></span>{tr('Remember me')}</label>{!signup && <button type="button" disabled={busy} onClick={forgotPassword}>{tr('Forgot password?')}</button>}</div>
      {(error || notice) && <div className={error ? 'form-error' : 'auth-notice'} role="status">{error || notice}</div>}
      <button className="primary-button auth-submit" disabled={busy}>{busy ? <RefreshCw className="spin" size={17} /> : <Leaf size={18} />}{busy ? tr('Please wait') : signup ? tr('Create account') : tr('Log in')}</button>
    </form>
    <p className="auth-switch">{signup ? tr('Already have an account?') : tr('New to DahonMD?')} <button type="button" onClick={() => onMode(signup ? 'login' : 'register')}>{signup ? tr('Log in') : tr('Sign up')} <ChevronRight size={14} /></button></p>
  </div>;
}

function AuthModal({ mode, onClose, onMode, onAuthenticated }) {
  const signup = mode === 'register';
  const dirty = useRef(false);
  const onDirtyChange = useCallback((value) => { dirty.current = value; }, []);
  const close = () => { if (!dirty.current || window.confirm('Discard your entered details?')) { dirty.current = false; onClose(); } };
  return <ModalShell open={Boolean(mode)} title={signup ? 'Sign up' : 'Log in'} onClose={close} size="small" variant="auth"><AuthPanel onDirtyChange={onDirtyChange} mode={mode || 'login'} onMode={onMode} onAuthenticated={onAuthenticated} /></ModalShell>;
}

const CHAT_INTRO = { id: 'intro', role: 'assistant', content: 'Ask me about banana leaf symptoms, care, or taking a clear photo.' };
const CHAT_STARTERS = ['What is Sigatoka?', 'How do I take a clear photo?', 'When should I get help?'];
const TOPIC_STARTERS = ['What does this result mean?', 'What should I do next with this plant?'];

function AssistantWidget({ user, online, onLogin, scanTopic = null }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([CHAT_INTRO]);
  // The scan the farmer opened the assistant from; its result and review are added on the server.
  const [topic, setTopic] = useState(null);
  // A conversation belongs to one account; start fresh whenever someone else signs in.
  useEffect(() => { setMessages([CHAT_INTRO]); setTopic(null); setDraft(''); setError(''); }, [user?.id]);
  useEffect(() => {
    if (!scanTopic) return;
    setTopic(scanTopic);
    setMessages([CHAT_INTRO]);
    setOpen(true);
  }, [scanTopic?.key]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nextId = useRef(1);
  const end = useRef(null);
  const input = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    window.setTimeout(() => input.current?.focus(), 180);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open, user]);

  useEffect(() => {
    if (open) end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [busy, messages, error, open]);

  const clear = () => {
    if (busy) return;
    setMessages([CHAT_INTRO]);
    setTopic(null);
    setDraft('');
    setError('');
  };

  const send = async (event, suggestion) => {
    event?.preventDefault();
    const content = (suggestion ?? draft).trim();
    if (!user || !online || !content || busy) return;
    const userMessage = { id: `message-${nextId.current++}`, role: 'user', content };
    const transcript = [...messages.filter(({ id }) => id !== 'intro'), userMessage]
      .slice(-8)
      .map(({ role, content: messageContent }) => ({ role, content: messageContent }));
    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setError('');
    setBusy(true);
    try {
      const payload = await api('/chat', { method: 'POST', body: JSON.stringify({ messages: transcript, ...(topic ? { diagnosis_id: topic.diagnosisId } : {}) }) });
      setMessages((current) => [...current, { id: `message-${nextId.current++}`, role: 'assistant', content: payload.data.reply }]);
    } catch (exception) {
      setError(exception.message || tr('The assistant could not answer. The scanner is still available.'));
    } finally {
      setBusy(false);
    }
  };

  return <div className={`ai-assistant-widget ${open ? 'open' : ''}`}>
    {open && <button type="button" className="ai-assistant-scrim" aria-label="Close assistant" onClick={() => setOpen(false)} />}
    {open && <section className={`ai-assistant-panel ${!user ? 'compact' : ''}`} role="dialog" aria-modal="true" aria-label={tr('Ask Dahon')}>
      <header className="ai-assistant-header">
        <span className="ai-assistant-mark"><LogoMark /></span>
        <div><strong>{tr('Ask Dahon')}</strong></div>
        {user && messages.length > 1 && <button type="button" aria-label="Clear conversation" disabled={busy} onClick={clear}><RefreshCw size={17} /></button>}
        <button type="button" aria-label="Close assistant" onClick={() => setOpen(false)}><X size={20} /></button>
      </header>

      {!user ? <div className="ai-assistant-signin">
        <h2>{tr('Sign in to chat')}</h2>
        <p>{tr('Ask questions about banana leaf care using your DahonMD account.')}</p>
        <div className="ai-assistant-note"><ShieldCheck size={16} /><span>{tr('Guidance only. Confirm a diagnosis with the scanner or an expert.')}</span></div>
        <button type="button" className="primary-button" onClick={() => { setOpen(false); onLogin?.(); }}>{tr('Sign in')}</button>
      </div> : <>
        <div className="ai-assistant-messages" aria-live="polite">
          {topic && <div className="ai-topic"><Leaf size={15} /><span>{tr('About your scan: {label}. Dahon sees its result and any expert review, not your photo or location.', { label: topic.label })}</span><button type="button" aria-label="Stop asking about this scan" onClick={() => setTopic(null)}><X size={14} /></button></div>}
          {messages.map((message) => <div key={message.id} className={`ai-message-row ${message.role}`}>
            <p>{normalizeChatText(message.content)}</p>
          </div>)}
          {messages.length === 1 && <div className="ai-assistant-starters">{(topic ? TOPIC_STARTERS : CHAT_STARTERS).map((starter) => <button type="button" key={starter} disabled={!online} onClick={(event) => send(event, starter)}><span>{starter}</span><ChevronRight size={15} /></button>)}</div>}
          {busy && <div className="ai-message-row assistant"><p className="ai-thinking"><i /><i /><i /></p></div>}
          {error && <div className="ai-assistant-error" role="alert">{error}</div>}
          <span ref={end} />
        </div>
        <form className="ai-assistant-composer" onSubmit={send}>
          <div><textarea ref={input} rows="1" maxLength="800" value={draft} disabled={busy || !online} onChange={(event) => setDraft(event.target.value)} placeholder={online ? tr('Ask about a banana leaf…') : tr('Reconnect to use Ask Dahon')} /><button type="submit" aria-label="Send message" disabled={busy || !online || !draft.trim()}><Send size={18} /></button></div>
          <small>{tr('General guidance only')}</small>
        </form>
      </>}
    </section>}
    {!open && <button type="button" className="ai-assistant-launcher" aria-label="Open Ask Dahon" title={tr('Ask Dahon')} onClick={() => setOpen(true)}><MessageCircle size={22} /></button>}
  </div>;
}

function Shell({ role, user, path, navigate, onSignedOut, children, online, badges = {} }) {
  const items = role === 'admin' ? ADMIN_NAV : role === 'agricultural_expert' ? EXPERT_NAV : FARMER_NAV;
  const normalizedPath = ['/admin/farmers', '/admin/experts'].includes(path) ? '/admin/accounts' : path;
  const currentSection = items.find(([route]) => route === normalizedPath)?.[1] || 'Home';
  const [open, setOpen] = useState(false);
  const signOut = async () => { await onSignedOut(); };

  useEffect(() => {
    const desktopViewport = window.matchMedia('(min-width: 1051px)');
    const closeAtDesktopSize = (event) => { if (event.matches) setOpen(false); };
    desktopViewport.addEventListener('change', closeAtDesktopSize);
    return () => desktopViewport.removeEventListener('change', closeAtDesktopSize);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return <div className={`role-shell ${role}-shell`}>
    {open && <button type="button" className="role-scrim" aria-label="Close menu" onClick={() => setOpen(false)} />}
    <aside id="role-navigation" className={`role-sidebar ${open ? 'open' : ''}`} aria-label="Primary navigation">
      <div className="role-brand">
        <span><LogoMark inverse /></span>
        <div><strong>DahonMD</strong></div>
        <IconButton label="Close menu" onClick={() => setOpen(false)}><X size={19} /></IconButton>
      </div>
      <nav>{items.filter(([route]) => !route.endsWith('/profile')).map(([route, label, Icon]) => {
        const active = normalizedPath === route;
        return <button key={route} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={() => { navigate(route); setOpen(false); }}>
          <Icon size={18} />
          <span>{label}</span>
          {badges[route] > 0 && <b className="nav-badge" aria-label={`${badges[route]} waiting`}>{badges[route] > 9 ? '9+' : badges[route]}</b>}
        </button>;
      })}</nav>
      <div className="role-sidebar-spacer" />
      <div className="sidebar-footer">
        <button className="sidebar-account" onClick={() => { navigate(role === 'admin' ? '/admin/profile' : role === 'agricultural_expert' ? '/expert/profile' : '/farmer/profile'); setOpen(false); }}><span><AvatarContent user={user} /></span><div><strong>{user.name}</strong><small>{role === 'admin' ? 'Administrator' : role === 'agricultural_expert' ? 'Agriculturist' : 'Farmer account'}</small></div></button>
        <div className="sidebar-footer-actions">
          {role === 'farmer' && <div className={`sidebar-network ${online ? '' : 'offline'}`}><span>{online ? 'Online' : 'Offline'}</span></div>}
          <button className="sidebar-logout" onClick={signOut}><LogOut size={16} />Log out</button>
        </div>
      </div>
    </aside>
    <main className="role-main">
      <header className="role-topbar">
        <IconButton label="Open menu" aria-controls="role-navigation" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={21} /></IconButton>
        <div className="role-header-brand"><strong>{currentSection}</strong></div>
        {role === 'farmer' && <span className={`top-network ${online ? '' : 'offline'}`}>{online ? <Cloud size={15} /> : <CloudOff size={15} />}{online ? 'Online' : 'Offline'}</span>}
      </header>
      <div className="role-page">{children}</div>
    </main>
    {role === 'farmer' && <nav className="farmer-bottom-nav">{FARMER_NAV.map(([route, label, Icon]) => <button key={route} className={path === route || (route === '/farmer/diseases' && path === '/farmer/library') ? 'active' : ''} onClick={() => navigate(route)}><Icon size={20} /><span>{label}</span></button>)}</nav>}
    <AssistantWidget user={user} online={online} />
  </div>;
}

function FarmerShell({ user, path, navigate, onSignedOut, online, children, badges = {}, chatTopic = null }) {
  const items = FARMER_NAV.filter(([route]) => !route.endsWith('/profile'));
  const signOut = async () => { await onSignedOut(); };
  return <div className="role-shell farmer-shell farmer-mobile-shell">
    <header className="farmer-mobile-header">
      <a className="farmer-mobile-brand" href="/farmer/dashboard" onClick={(event) => { event.preventDefault(); navigate('/farmer/dashboard'); }}>
        <span><LogoMark /></span>
        <div><strong>DahonMD</strong></div>
      </a>
      <div className="farmer-header-actions">
        <IconButton label={tr('Log out')} title={tr('Log out')} onClick={signOut}><LogOut size={18} /></IconButton>
        <button className="farmer-header-avatar" aria-label={tr('Open profile')} title={tr('Profile')} onClick={() => navigate('/farmer/profile')}><AvatarContent user={user} /></button>
      </div>
    </header>
    <main className="farmer-mobile-main">
      <div className="role-page">{children}</div>
    </main>
    <nav className="farmer-mobile-nav" aria-label="Primary navigation">
      {items.map(([route, label, Icon]) => {
        const active = path === route || (route === '/farmer/diseases' && path === '/farmer/library');
        return <button key={route} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={() => navigate(route)}><span className="nav-icon"><Icon size={21} />{badges[route] > 0 && <b className="nav-badge" aria-label={`${badges[route]} new`}>{badges[route] > 9 ? '9+' : badges[route]}</b>}</span><span>{tr(label)}</span></button>;
      })}
    </nav>
    <AssistantWidget user={user} online={online} scanTopic={chatTopic} />
  </div>;
}

function RecentCard({ record, onOpen }) {
  const name = record.disease?.name || (record.diseaseId === 'development-unconfigured' ? 'Development result' : titleCase(record.diseaseId));
  const reviewed = record.review && record.review.review_status !== 'pending';
  const reviewTitle = reviewed ? farmerReviewOutcome(record.review, record.predictedClass).title : null;

  return <button className="recent-scan-card" onClick={() => onOpen(record)}>
    <span className="recent-thumb">{record.image ? <img src={record.image} alt="Saved banana leaf" /> : <Leaf size={24} />}</span>
    <span className="recent-copy">
      <strong>{reviewTitle || (record.confidence < THRESHOLD ? tr('Uncertain result') : record.diseaseId === 'healthy' ? tr('No supported pattern detected') : name)}</strong>
      <small>{reviewed ? tr('Original AI result: {name}', { name }) : confidenceText(record.confidence)}</small>
      <small>{formatDate(record.date, true)}{record.review?.review_status === 'pending' ? (reviewInProgress(record) ? tr(' · Expert reviewing now') : tr(' · Waiting for an expert')) : ''}</small>
      {isNewReview(record.review) && <small className="new-review-label">{tr('New expert review')}</small>}
    </span>
    <span className={`recent-status ${record.synced ? 'synced' : record.syncStatus === 'failed' ? 'failed' : 'waiting'}`}>{record.synced ? <><Cloud size={15} />{tr('Synced')}</> : record.syncStatus === 'failed' ? <><CloudOff size={15} />{tr('Needs retry')}</> : <><CloudOff size={15} />{tr('Waiting to sync')}</>}</span>
    <ChevronRight size={18} />
  </button>;
}

function historyPhotoPreview(uri) {
  return new Promise((resolve, reject) => {
    const photo = new Image();
    photo.onload = () => {
      const scale = Math.min(1, 1200 / Math.max(photo.naturalWidth, photo.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) { reject(new Error('Photo preview could not be created.')); return; }
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(photo, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    photo.onerror = () => reject(new Error('Photo preview could not be loaded.'));
    photo.src = uri;
  });
}

function FarmerHome({ user, records, online, navigate, onOpen, pendingChanges }) {
  const uncertain = records.filter((record) => record.confidence < THRESHOLD && (!record.review || record.review.review_status === 'pending')).length;
  const newReviews = records.filter((record) => isNewReview(record.review)).length;
  const nextTitle = newReviews ? tr('{count} new expert review(s)', { count: newReviews }) : uncertain ? tr('Review an uncertain result') : pendingChanges ? tr('Keep your scans in sync') : records.length ? tr('Keep an eye on your leaves') : tr('Start with your first leaf');
  const nextText = newReviews ? tr('An agriculturist has assessed your scan. Open History to read the result and next steps.') : uncertain ? tr('{count} saved result(s) were not sure. Compare visible signs in the guide or ask an expert.', { count: uncertain }) : pendingChanges ? tr('{count} browser change(s) waiting. They upload automatically when you are online.', { count: pendingChanges }) : records.length ? tr('Check your saved results or scan a new leaf if its appearance changes.') : tr('Scan one clear leaf photo to create your first saved result.');

  return <div className="role-stack farmer-dashboard">
    <Welcome user={user} text={tr('Scan a leaf or check your saved results below.')} />

    <section className="farmer-dashboard-hero">
      <div className="farmer-dashboard-hero-copy">
        <h2>{tr('Scan a banana leaf')}</h2>
        <p>{tr('Take a photo to see a screening result and practical next steps.')}</p>
        <button className="farmer-dashboard-scan" onClick={() => navigate('/farmer/scan')}><Camera size={18} />{tr('Start a scan')}<ChevronRight size={18} /></button>
      </div>
      <div className="farmer-dashboard-hero-art" aria-hidden="true"><LogoMark inverse /></div>
    </section>

    <section className="farmer-dashboard-stats" aria-label="Your scan overview">
      <div><span><History size={19} /></span><strong>{records.length}</strong><small>{tr('Saved scans')}</small></div>
      <div><span className="warm"><AlertTriangle size={19} /></span><strong>{uncertain}</strong><small>{tr('Uncertain')}</small></div>
      <div><span><Cloud size={19} /></span><strong>{pendingChanges}</strong><small>{tr('To sync')}</small></div>
    </section>

    <section className="farmer-dashboard-next">
      <span className="farmer-dashboard-next-icon">{newReviews ? <Bell size={21} /> : uncertain ? <AlertTriangle size={21} /> : pendingChanges ? <Cloud size={21} /> : <Lightbulb size={21} />}</span>
      <div><h2>{nextTitle}</h2><p>{nextText}</p><button onClick={() => navigate(newReviews || uncertain || pendingChanges || records.length ? '/farmer/history' : '/farmer/scan')}>{newReviews ? tr('Read review') : uncertain || pendingChanges || records.length ? tr('Open history') : tr('Start scanning')}<ChevronRight size={16} /></button></div>
    </section>

    {!online && <section className="farmer-sync-banner offline">
      <CloudOff size={22} />
      <div><strong>{tr('You\'re offline')}</strong><p>{tr('Saved results stay in this browser and upload automatically when the connection returns.')}</p></div>
    </section>}

    {online && <section className="farmer-sync-banner">
      <Cloud size={22} />
      <div><strong>{pendingChanges ? tr('{count} browser change(s) waiting', { count: pendingChanges }) : tr('Browser history is connected')}</strong><p>{tr('Scans sync automatically with your other devices while you are online.')}</p></div>
    </section>}

    <section className="farmer-dashboard-lower">
      <section className="panel farmer-dashboard-photo">
        <div className="farmer-dashboard-photo-heading"><span><Camera size={20} /></span><div><h2>{tr('Before you scan')}</h2><p>{tr('A clear photo gives the scanner more to work with.')}</p></div></div>
        <Tips />
      </section>
      <nav className="panel quick-help farmer-dashboard-links" aria-label="Farmer shortcuts">
        <h2>{tr('Useful links')}</h2>
        <button onClick={() => navigate('/farmer/diseases')}>
          <BookOpen size={19} />
          <span><strong>{tr('Disease guide')}</strong><small>{tr('Compare visible signs and read verified guidance.')}</small></span>
          <ChevronRight size={18} />
        </button>
        <button onClick={() => navigate('/farmer/history')}>
          <History size={19} />
          <span><strong>{tr('Scan history')}</strong><small>{tr('Return to your saved results.')}</small></span>
          <ChevronRight size={18} />
        </button>
      </nav>
    </section>

    {records.length > 0 && <section className="panel farmer-recent">
      <div className="panel-heading">
        <h2>{tr('Recent scans')}</h2>
        <button className="text-button" onClick={() => navigate('/farmer/history')}>{tr('View all')}<ChevronRight size={17} /></button>
      </div>
      {records.slice(0, 3).map((record) => <RecentCard key={record.id} record={record} onOpen={onOpen} />)}
    </section>}
  </div>;
}

function Tips() {
  return <ul className="photo-checklist" aria-label="Photo checklist">
    <li><Check size={16} />{tr('Use bright, even light.')}</li>
    <li><Check size={16} />{tr('Center one leaf.')}</li>
    <li><Check size={16} />{tr('Keep symptoms in focus.')}</li>
  </ul>;
}

function FarmerScan({ onSaved, navigate, online, onAuthRequired, showHeading = true, autoStartCamera = true }) {
  const cameraInput = useRef(null); const galleryInput = useRef(null); const video = useRef(null); const cameraStream = useRef(null); const cameraRequest = useRef(0); const [image, setImage] = useState(null); const [imageFile, setImageFile] = useState(null); const [fileName, setFileName] = useState(''); const [stage, setStage] = useState('choose'); const [result, setResult] = useState(null); const [comparison, setComparison] = useState(null); const [error, setError] = useState(''); const [cameraStatus, setCameraStatus] = useState('idle');
  const stopCamera = useCallback(() => { cameraRequest.current += 1; cameraStream.current?.getTracks().forEach((track) => track.stop()); cameraStream.current = null; if (video.current) video.current.srcObject = null; }, []);
  const startCamera = useCallback(async () => {
    stopCamera(); setCameraStatus('starting'); setError('');
    const request = cameraRequest.current;
    if (!navigator.mediaDevices?.getUserMedia) { setCameraStatus('unavailable'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      if (request !== cameraRequest.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      cameraStream.current = stream;
      if (video.current) { video.current.srcObject = stream; await video.current.play(); }
      if (request !== cameraRequest.current) return;
      setCameraStatus('active');
    } catch {
      if (request === cameraRequest.current) { stopCamera(); setCameraStatus('unavailable'); }
    }
  }, [stopCamera]);
  useEffect(() => {
    if (autoStartCamera && window.matchMedia('(max-width: 760px), (pointer: coarse)').matches) startCamera();
    return stopCamera;
  }, [autoStartCamera, startCamera, stopCamera]);
  const useFile = (file) => { if (!file?.type.startsWith('image/')) { setError("We couldn't use this photo. Please choose another image."); return; } stopCamera(); if (image?.startsWith('blob:')) URL.revokeObjectURL(image); setImage(URL.createObjectURL(file)); setImageFile(file); setFileName(file.name); setStage('preview'); setError(''); };
  const takePhoto = () => {
    const source = video.current;
    if (!source?.videoWidth || !source?.videoHeight) { setError('The camera is still getting ready. Please try again.'); return; }
    const canvas = document.createElement('canvas'); canvas.width = source.videoWidth; canvas.height = source.videoHeight; canvas.getContext('2d').drawImage(source, 0, 0);
    stopCamera(); setCameraStatus('idle');
    canvas.toBlob((blob) => { if (!blob) { setError("We couldn't capture this photo. Please try again."); return; } useFile(new File([blob], `banana-leaf-${Date.now()}.jpg`, { type: 'image/jpeg' })); }, 'image/jpeg', .92);
  };
  const reset = () => { if (image?.startsWith('blob:')) URL.revokeObjectURL(image); setImage(null); setImageFile(null); setFileName(''); setResult(null); setComparison(null); setStage('choose'); setError(''); setCameraStatus('idle'); if (autoStartCamera && window.matchMedia('(max-width: 760px), (pointer: coarse)').matches) startCamera(); };
  const check = async () => {
    stopCamera(); setCameraStatus('idle'); setStage('checking'); setComparison(null); setError('');
    const comparePhoto = async () => {
      if (!onSaved) return { status: 'unavailable', message: 'Log in to run the connected thesis comparison.' };
      if (!online) return { status: 'unavailable', message: 'Connect to the internet to run the thesis comparison.' };
      if (!imageFile) return { status: 'unavailable', message: 'The built-in sample is for interface testing. Take or choose a photo to compare both models.' };
      const body = new FormData(); body.append('image', imageFile);
      try { const payload = await api('/research/model-comparison', { method: 'POST', body }); return { status: 'ready', data: payload.data }; }
      catch (exception) { return { status: 'unavailable', message: exception.message }; }
    };
    try {
      const [screening, research] = await Promise.all([analyzeLeaf(image), comparePhoto()]);
      setResult(screening); setComparison(research); setStage('result');
    } catch { setError(tr('Something went wrong. Please try again.')); setStage('preview'); }
  };
  const save = async (requestReview = false, farmerNotes = '') => { if (!onSaved) { onAuthRequired?.('login'); return; } try { const savedPhoto = imageFile ? await historyPhotoPreview(image) : image; await onSaved({ diseaseId: result.diseaseId, confidence: result.confidence, latency: result.latency, date: new Date().toISOString(), source: 'web', model: result.model, isSimulated: Boolean(result.is_simulated), inferenceReceipt: result.inference_receipt || null, probabilities: normalizeClassProbabilities(result), image: savedPhoto, farmerNotes }, imageFile, requestReview); navigate('/farmer/history'); } catch { setError(tr('The result or photo could not be saved in this browser. Please try again.')); } };
  if (stage === 'result') return <FarmerResult image={image} result={result} comparison={comparison} onReset={reset} onSave={save} navigate={navigate} error={error} />;
  return <div className="role-stack scan-page">
    <Heading title={tr('Scan a leaf')} text={image ? tr('Check the leaf and affected area before continuing.') : tr('Take or choose a clear banana leaf photo.')} />
    <section className="farmer-scan-layout">
      <div className="panel scan-photo-panel">
        {image ? (
          <figure className="selected-photo-card">
            <div className="selected-photo-frame">
              <img src={image} alt="Selected banana leaf" />
            </div>
            <figcaption><FileImage size={15} />{fileName}</figcaption>
          </figure>
        ) : cameraStatus === 'idle' ? (
          <div className="scan-drop-frame" onDrop={(event) => { event.preventDefault(); useFile(event.dataTransfer.files[0]); }} onDragOver={(event) => event.preventDefault()}>
            <ImagePlus size={40} />
            <h2>{tr('No photo selected')}</h2>
            <p>{tr('Center one leaf in good light.')}</p>
          </div>
        ) : (
          <div className={`camera-scanner ${cameraStatus}`} onDrop={(event) => { event.preventDefault(); useFile(event.dataTransfer.files[0]); }} onDragOver={(event) => event.preventDefault()}>
            <video ref={video} autoPlay muted playsInline aria-label="Live rear camera preview" />
            <div className="camera-frame" aria-hidden="true"><i /><i /><i /><i /></div>
            {cameraStatus === 'starting' && <div className="camera-message"><RefreshCw className="spin" size={30} /><h2>{tr('Opening camera...')}</h2><p>{tr('Allow camera access when your browser asks.')}</p></div>}
            {cameraStatus === 'unavailable' && <div className="camera-message"><span><Camera size={36} /></span><h2>{tr('Camera did not open')}</h2><p>{tr('Allow camera access, or use your phone\'s camera picker below.')}</p><button className="primary-button" onClick={() => cameraInput.current?.click()}><Camera size={18} />{tr('Use phone camera')}</button><button className="text-button" onClick={startCamera}>{tr('Try live camera again')}</button></div>}
            {cameraStatus === 'active' && <div className="camera-live-controls"><small>{tr('Keep the affected area in focus')}</small><button className="camera-shutter" aria-label="Take photo" onClick={takePhoto}><span /></button></div>}
            <div className="camera-source-actions">
              <button className="secondary-button" onClick={() => galleryInput.current?.click()}><ImagePlus size={18} />{tr('Choose from file')}</button>
              <button className="sample-link" onClick={() => { stopCamera(); setImage('/assets/sigatoka-sample.webp'); setFileName('Development sample'); setStage('preview'); }}>Use development sample</button>
            </div>
          </div>
        )}
        {!image && cameraStatus === 'idle' && <div className="scan-source-actions">
          <button className="scan-source-camera" onClick={startCamera}><Camera size={22} />{tr('Camera')}</button>
          <button className="scan-source-gallery" onClick={() => galleryInput.current?.click()}><ImagePlus size={22} />{tr('Gallery')}</button>
        </div>}
        {!image && cameraStatus === 'idle' && <p className="scan-tip-row"><Lightbulb size={17} /><span>{tr('Keep the whole leaf visible and avoid shadows.')}</span></p>}
        {!image && cameraStatus === 'idle' && <button className="scan-sample-link" onClick={() => { setImage('/assets/sigatoka-sample.webp'); setFileName('Development sample'); setStage('preview'); }}>Use development sample</button>}
        {image && stage !== 'checking' && <div className="scan-preview-actions"><button className="primary-button scan-check-button" onClick={check}><ScanLine size={22} />{tr('Check leaf')}</button><button className="text-button" onClick={reset}><RefreshCw size={16} />{tr('Choose a different photo')}</button></div>}
        {image && stage === 'checking' && <div className="scan-checking-card"><RefreshCw className="spin" size={18} /><span>{tr('Checking the leaf…')}</span></div>}
        <input ref={cameraInput} hidden type="file" accept="image/*" capture="environment" onChange={(event) => useFile(event.target.files[0])} />
        <input ref={galleryInput} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => useFile(event.target.files[0])} />
      </div>
      <aside className="panel scan-check-panel">
        <h2>{image ? tr('Review your photo') : tr('Take a clear photo')}</h2>
        <p>{image ? tr('Make sure the leaf is centered and easy to see.') : tr('Use these tips for a clearer result.')}</p>
        <Tips />
        <div className="development-note"><Info size={18} /><p>{tr('Results are screening support only and cannot confirm disease.')}</p></div>
      </aside>
    </section>
    {error && <div className="scan-error-card" role="alert"><AlertTriangle size={18} /><span>{error}</span></div>}
  </div>;
}

function FarmerResult({ image, result, comparison, onReset, onSave, navigate, error }) {
  const screeningUnavailable = result?.service_status === 'unavailable' || result?.diseaseId === 'development-unconfigured';
  const proposedResult = screeningUnavailable && comparison?.status === 'ready' ? comparison.data.enhanced : null;
  const researchOnly = Boolean(proposedResult);
  const unavailable = screeningUnavailable && !researchOnly;
  const probabilities = normalizeClassProbabilities(proposedResult || result);
  const highest = getHighestClass(probabilities);
  const activeDiseaseId = highest?.classKey || (researchOnly ? proposedResult.predicted_class : result.diseaseId);
  const confidence = highest ? highest.probability * 100 : researchOnly ? Number(proposedResult.confidence || 0) * 100 : Number(result.confidence || 0);
  const uncertain = !unavailable && confidence < THRESHOLD;
  const healthy = activeDiseaseId === 'healthy';
  const [disease, setDisease] = useState(null);
  const [farmerNotes, setFarmerNotes] = useState('');
  useEffect(() => {
    if (unavailable) { setDisease(null); return undefined; }
    api('/diseases').then((payload) => setDisease(payload.data.find((item) => item.slug === activeDiseaseId) || null)).catch(() => undefined);
    return undefined;
  }, [activeDiseaseId, researchOnly, unavailable]);
  const hasVerifiedGuidance = !researchOnly && !uncertain && disease?.is_verified;
  const heading = unavailable
    ? tr('Screening service unavailable')
    : researchOnly
      ? tr('Possible leaf problem')
    : uncertain
      ? tr('This scan needs another look')
      : healthy
        ? tr('No supported disease pattern was strongly detected')
        : tr('Possible disease pattern found');
  const resultName = unavailable
    ? tr('No diagnosis produced')
    : researchOnly
      ? `Possible ${disease?.name || titleCase(activeDiseaseId)}`
    : uncertain
      ? tr('No confident match')
      : disease?.name || titleCase(activeDiseaseId);
  return <div className={`role-stack scan-result-page ${researchOnly ? 'research' : unavailable ? 'unavailable' : uncertain ? 'uncertain' : 'available'}`}>
    <section className="result-title scan-result-heading">
      <button className="text-button" onClick={onReset}><ArrowLeft size={18} />{tr('Back to scan')}</button>
      <h1>{heading}</h1>
      <p>{unavailable ? tr('Your photo is safe, but the screening service did not return a classification.') : researchOnly ? tr('Here is what the photo may show and what you can safely do next.') : uncertain ? tr('The image did not match one supported class strongly enough for disease-specific guidance.') : tr('Review the screening result and recommended next steps below.')}</p>
    </section>

    <section className="scan-result-hero">
      <figure className="panel scan-result-photo">
        <img src={image} alt="Scanned banana leaf" />
        <figcaption><FileImage size={15} />{tr('Photo submitted for screening')}</figcaption>
      </figure>

      <article className="panel scan-result-card">
        <header className="scan-result-status">
          {/* The percentage leads on the left so it is the first thing a farmer reads. */}
          {!unavailable && !researchOnly
            ? <span className={`scan-result-percent${uncertain ? ' uncertain' : ''}`} aria-label={`${Math.round(confidence)}%`}>{Math.round(confidence)}%</span>
            : <span className="scan-result-status-icon"><AlertTriangle size={22} /></span>}
          <div>
            <h2>{!unavailable && !uncertain && !researchOnly && !healthy ? `Possible ${resultName}` : resultName}</h2>
          </div>
          {!unavailable && !researchOnly && <div className="scan-result-score"><CertaintyBadge value={confidence} /></div>}
          {researchOnly && <div className="scan-result-match-label"><strong>{tr('Possible match')}</strong><small>{tr('not a diagnosis')}</small></div>}
        </header>

        
        <p className="scan-result-summary">{unavailable
          ? tr('No screening result is available.')
          : researchOnly
            ? tr('Both model outputs are shown below for comparison.')
          : uncertain
              ? tr('DahonMD is not sure about this photo. Take another one in good light with the whole leaf in view.')
              : tr('Review the model result before saving it.')}</p>

        <div className="scan-next-step"><span><Leaf size={21} /></span><div><strong>{tr('What to do next')}</strong><p>{unavailable ? tr('Try again when screening is available.') : uncertain ? tr('Retake the leaf in even light with the affected area in focus. If symptoms spread, ask a local agricultural expert.') : researchOnly ? tr('Compare visible signs in the leaf guide. This experimental match is not a diagnosis.') : healthy ? tr('Keep monitoring the plant and scan again if the leaf changes.') : tr('Compare the visible signs and read the care guidance below. Ask a local expert if symptoms spread.')}</p></div></div>

        {researchOnly && <div className="farmer-result-information">
          <section className="farmer-result-caution">
            <span><Info size={19} /></span>
            <div><strong>{tr('Research comparison')}</strong><p>{tr('These outputs are experimental and are not a diagnosis.')}</p></div>
          </section>
        </div>}

        {unavailable && <div className="scan-service-notice">
          <Info size={19} />
          <div><strong>{tr('Screening unavailable')}</strong><p>{tr('Connect the model service to produce a result.')}</p></div>
        </div>}

        {uncertain && <div className="scan-retry-guide">
          <strong>{tr('For a clearer second photo')}</strong>
          <ul><li><Check size={15} />{tr('Use bright, even light')}</li><li><Check size={15} />{tr('Center one leaf')}</li><li><Check size={15} />{tr('Keep the affected area sharp')}</li></ul>
        </div>}

        <div className="scan-result-primary-actions">
          {unavailable || uncertain || researchOnly ? <button className="primary-button" onClick={onReset}><Camera size={18} />{unavailable ? tr('Return to scan') : tr('Take another photo')}</button> : <button className="primary-button" onClick={() => onSave(false, '')}><Check size={18} />{tr('Save result')}</button>}
          {!unavailable && !uncertain && !researchOnly && <button className="secondary-button" onClick={onReset}><Camera size={18} />{tr('Scan another leaf')}</button>}
          {researchOnly && <button className="secondary-button" onClick={() => navigate('/farmer/diseases')}><BookOpen size={18} />{tr('Open leaf guide')}</button>}
          {uncertain && !researchOnly && <button className="text-button" onClick={() => onSave(false, '')}>{tr('Save to history without review')}</button>}
        </div>

        {!unavailable && probabilities.length > 0 && <details className="scan-model-details"><summary>{tr('See model scores')}<ChevronDown size={18} /></summary><ProbabilityBreakdown probabilities={probabilities} predictedClass={activeDiseaseId} /></details>}

        {uncertain && !researchOnly && <details className="scan-review-request">
          <summary><span><ShieldCheck size={19} /><span><strong>{tr('Ask an expert to check')}</strong><small>{tr('An expert looks at your photo and tells you what to do')}</small></span></span><ChevronDown size={18} /></summary>
          <div>
            <label className="farmer-review-notes">{tr('Tell the expert what you see (optional)')}<textarea value={farmerNotes} onChange={(event) => setFarmerNotes(event.target.value)} placeholder="Example: the spots spread after rain." maxLength={1000} /></label>
            <button className="primary-button full" onClick={() => onSave(true, farmerNotes)}><ShieldCheck size={17} />{tr('Save & ask an expert')}</button>
          </div>
        </details>}
      </article>
    </section>

    {comparison?.status === 'ready' && <details className="scan-comparison-details"><summary>{tr('Compare both models')}<ChevronDown size={18} /></summary><FarmerComparison image={image} comparison={comparison.data} /></details>}

    {hasVerifiedGuidance && <section className="result-guidance">
      <header className="result-guidance-heading">
        <h2>{tr('Understand the results and take the right steps')}</h2>
        <p>{tr('Here\'s what this class means and how to manage it in your field.')}</p>
      </header>
      <div className="result-guidance-grid">
        <article className="panel result-guidance-card">
          <header className="guidance-card-heading"><span><Leaf size={25} /></span><div><h3>{tr('What this class means')}</h3><p>{disease.name || titleCase(activeDiseaseId)}</p></div></header>
          <p className="guidance-description">{healthy ? tr('No supported disease pattern was strongly detected in this image. The model covers only its trained classes, so continue monitoring the plant.') : disease.description}</p>
          <div className="guidance-divider" />
          <ul className="guidance-symptoms" aria-label="Visible symptoms">{disease.symptoms?.length ? disease.symptoms.map((symptom) => <li key={symptom}><span><Check size={16} /></span>{symptom}</li>) : <li>{tr('Insufficient verified evidence available.')}</li>}</ul>
        </article>
        <article className="panel result-guidance-card result-action">
          <header className="guidance-card-heading"><span><ShieldCheck size={25} /></span><div><h3>{tr('Recommended action')}</h3><p>{tr('Keep your plants healthy and monitored')}</p></div></header>
          <div className="guidance-action-list">
            <section><span className="step-badge">1</span><div><h3>{tr('Follow good farm practices')}</h3><p>{disease.management || tr('Insufficient verified evidence available.')}</p></div></section>
            <section><span className="step-badge">2</span><div><h3>{tr('Get expert advice when needed')}</h3><p>{disease.professional_referral || tr('Ask a qualified agriculture professional when symptoms are severe, unusual, spreading rapidly, or uncertain.')}</p></div></section>
          </div>
        </article>
      </div>
    </section>}
    {!unavailable && !researchOnly && <details className="panel attention-panel"><summary><Eye size={18} />{tr('Areas the system noticed')}</summary><div><figure><img src={image} alt="Original leaf" /><figcaption>{tr('Original leaf')}</figcaption></figure><figure className="highlighted"><img src={image} alt="Illustrative highlighted preview" /><i /><figcaption>Development visualization</figcaption></figure></div><p>Highlighted areas contributed more strongly to the simulated result. They do not prove that a pathogen is present.</p></details>}
    <Warning />
    {error && <div className="scan-error-card" role="alert"><AlertTriangle size={18} /><span>{error}</span></div>}
    {!unavailable && !researchOnly && !uncertain && <div className="result-actions-bottom"><button className="primary-button" onClick={() => onSave(false, '')}>{tr('Save result')}</button></div>}
  </div>;
}

function Warning() {
  return <details className="screening-warning screening-details">
    <summary><Info size={18} />{tr('About this screening result')}</summary>
    <p>{tr('Some diseases, nutrient problems, and environmental damage can look alike in a photo. Ask a qualified agriculture or plant-health professional when symptoms are severe, unusual, spreading quickly, or the result is uncertain.')}</p>
  </details>;
}
// Same welcome for every role: the full name exactly as the user entered it.
function Welcome({ user, text }) { const name = user?.name?.trim().replace(/\s+/g, ' '); return <section className="farmer-welcome farmer-dashboard-intro"><h1>{name ? tr('Welcome, {name}', { name }) : tr('Welcome')}</h1>{text && <p>{text}</p>}</section>; }
function Heading({ title, text, action }) { return <section className="role-page-heading"><div><h1>{title}</h1>{text && <p>{text}</p>}</div>{action && <div className="role-page-actions">{action}</div>}</section>; }

function SectionHeading({ title, text }) {
  return <header className="role-section-heading">
    <h2>{title}</h2>
    {text && <p>{text}</p>}
  </header>;
}

function ProbabilityBreakdown({ probabilities, predictedClass }) {
  if (probabilities.length !== 4) return null;
  return <section className="class-probabilities" aria-label="All four model class scores">
    <h3>All class scores</h3>
    {probabilities.map(({ classKey, probability }) => {
      const barWidth = Math.min(100, Math.max(0, probability * 100));
      const rawPercent = percent(probability * 100, 2);
      const selected = classKey === predictedClass;
      return <div className={selected ? 'selected' : ''} key={classKey}>
        <span><strong>{CLASS_NAMES[classKey]}</strong>{selected && <small>Selected result</small>}</span>
        <b>{rawPercent}</b>
        <i role="img" aria-label={`${CLASS_NAMES[classKey]} ${rawPercent.replace('%', '')} percent${selected ? ', selected result' : ''}`}><em style={{ width: `${barWidth}%` }} /></i>
      </div>;
    })}
    <p>Scores are relative model outputs and are not diagnostic certainty.</p>
  </section>;
}

function ComparisonModelCard({ title, value }) {
  const modelName = title === 'Baseline' ? 'MobileNetV3-Small' : 'CA-MobileNetV3-Small';
  const probabilities = normalizeClassProbabilities(value);
  const metrics = [
    ['Prediction', titleCase(value.predicted_class)],
    ['Confidence', percent(Number(value.confidence) * 100, 2)],
    ['Inference time', `${Number(value.inference_time_ms).toFixed(2)} ms`],
    ['Model size', `${(Number(value.model_size_bytes) / 1048576).toFixed(2)} MB`],
  ];

  return <article className="comparison-card comparison-model-card">
    <header className="comparison-card-header">
      <span>{title}</span>
      <h2>{modelName}</h2>
    </header>
    <dl className="comparison-metrics">
      {metrics.map(([label, metric]) => <div key={label}>
        <dt>{label}</dt>
        <dd>{metric}</dd>
      </div>)}
    </dl>
    <ProbabilityBreakdown probabilities={probabilities} predictedClass={getHighestClass(probabilities)?.classKey || value.predicted_class} />
  </article>;
}

function ComparisonBarColumn({ pct, color, winner, side }) {
  const pixelHeight = Math.max(COMPARISON_MIN_BAR_HEIGHT, (pct / 100) * COMPARISON_PLOT_HEIGHT);
  return <span className={`comparison-bar-col ${side === 'left' ? 'left' : 'right'}${winner ? ' winner' : ''}`}>
    <span className="comparison-bar-value" style={{ bottom: pixelHeight + 3 }}>{comparisonBarLabel(pct)}</span>
    <i className="comparison-bar" style={{ height: pixelHeight, backgroundColor: color }} />
  </span>;
}

function FarmerComparison({ image, comparison }) {
  const baselineProbabilities = normalizeClassProbabilities(comparison.baseline) || [];
  const enhancedProbabilities = normalizeClassProbabilities(comparison.enhanced) || [];
  const predictionsAgree = comparison.comparison?.prediction_agreement ?? comparison.baseline?.predicted_class === comparison.enhanced?.predicted_class;

  return <section className="farmer-output-comparison panel comparison-chart-card" aria-label="Model output comparison">
    <header className="farmer-output-header">
      <div>
        <h2>Compare both models</h2>
        <p>Both models scanned the same photo and gave a score for every disease class.</p>
      </div>
      <div className="farmer-output-legend" aria-label="Comparison legend">
        <span><i className="legend-dot baseline" />Baseline</span>
        <span><i className="legend-dot enhanced" />Enhanced</span>
      </div>
    </header>

    <div className="comparison-model-split">
      <article className="comparison-model-tile baseline">
        <h3>Baseline model</h3>
        <span className="comparison-model-runtime">MobileNetV3-Small</span>
        <b>{CLASS_NAMES[comparison.baseline?.predicted_class] || titleCase(comparison.baseline?.predicted_class || '')}</b>
        <em>{percent(Number(comparison.baseline?.confidence || 0) * 100, 2)}</em>
      </article>
      <article className="comparison-model-tile enhanced">
        <h3>Enhanced model</h3>
        <span className="comparison-model-runtime">CA-MobileNetV3-Small</span>
        <b>{CLASS_NAMES[comparison.enhanced?.predicted_class] || titleCase(comparison.enhanced?.predicted_class || '')}</b>
        <em>{percent(Number(comparison.enhanced?.confidence || 0) * 100, 2)}</em>
      </article>
    </div>

    {comparison.baseline && comparison.enhanced && (
      <div className="comparison-verdict">
        <span className={predictionsAgree ? 'agree' : 'differ'}>
          {predictionsAgree ? <Check size={18} /> : <ArrowRightLeft size={18} />}
        </span>
        <p>{predictionsAgree
          ? `Both models point to ${CLASS_NAMES[comparison.enhanced.predicted_class]}.`
          : `Baseline picked ${CLASS_NAMES[comparison.baseline.predicted_class]}, enhanced picked ${CLASS_NAMES[comparison.enhanced.predicted_class]}.`}</p>
      </div>
    )}

    <div className="comparison-breakdown">
      <div className="comparison-plot-wrap">
        <div className="comparison-grid-layer">
          {COMPARISON_GRID_LEVELS.map((level) => (
            <i key={level} className="comparison-grid-line" style={{ bottom: (level / 100) * COMPARISON_PLOT_HEIGHT }} />
          ))}
        </div>
        <div className="comparison-plot-row">
          <span className="comparison-gutter" />
          {CLASS_ORDER.map((classKey) => {
            const base = baselineProbabilities.find((item) => item.classKey === classKey)?.probability ?? 0;
            const enh = enhancedProbabilities.find((item) => item.classKey === classKey)?.probability ?? 0;
            const basePick = comparison.baseline?.predicted_class === classKey;
            const enhPick = comparison.enhanced?.predicted_class === classKey;
            return <div key={classKey} className="comparison-plot-group" aria-label={`${CLASS_NAMES[classKey]} comparison`}>
              {comparison.baseline ? <ComparisonBarColumn pct={base * 100} color={COMPARISON_BASE_BAR} winner={basePick} side="left" /> : null}
              <ComparisonBarColumn pct={enh * 100} color={COMPARISON_ENHANCED_BAR} winner={enhPick} side="right" />
            </div>;
          })}
        </div>
      </div>

      <div className="comparison-axis-row">
        <span className="comparison-gutter" />
        {CLASS_ORDER.map((classKey) => (
          <span key={classKey} className="comparison-axis-label">{COMPARISON_AXIS_SHORT_NAMES[classKey]}</span>
        ))}
      </div>

      <p className="comparison-gauge-caption">Out of 100 (%). Higher bar = more likely that disease. Small matches are kept visible so no percentage disappears.</p>
      <p className="comparison-calibration-note">Enhanced percentages are calibrated so a scan is never shown as 100% certain. Both models ran on the connected screening service.</p>
    </div>
  </section>;
}

function FarmerHistory({ records, navigate, onOpen }) {
  const [query, setQuery] = useState(''); const [kind, setKind] = useState('all'); const [date, setDate] = useState(''); const [status, setStatus] = useState('all');
  const matchesStatus = (record, value) => value === 'all' || value === 'uncertain' && record.confidence < THRESHOLD || value === 'retry' && record.syncStatus === 'failed' || value === 'review' && record.review?.review_status === 'pending';
  const statusOptions = [['all', tr('All scans')], ['uncertain', tr('Uncertain')], ['retry', tr('Needs retry')], ['review', tr('Review pending')]];
  const filtered = records.filter((record) => { const reviewedClass = record.review?.review_status === 'confirmed' || record.review?.review_status === 'alternate_class' ? record.review.verified_label : null; const resultKind = (reviewedClass || record.diseaseId) === 'healthy' ? 'healthy' : 'disease'; return matchesStatus(record, status) && (kind === 'all' || kind === resultKind) && (!date || record.date?.slice(0, 10) === date) && `${record.disease?.name || record.diseaseId} ${reviewedClass ? FARMER_CLASS_NAMES[reviewedClass] || reviewedClass : ''} ${record.id}`.toLowerCase().includes(query.toLowerCase()); });
  return <div className="role-stack"><Heading title={tr('History')} text={tr('{count} saved scan(s) · newest first.', { count: records.length })} /><section className="panel history-role-panel"><div className="history-status-filters" aria-label="Filter scans by status">{statusOptions.map(([value, label]) => <button key={value} type="button" className={status === value ? 'active' : ''} aria-pressed={status === value} onClick={() => setStatus(value)}>{label} {records.filter((record) => matchesStatus(record, value)).length}</button>)}</div><div className="friendly-filters"><label><Search size={18} /><input placeholder="Search scans" value={query} onChange={(event) => setQuery(event.target.value)} /></label><select aria-label="Filter by result" value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">{tr('All results')}</option><option value="healthy">{tr('Healthy')}</option><option value="disease">{tr('Possible disease')}</option></select><input aria-label="Filter by date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>{filtered.map((record) => <RecentCard key={record.id} record={record} onOpen={onOpen} />)}{!filtered.length && <Empty icon={History} title={records.length ? tr('No matching scans') : tr('No saved scans yet')} text={records.length ? tr('Adjust your filters and try again.') : tr('Scan your first leaf to start your history.')} action={!records.length ? () => navigate('/farmer/scan') : undefined} actionLabel="Scan a leaf" />}</section></div>;
}

function DiseaseGuide({ initialClass = null, navigate, onOpenLibrary }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    api('/diseases')
      .then((payload) => { const guides = [...payload.data, ...ADDITIONAL_LEAF_GUIDES]; setItems(guides); setSelected(guides.find((item) => item.model_class_key === initialClass) || guides[0] || null); })
      .catch(() => { setItems(ADDITIONAL_LEAF_GUIDES); setSelected(ADDITIONAL_LEAF_GUIDES[0]); })
      .finally(() => setLoading(false));
  }, [initialClass]);

  if (loading) return <Loading text="Loading disease guide..." />;

  const media = selected ? GUIDE_MEDIA[selected.slug] : null;
  const guideImages = media?.images || (selected?.image_url ? [selected.image_url] : []);
  const coverImage = guideImages[0];

  return <div className="role-stack">
    <Heading title={tr('Banana leaf guide')} text={tr('Browse leaf conditions and practical management steps. The scan identifies only its four trained classes.')} />
    {navigate && <GuideTabs active="conditions" navigate={navigate} onOpenLibrary={onOpenLibrary} />}
    {!items.length ? <Empty icon={BookOpen} title="DISEASE CONTENT PENDING" text="No source-verified disease guide records are available yet." /> : <section className="guide-role-layout">
      <label className="guide-mobile-picker">
        <span><Leaf size={16} fill="currentColor" />Choose a leaf guide</span>
        <div className="guide-picker-control">
          {coverImage ? <img src={coverImage} alt="" /> : <i><Leaf size={20} /></i>}
          <select value={selected?.id ?? ''} onChange={(event) => { setSelected(items.find((item) => String(item.id) === event.target.value) || items[0]); setMoreOpen(false); }}>
            {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <ChevronDown size={18} aria-hidden="true" />
        </div>
      </label>
      <div className="guide-role-list">{items.map((item) => { const itemImage = GUIDE_MEDIA[item.slug]?.images[0] || item.image_url; return <button className={selected?.id === item.id ? 'active' : ''} key={item.id} onClick={() => setSelected(item)}>{itemImage ? <img src={itemImage} alt="" /> : <span><Leaf size={23} /></span>}<div><strong>{item.name}</strong><small>{item.short_description || item.description}</small></div><ChevronRight size={18} /></button>; })}</div>
      {selected && <article className="panel guide-role-detail">
        <header className="guide-detail-intro">
          <div>
            <span className="guide-verified-badge"><Check size={12} />{selected.model_class_key ? 'Disease guide' : 'Guide only · not a scan result'}</span>
            <h2>{selected.name}</h2>
            {selected.scientific_name && <p className="scientific-name">{selected.scientific_name}</p>}
          </div>
          {coverImage && <img src={coverImage} alt={`Representative field example of ${selected.name}`} />}
        </header>
        <section className="guide-look-section">
          <span className="guide-section-icon"><Search size={21} /></span>
          <div><h3>What it looks like</h3><p>{selected.description}</p></div>
        </section>
        <section className="guide-symptom-card">
          <div>
            <h3><Leaf size={16} />Key symptoms</h3>
            <ul>{selected.symptoms?.map((symptom) => <li key={symptom}><span><Check size={12} /></span>{symptom}</li>)}</ul>
          </div>
          {guideImages[1] && <img src={guideImages[1]} alt={`${selected.name} symptom example`} loading="lazy" />}
        </section>
        {guideImages.length > 0 && <section className="guide-gallery-section">
          <div className="guide-gallery-heading"><span className="guide-section-icon"><FileImage size={20} /></span><h3>Sample images</h3></div>
          <div className="guide-image-gallery">{guideImages.map((imageUrl, index) => <a key={imageUrl} href={imageUrl} target="_blank" rel="noreferrer"><img src={imageUrl} alt={`${selected.name} field example ${index + 1}`} loading="lazy" /></a>)}</div>
          {media && <p className="guide-image-credit">Field examples from <a href={media.sourceUrl} target="_blank" rel="noreferrer">{media.source}</a>, <a href={media.license === 'CC0' ? 'https://creativecommons.org/publicdomain/zero/1.0/' : 'https://creativecommons.org/licenses/by/4.0/'} target="_blank" rel="noreferrer">{media.license || 'CC BY 4.0'}</a>. Reference images are not diagnostic confirmation.</p>}
        </section>}
        {selected.slug !== 'healthy' && <details className="guide-products"><summary>Show products used</summary>{GUIDE_PRODUCTS[selected.slug]?.length ? <><p>The Philippine FPA lists these products for banana and the matching condition. Confirm the diagnosis, current registration and label with an agriculturist before buying or spraying.</p>{GUIDE_PRODUCTS[selected.slug].map((product) => <div className="guide-product" key={product.name}><strong>{product.name}</strong><p>{product.description}</p><a href={product.sourceUrl} target="_blank" rel="noreferrer">Check FPA listing</a></div>)}</> : <p>No curative or condition-specific product is listed here. Follow the management steps and ask an agriculturist before using a pesticide.</p>}</details>}
        {onOpenLibrary && selected.model_class_key && <button type="button" className="secondary-button guide-library-link" onClick={() => onOpenLibrary(selected.model_class_key)}><Library size={18} />{tr('Read articles about this')}<ChevronRight size={17} /></button>}
        <button type="button" className="guide-more-toggle" aria-expanded={moreOpen} aria-controls="guide-more-content" onClick={() => setMoreOpen((current) => !current)}>{moreOpen ? 'Hide detailed guidance' : 'View detailed guidance'}<ChevronDown size={18} /></button>
        <div id="guide-more-content" className={`guide-detail-more ${moreOpen ? 'open' : ''}`}>
          {selected.slug === 'healthy' && <section className="guide-healthy-card">
            <span><Check size={18} /></span>
            <div><strong>Healthy Plant</strong><p>No treatment needed. Continue with regular care and monitoring.</p></div>
          </section>}
          <section className="guide-treatment-block">
            <div className="guide-treatment-steps">
              {selected.slug !== 'healthy' && <section className="guide-step"><span className="step-badge">1</span><div><h3>What you can do</h3><p>{selected.management || 'Insufficient verified evidence available.'}</p></div></section>}
              {selected.slug !== 'healthy' && <section className="guide-step"><span className="step-badge">2</span><div><h3>How to help prevent spread</h3><p>{selected.prevention || 'Insufficient verified evidence available.'}</p></div></section>}
              <section className="guide-step"><span className="step-badge">{selected.slug === 'healthy' ? '1' : '3'}</span><div><h3>When to seek expert help</h3><p>{selected.professional_referral || 'Ask a qualified agriculture professional when symptoms are severe, unusual, spreading rapidly, or uncertain.'}</p></div></section>
            </div>
          </section>
          <section><h3>What causes it</h3><p>{selected.causal_agent || 'Not applicable for this non-disease visual class.'}</p></section>
          <section><h3>Image-only limitations</h3><p>{selected.image_only_limitations || 'A leaf image cannot provide laboratory confirmation.'}</p></section>
          <section><h3>Research sources</h3>{selected.sources?.length ? <ol className="guide-source-list">{selected.sources.map((source) => <li key={source.id}><strong>{source.authors} ({source.year || 'n.d.'}).</strong> {source.title}. <em>{source.journal_or_institution}</em>. {source.reference_url && <a href={source.reference_url} target="_blank" rel="noreferrer">Open source</a>}</li>)}</ol> : <p>Insufficient verified evidence available.</p>}</section>
          <Warning />
        </div>
      </article>}
    </section>}
  </div>;
}

/** Lets the farmer answer a completed review, optionally with a new photo; the case returns to the agriculturists. */
function ReviewReplyForm({ onSubmit }) {
  const [open, setOpen] = useState(false); const [text, setText] = useState(''); const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  if (!open) return <button type="button" className="secondary-button" onClick={() => setOpen(true)}><MessageCircle size={16} />{tr('Reply or send a new photo')}</button>;
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await onSubmit(text.trim(), file); setOpen(false); setText(''); setFile(null); }
    catch (exception) { setError(exception.message || tr('Your reply could not be sent.')); }
    finally { setBusy(false); }
  };
  return <form className="review-reply-form" onSubmit={submit}>
    <label className="review-reply-field"><span>{tr('Reply to the agriculturist')}</span><textarea required maxLength={1000} value={text} onChange={(event) => setText(event.target.value)} placeholder={tr('What changed, or what would you like to ask?')} /></label>
    <div className="review-reply-field"><span>{tr('New photo (optional)')}</span>
      <label className="review-reply-photo"><ImagePlus size={18} /><span>{file ? file.name : tr('Choose a photo')}</span><input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
      {file && <button type="button" className="text-button" onClick={() => setFile(null)}>{tr('Remove photo')}</button>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="review-reply-note"><Info size={15} />{tr('Your earlier result is kept. The case goes back to an agriculturist.')}</p>
    <div className="confirm-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setOpen(false)}>{tr('Cancel')}</button><button className="primary-button" disabled={busy || !text.trim()}>{busy ? tr('Sending…') : tr('Send to agriculturist')}</button></div>
  </form>;
}

function DiagnosisDialog({ record, onClose, onRequestReview, onDelete, onResearchConsent, onReply, onAskAssistant, onOpenGuide }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false); const [consentError, setConsentError] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false); const [photoError, setPhotoError] = useState('');
  const changeConsent = async (granted) => { setConsentBusy(true); setConsentError(''); try { await onResearchConsent(record, granted); } catch (exception) { setConsentError(exception.message); } finally { setConsentBusy(false); } };
  const sendReviewPhoto = async () => { setPhotoBusy(true); setPhotoError(''); try { await onRequestReview(record, record.farmerNotes); } catch (exception) { setPhotoError(exception.message || tr('The photo could not be sent.')); } finally { setPhotoBusy(false); } };
  useEffect(() => { setDeleteOpen(false); setConsentError(''); setPhotoError(''); }, [record?.id]);
  if (!record) return null;
  const reviewed = record.review && record.review.review_status !== 'pending';
  return <>
    <button className="dialog-scrim" aria-label="Close result" onClick={onClose} />
    <aside className="diagnosis-dialog" role="dialog" aria-modal="true" aria-label="Saved scan result">
      <header><div><h2>{reviewed ? farmerReviewOutcome(record.review, record.predictedClass).title : record.confidence < THRESHOLD ? tr('Uncertain result') : record.disease?.name || titleCase(record.diseaseId)}</h2></div><IconButton label="Close result" onClick={onClose}><X size={20} /></IconButton></header>
      {record.image ? <img className="dialog-image" src={record.image} alt="Saved banana leaf" /> : <div className="dialog-image placeholder"><Leaf size={45} /></div>}
      <div className="confidence-plain">{reviewed && <span className="original-ai-label">{tr('Original AI result: {name}', { name: record.disease?.name || titleCase(record.diseaseId) })}</span>}<CertaintyBadge value={record.confidence} /></div>
      <dl><div><dt>{tr('Date')}</dt><dd>{formatDate(record.date, true)}</dd></div><div><dt>{tr('Source')}</dt><dd>{titleCase(record.source)}</dd></div><div><dt>{tr('Save status')}</dt><dd>{record.synced ? tr('Synced') : record.syncStatus === 'failed' ? tr('Needs retry') : tr('Waiting to sync')}</dd></div>{record.farmerNotes && <div><dt>{tr('Your notes')}</dt><dd>{record.farmerNotes}</dd></div>}</dl>
      {record.followUpError && <section className="review-notice"><AlertTriangle size={20} /><div><strong>{tr('Your review request or photo did not finish sending')}</strong><p>{record.followUpError}</p><p>{tr('It is retried each time you sync.')}</p></div></section>}
      {record.deletionError && <section className="review-notice"><AlertTriangle size={20} /><div><strong>{tr('This scan could not be deleted')}</strong><p>{record.deletionError}</p></div></section>}
      {!record.synced && <section className="review-notice"><CloudOff size={20} /><div><strong>{tr('Safely stored in this browser')}</strong><p>{tr('Reconnect to upload this record before requesting another review action.')}</p></div></section>}
      {record.review?.review_status === 'pending' && <section className="review-notice"><ShieldCheck size={20} /><div><strong>{tr(reviewInProgress(record) ? 'An expert is reviewing your {item} now' : 'Waiting for an expert to pick up your {item}', { item: record.serverImage ? tr('photo') : tr('note') })}</strong><FarmerReviewProgress inProgress={reviewInProgress(record)} /><p>{tr('You will see the answer here.')}</p>{!record.serverImage && <p>{tr('The expert cannot see the photo yet.')}</p>}{record.review.requested_at && <p className="review-meta">Sent {formatDate(record.review.requested_at, true)}</p>}{!record.serverImage && record.syncUuid && record.image?.startsWith('data:image/') && <button type="button" className="secondary-button" disabled={photoBusy} onClick={sendReviewPhoto}>{photoBusy ? tr('Sending…') : tr('Send photo to expert')}</button>}{photoError && <p className="form-error" role="alert">{photoError}</p>}{record.review.farmer_reply && <p><strong>{tr('Your reply:')}</strong> {record.review.farmer_reply}</p>}</div></section>}
      {reviewed && (() => { const outcome = farmerReviewOutcome(record.review, record.predictedClass); return <section className="review-result"><h3>{outcome.title}</h3><p>{outcome.message}</p>{record.review.farmer_message && <><p><strong>{tr('Message from {name}', { name: record.review.reviewer?.name || tr('the agriculturist') })}</strong></p><p className="reviewer-message">{record.review.farmer_message}</p></>}{outcome.steps.length > 0 && <><p><strong>{tr('What to do now')}</strong></p><ol className="farmer-review-steps">{outcome.steps.map((step) => <li key={step}>{step}</li>)}</ol></>}{(record.review.reviewer || record.review.reviewed_at) && <p className="review-meta">{record.review.reviewer ? tr('Checked by {name}', { name: record.review.reviewer.name }) : tr('Checked')}{record.review.reviewed_at ? ` · ${formatDate(record.review.reviewed_at, true)}` : ''}</p>}{record.review.verified_label && onOpenGuide && <button type="button" className="secondary-button" onClick={() => onOpenGuide(record.review.verified_label)}><BookOpen size={16} />{tr('Read about {name} in the guide', { name: titleCase(record.review.verified_label) })}</button>}{record.synced && onReply && <ReviewReplyForm onSubmit={(text, file) => onReply(record, text, file)} />}</section>; })()}
      {!record.review && record.synced && <ReviewRequestForm initialNotes={record.farmerNotes} hasPhoto={Boolean(record.serverImage || record.syncUuid && record.image?.startsWith('data:image/'))} onSubmit={(notes) => onRequestReview(record, notes)} />}
      {record.synced && record.researchConsent && <section className="review-notice"><Database size={20} /><div><strong>{tr(record.researchConsentCurrent ? 'Research consent granted' : 'Research consent needs renewal')}</strong><p>{tr('If approved, a private research copy remains after scan deletion. You can withdraw consent and remove the copy at any time.')}</p>{consentError && <p className="form-error">{consentError}</p>}<button className="secondary-button" disabled={consentBusy} onClick={() => changeConsent(false)}>{consentBusy ? tr('Saving…') : tr('Withdraw research consent')}</button></div></section>}
      {record.synced && onAskAssistant && <button className="secondary-button full" onClick={() => onAskAssistant(record)}><MessageCircle size={17} />{tr('Ask Dahon about this scan')}</button>}
      <button className="danger-button full" onClick={() => setDeleteOpen(true)}><Trash2 size={17} />{tr('Delete saved scan')}</button>
      <Warning />
    </aside>
    <ConfirmDialog open={deleteOpen} title="Delete saved scan?" text="This removes the scan and its normal photo. Any separately approved research copy remains; remove it from your profile if you want to withdraw it." confirmLabel="Delete scan" danger onCancel={() => setDeleteOpen(false)} onConfirm={() => { setDeleteOpen(false); onDelete(record); }} />
  </>;
}

function FarmerResearchPhotos() {
  const [items, setItems] = useState([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(() => api('/research-images').then((response) => setItems(response.data)).catch((exception) => setError(exception.message)), []);
  useEffect(() => { load(); }, [load]);
  const remove = async (item) => { setBusy(true); setError(''); try { await api(`/research-images/${item.id}`, { method: 'DELETE' }); await load(); } catch (exception) { setError(exception.message); } finally { setBusy(false); } };
  const visible = items.filter((item) => !item.revoked_at || item.file_removal_pending);
  return <section className="panel role-form"><h2>{tr('Approved research photos')}</h2><p>{tr('These private copies remain after you delete a scan. You can remove them here at any time. Keep the photo ID if you may request removal after account deletion.')}</p>{error && <p className="form-error">{error}</p>}{visible.map((item) => <div key={item.id} className="review-notice"><Database size={20} /><div><strong>#{item.id} · {titleCase(item.verified_label)}</strong><p>{item.file_removal_pending ? tr('Photo removal is pending; retry below.') : formatDate(item.approved_at, true)}</p><button type="button" className="danger-button" disabled={busy} onClick={() => remove(item)}>{tr(item.file_removal_pending ? 'Retry photo removal' : 'Remove research photo')}</button></div></div>)}{!visible.length && <p>{tr('No approved research photos are retained.')}</p>}</section>;
}

function ProfilePage({ user, onUser, onAccountDeleted, onResearchPreferenceChanged }) {
  const [profile, setProfile] = useState({ name: user.name, email: user.email, current_password: '' }); const [passwords, setPasswords] = useState({ current_password: '', password: '', password_confirmation: '' }); const [deletePassword, setDeletePassword] = useState(''); const [removeResearchCopies, setRemoveResearchCopies] = useState(false); const [deleteOpen, setDeleteOpen] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const emailChanged = profile.email.trim().toLowerCase() !== user.email.toLowerCase();
  const save = async (event) => { event.preventDefault(); try { const payload = await api('/profile', { method: 'PUT', body: JSON.stringify(profile) }); onUser(payload.data.user); setProfile({ name: payload.data.user.name, email: payload.data.user.email, current_password: '' }); setMessage(tr('Profile updated.')); setError(''); } catch (exception) { setError(exception.message); } }; const change = async (event) => { event.preventDefault(); try { await api('/profile/password', { method: 'PUT', body: JSON.stringify(passwords) }); setPasswords({ current_password: '', password: '', password_confirmation: '' }); setMessage(tr('Password updated.')); setError(''); } catch (exception) { setError(exception.message); } }; const remove = async () => { setBusy(true); try { await api('/profile', { method: 'DELETE', body: JSON.stringify({ current_password: deletePassword, remove_research_copies: removeResearchCopies }) }); setToken(null); await onAccountDeleted(); } catch (exception) { setError(exception.message); setDeleteOpen(false); } finally { setBusy(false); } };
  const resendVerification = async () => { try { const payload = await api('/auth/verification-notification', { method: 'POST' }); setMessage(payload.message); setError(''); } catch (exception) { setError(exception.message); } };
  const changeResearchPreference = async (enabled) => { setBusy(true); setError(''); try { const payload = await api('/profile/research-consent', { method: 'PUT', body: JSON.stringify({ research_photo_consent: enabled }) }); onUser(payload.data.user); await onResearchPreferenceChanged?.(); setMessage(enabled ? 'Future account scans will be shared for research consideration.' : 'Research sharing is off. Existing consent has been withdrawn.'); } catch (exception) { setError(exception.message); } finally { setBusy(false); } };
  const [photoBusy, setPhotoBusy] = useState(false);
  const changePhoto = async (file) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError(tr('Choose a JPG, PNG, or WebP photo.')); return; }
    if (file.size > 5 * 1024 * 1024) { setError(tr('Choose a photo smaller than 5 MB.')); return; }
    setPhotoBusy(true);
    try { const body = new FormData(); body.append('avatar', file); const payload = await api('/profile/avatar', { method: 'POST', body }); onUser(payload.data.user); setMessage(tr('Profile photo updated.')); setError(''); }
    catch (exception) { setError(exception.message); } finally { setPhotoBusy(false); }
  };
  const removePhoto = async () => { setPhotoBusy(true); try { const payload = await api('/profile/avatar', { method: 'DELETE' }); onUser(payload.data.user); setMessage(tr('Profile photo removed.')); setError(''); } catch (exception) { setError(exception.message); } finally { setPhotoBusy(false); } };
  return <div className="role-stack"><Heading title={tr('Profile')} text={tr('Keep your account information simple and up to date.')} /><section className="panel language-panel" aria-label={tr('Language')}><h2>{tr('Language')} / {getLanguage() === 'fil' ? 'Language' : 'Wika'}</h2><div className="language-options">{[['en', 'English'], ['fil', 'Filipino']].map(([value, label]) => <button key={value} type="button" className={getLanguage() === value ? 'active' : ''} aria-pressed={getLanguage() === value} onClick={() => setLanguage(value)}>{label}</button>)}</div></section><section className="panel profile-photo-panel"><span className="profile-photo"><AvatarContent user={user} /></span><div><h2>{tr('Profile photo')}</h2><p>{tr('Optional. Use a clear photo of your face. JPG, PNG, or WebP up to 5 MB.')}</p><div className="profile-photo-actions"><label className={`secondary-button${photoBusy ? ' disabled' : ''}`}><Camera size={17} />{photoBusy ? 'Saving…' : user.avatar_url ? tr('Change photo') : tr('Upload photo')}<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={photoBusy} onChange={(event) => { changePhoto(event.target.files?.[0]); event.target.value = ''; }} /></label>{user.avatar_url && <button type="button" className="text-button" disabled={photoBusy} onClick={removePhoto}>{tr('Remove photo')}</button>}</div></div></section>{!user.email_verified_at && <section className="review-notice"><Mail size={20} /><div><strong>{tr('Verify your email address')}</strong><p>{tr(user.role === 'farmer' ? 'Verify your email so you can reset your password if you forget it. You can still scan and ask an expert without it. Open the link sent to {email}.' : 'Agriculturist and administrator tools need a verified email. Open the link sent to {email}.', { email: user.email })}</p><button type="button" className="secondary-button" onClick={resendVerification}>{tr('Resend verification email')}</button></div></section>}<section className="profile-role-grid"><form className="panel role-form" onSubmit={save}><h2>{tr('Edit Profile')}</h2><label>{tr('Name')}<input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} required /></label><label>{tr('Email')}<input type="email" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} required /></label><label>{emailChanged ? tr('Current password') : tr('Current password (required only to change email)')}<input type="password" autoComplete="current-password" value={profile.current_password} onChange={(event) => setProfile({ ...profile, current_password: event.target.value })} required={emailChanged} /></label><button className="primary-button">{tr('Save Profile')}</button></form><form className="panel role-form" onSubmit={change}><h2>{tr('Change Password')}</h2><label>{tr('Current password')}<input type="password" value={passwords.current_password} onChange={(event) => setPasswords({ ...passwords, current_password: event.target.value })} required /></label><label>{tr('New password')}<input type="password" value={passwords.password} onChange={(event) => setPasswords({ ...passwords, password: event.target.value })} required /></label><label>{tr('Confirm new password')}<input type="password" value={passwords.password_confirmation} onChange={(event) => setPasswords({ ...passwords, password_confirmation: event.target.value })} required /></label><button className="secondary-button">{tr('Update Password')}</button><button type="button" className="danger-button" onClick={() => setDeleteOpen(true)}>{tr('Delete Account')}</button></form></section>{user.role === 'farmer' && <section className="panel role-form"><h2>{tr('Research photo sharing')}</h2><p>{tr('Optional. When on, your future account scan photos are automatically considered for research after expert review. An approved private copy may remain after you delete a scan. Turning this off withdraws consent from your existing scans.')}</p><label className="research-preference"><input type="checkbox" checked={Boolean(user.research_photo_consent)} disabled={busy} onChange={(event) => changeResearchPreference(event.target.checked)} />{tr('Share my future account scan photos for research')}</label></section>}{user.role === 'farmer' && <FarmerResearchPhotos key={user.research_photo_consent ? 'research-on' : 'research-off'} />}{message && <div className="success-message">{message}</div>}{error && <div className="form-error">{error}</div>}<ConfirmDialog open={deleteOpen} title={tr('Permanently delete account?')} text={tr(user.role === 'farmer' ? 'This deletes your account and scans. Approved private research copies remain unless you choose to remove them below.' : 'This deletes the account and its associated diagnosis records. Confirm your current password to continue.')} confirmLabel="Delete My Account" danger busy={busy} confirmDisabled={!deletePassword} onCancel={() => { setDeleteOpen(false); setDeletePassword(''); }} onConfirm={remove}><label className="role-form">{tr('Current password')}<input type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} /></label>{user.role === 'farmer' && <label className="role-form"><input type="checkbox" checked={removeResearchCopies} onChange={(event) => setRemoveResearchCopies(event.target.checked)} />{tr('Also remove my approved research photos')}</label>}</ConfirmDialog></div>;
}

function Stat({ label, value, note, icon: Icon }) { return <article className="admin-stat-card"><span><Icon size={21} /></span><div><h3>{label}</h3><strong>{value}</strong><p>{note}</p></div></article>; }
function useAdmin(path, refreshMs = 0) { const [data, setData] = useState(null); const [error, setError] = useState(''); useEffect(() => { const load = () => { api(path).then((payload) => { setData(payload.data); setError(''); }).catch((exception) => setError(exception.message)); }; load(); if (!refreshMs) return undefined; const refresh = () => { if (document.visibilityState === 'visible') load(); }; const timer = setInterval(refresh, refreshMs); document.addEventListener('visibilitychange', refresh); return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); }; }, [path, refreshMs]); return { data, error }; }
function Distribution({ title, values, extra }) { return <article className="panel admin-distribution"><h2>{title}</h2>{Object.entries(values).map(([label, value]) => <div key={label}><span>{titleCase(label)}</span><strong>{value}</strong></div>)}{!Object.keys(values).length && <p className="empty-copy">No diagnoses yet.</p>}{extra && <div><span>{extra[0]}</span><strong>{extra[1]}</strong></div>}</article>; }
function DiagnosisRows({ items }) { return items.length ? items.map((item) => <div className="admin-record-row" key={item.id}>{item.image_url ? <img src={item.image_url} alt="" /> : <span className="record-placeholder"><Leaf size={20} /></span>}<div><strong>{item.review && item.review.review_status !== 'pending' ? agriculturistVerdict(item.review, item.predicted_class) : item.disease?.name || titleCase(item.predicted_class)}</strong><small>{item.user?.name || 'Unknown farmer'} · AI: {item.disease?.name || titleCase(item.predicted_class)}</small></div><span>{percent(item.confidence)}</span><span>{titleCase(item.source)} · {item.prediction_verified ? 'Server verified' : 'Client reported'}</span><time>{formatDate(item.diagnosed_at, true)}</time></div>) : <Empty icon={ScanLine} title="No diagnoses yet." text="New saved scans will appear here." />; }

function AdminDashboard({ user }) {
  const { data, error } = useAdmin('/admin/dashboard', 60000); if (error) return <div className="form-error">{error}</div>; if (!data) return <Loading text="Loading dashboard..." />;
  return <div className="role-stack"><Welcome user={user} text="Accounts, scans and disease records are summarised below." /><section className="admin-stat-grid"><Stat label="Total Farmers" value={data.total_farmers} note="Farmer accounts" icon={Users} /><Stat label="Total Diagnoses" value={data.total_diagnoses} note="Mobile and web" icon={Database} /><Stat label="Scans Today" value={data.diagnoses_today} note="Current database date" icon={Activity} /><Stat label="Average Model Confidence" value={data.average_confidence == null ? "Not available" : `${Number(data.average_confidence).toFixed(1)}%`} note="Not biological probability" icon={BarChart3} /><Stat label="Uncertain Results" value={data.uncertain_predictions} note={`${Number(data.uncertain_prediction_rate).toFixed(1)}% of records`} icon={AlertTriangle} /><Stat label="Awaiting Photo Upload" value={data.awaiting_image_uploads} note="Shared scans without a photo" icon={CloudOff} /></section><section className="admin-stat-grid" aria-label="Review turnaround"><Stat label="Reviews Waiting" value={data.review_turnaround?.waiting_requests ?? 0} note="Farmer requests not yet answered" icon={ShieldCheck} /><Stat label={`Waiting Over ${data.review_turnaround?.overdue_days ?? 3} Days`} value={data.review_turnaround?.waiting_over_overdue ?? 0} note={data.review_turnaround?.oldest_waiting_hours != null ? `Oldest: ${data.review_turnaround.oldest_waiting_hours} h` : "No requests waiting"} icon={AlertTriangle} /><Stat label="Median Answer Time" value={data.review_turnaround?.median_hours_last_30_days == null ? "—" : `${data.review_turnaround.median_hours_last_30_days} h`} note={`${data.review_turnaround?.completed_last_30_days ?? 0} reviews in the last 30 days`} icon={History} /></section><p className="scope-note">{data.verified_predictions} server-verified model results · {data.unverified_predictions} client-reported results. Model summaries below use verified results only.</p><section className="admin-overview-grid"><Distribution title="Diagnosis Distribution" values={data.diagnoses_per_class} /><Distribution title="Condition summary" values={{ healthy: data.healthy_predictions, 'possible disease': data.diseased_predictions }} /><Distribution title="Source Distribution" values={data.diagnoses_per_source} extra={['Simulated records', data.simulated_predictions]} /></section><section className="panel admin-list-panel"><h2>Recent Diagnoses</h2><DiagnosisRows items={data.recent_diagnoses} /></section></div>;
}

function AdminAnalytics() {
  const { data, error } = useAdmin('/admin/analytics'); if (error) return <div className="form-error">{error}</div>; if (!data) return <Loading text="Loading analytics..." />; const timeline = Object.entries(data.diagnoses_over_time); const max = Math.max(1, ...timeline.map(([, total]) => Number(total))); const review = data.model_review_analytics;
  return <div className="role-stack"><Heading title="Diagnosis Activity" text="Useful research summaries without fabricated performance values." /><section className="admin-stat-grid three"><Stat label="Diagnoses" value={data.total_diagnoses} note="Saved records" icon={Database} /><Stat label="Average Confidence" value={data.average_confidence == null ? "Not available" : `${Number(data.average_confidence).toFixed(1)}%`} note="Model confidence, not diagnostic certainty" icon={Activity} /><Stat label="Uncertain" value={data.uncertain_predictions} note={`${Number(data.uncertain_prediction_rate).toFixed(1)}% below ${data.confidence_threshold}%`} icon={AlertTriangle} /></section><section className="admin-overview-grid"><article className="panel analytics-chart"><h2>Diagnoses Over Time</h2>{timeline.length ? <div className="timeline-bars">{timeline.map(([date, total]) => <div key={date}><span style={{ height: `${Math.max(8, (Number(total) / max) * 100)}%` }}><b>{total}</b></span><small>{new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</small></div>)}</div> : <p className="empty-copy">No diagnosis activity yet.</p>}</article><Distribution title="Mobile versus Web" values={data.diagnoses_per_source} /><Distribution title="Condition summary" values={{ healthy: data.healthy_predictions, 'possible disease': data.diseased_predictions }} /></section><p className="scope-note">{data.verified_predictions} server-verified model results · {data.unverified_predictions} client-reported results. Agreement excludes client-reported results.</p><SectionHeading title="AI–Agriculturist Agreement" text="Structured agricultural reviews provide agreement evidence without being presented as laboratory accuracy." /><section className="admin-stat-grid"><Stat label="Reviewed Diagnoses" value={review.reviewed_diagnoses} note={`${review.comparable_reviews} comparable assessments`} icon={ShieldCheck} /><Stat label="AI–Agriculturist Agreement" value={review.agreement_rate === null ? 'Not available' : `${Number(review.agreement_rate).toFixed(1)}%`} note="Agreement, not diagnostic accuracy" icon={Check} /><Stat label="Disagreements" value={review.disagreements} note="Different supported class" icon={AlertTriangle} /><Stat label="Disagreement Confidence" value={review.average_disagreement_confidence === null ? "Not available" : `${Number(review.average_disagreement_confidence).toFixed(1)}%`} note="Average model confidence in disagreements" icon={Activity} /><Stat label="Outside Supported Classes" value={review.possible_outside_supported_classes} note="Agriculturist flagged" icon={Info} /><Stat label="Unable to Determine" value={review.unable_to_determine} note={`${review.field_inspection_required} require field inspection`} icon={Eye} /></section><section className="admin-overview-grid"><Distribution title="Most Confused Classes" values={review.most_confused_classes} /><Distribution title="Disagreements by AI Class" values={review.disagreements_by_predicted_class} /><article className="panel review-band-panel"><h2>Agreement by Confidence Band</h2>{Object.entries(review.agreement_by_confidence).map(([band, item]) => <div key={band}><span>{titleCase(band)} confidence</span><strong>{item.agreement_rate === null ? 'No comparable reviews' : `${Number(item.agreement_rate).toFixed(1)}% agreement`}</strong><small>{item.reviewed} reviewed</small></div>)}</article><Distribution title="Research Dataset Candidates" values={data.dataset_candidates} /></section><div className="development-note"><Info size={18} /><p>{review.reference_standard_note}</p></div></div>;
}

function AccountsAdmin({ initialRole = 'farmer' }) {
  const empty = { name: '', email: '', password: '', password_confirmation: '' };
  const [role, setRole] = useState(initialRole);
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const agriculturist = role === 'agricultural_expert';
  const endpoint = agriculturist ? 'experts' : 'farmers';
  const singular = agriculturist ? 'Agriculturist' : 'Farmer';
  const load = useCallback(() => api(`/admin/${endpoint}?per_page=50${search ? `&search=${encodeURIComponent(search)}` : ''}`).then((payload) => { setItems(payload.data.items); setError(''); }).catch((exception) => setError(exception.message)), [endpoint, search]);
  // Keep names and profile photos current while the list stays open.
  useEffect(() => {
    load();
    const refresh = () => { if (document.visibilityState === 'visible') load(); };
    const timer = setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [load]);
  const switchRole = (nextRole) => { setRole(nextRole); setQuery(''); setSearch(''); setMessage(''); setError(''); setModalOpen(false); setEditing(null); setForm(empty); };
  const create = () => { setEditing(null); setForm(empty); setError(''); setModalOpen(true); };
  const edit = (item) => { setEditing(item.id); setForm({ name: item.name, email: item.email, password: '', password_confirmation: '' }); setError(''); setModalOpen(true); };
  const submit = async (event) => { event.preventDefault(); setBusy(true); const data = { ...form, role }; if (editing && !data.password) { delete data.password; delete data.password_confirmation; } const verificationSent = !editing || items.find((item) => item.id === editing)?.email !== form.email.trim().toLowerCase(); try { await api(`/admin/${endpoint}${editing ? `/${editing}` : ''}`, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(data) }); setModalOpen(false); setForm(empty); setEditing(null); setMessage(`${singular} ${editing ? 'updated' : 'created'}.${verificationSent ? ' A verification email was sent; the account must verify it before using review or sharing features.' : ''}`); setError(''); load(); } catch (exception) { setError(exception.message); } finally { setBusy(false); } };
  const remove = async () => { if (!deleteTarget) return; setBusy(true); try { await api(`/admin/${endpoint}/${deleteTarget.id}`, { method: 'DELETE' }); setDeleteTarget(null); setMessage(`${singular} account deleted.`); setError(''); load(); } catch (exception) { setError(exception.message); setDeleteTarget(null); } finally { setBusy(false); } };
  return <div className="role-stack">
    <Heading title="Accounts" text="Farmers can register themselves. Administrators create agriculturist accounts only after qualifications are confirmed." action={<button className={agriculturist ? 'primary-button' : 'secondary-button'} onClick={create}><Plus size={17} />Add {singular}</button>} />
    <div className="admin-tabs" role="tablist" aria-label="Account type"><button role="tab" aria-selected={!agriculturist} className={!agriculturist ? 'active' : ''} onClick={() => switchRole('farmer')}><Users size={17} />Farmers</button><button role="tab" aria-selected={agriculturist} className={agriculturist ? 'active' : ''} onClick={() => switchRole('agricultural_expert')}><ShieldCheck size={17} />Agriculturists</button></div>
    <form className="admin-search" onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); }}><Search size={18} /><input placeholder={`Search ${agriculturist ? 'agriculturist' : 'farmer'} name or email`} value={query} onChange={(event) => setQuery(event.target.value)} /><button className="secondary-button">Search</button></form>
    {message && <div className="success-message">{message}</div>}{error && <div className="form-error">{error}</div>}
    <section className="panel admin-table-role"><header><span>{singular}</span><span>Joined</span><span>{agriculturist ? 'Role' : 'Diagnoses'}</span><span>Recent Activity</span><span>Actions</span></header>{items.map((item) => <div key={item.id}><span className="account-name-cell"><i className="account-avatar"><AvatarContent user={item} /></i><strong>{item.name}</strong><small>{item.email}{item.email_verified_at ? '' : ' · Email not verified'}</small></span><span>{formatDate(item.created_at)}</span><span>{agriculturist ? 'Qualified agriculturist' : item.diagnoses_count ?? 0}</span><span>{formatDate(item.last_activity_at, true)}</span><span><button onClick={() => edit(item)}>Edit</button><button className="danger-link" onClick={() => setDeleteTarget(item)}>Delete</button></span></div>)}{!items.length && <Empty icon={agriculturist ? ShieldCheck : Users} title={`No ${agriculturist ? 'agriculturists' : 'farmers'} found.`} text={search ? 'Try a different search.' : agriculturist ? 'Create an account only after confirming the agriculturist’s qualifications.' : 'Farmers who sign up will appear here.'} />}</section>
    <ModalShell open={modalOpen} title={editing ? `Edit ${singular}` : `Add ${singular}`} description={agriculturist ? 'Agriculturist access should be limited to qualified plant-health personnel.' : 'Use this only for assisted onboarding; farmers can also register themselves.'} onClose={() => { if (!busy) setModalOpen(false); }}>
      <form className="admin-editor modal-form" onSubmit={submit}><div><label>Name<input autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label><label>Email<input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label><label>Password<input type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required={!editing} placeholder={editing ? 'Leave blank to keep current password' : ''} /></label><label>Confirm password<input type="password" autoComplete="new-password" value={form.password_confirmation} onChange={(event) => setForm({ ...form, password_confirmation: event.target.value })} required={!editing} /></label></div>{error && <div className="form-error">{error}</div>}<footer><button type="button" className="secondary-button" disabled={busy} onClick={() => setModalOpen(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save Changes' : `Add ${singular}`}</button></footer></form>
    </ModalShell>
    <ConfirmDialog open={Boolean(deleteTarget)} title={`Delete ${singular}?`} text={agriculturist ? `Completed reviews by ${deleteTarget?.name || 'this agriculturist'} will remain as audit records without an assigned account.` : `Deleting ${deleteTarget?.name || 'this farmer'} also deletes their diagnosis records.`} confirmLabel={`Delete ${singular}`} danger busy={busy} onCancel={() => setDeleteTarget(null)} onConfirm={remove} />
  </div>;
}

function ReviewRevisions({ revisions }) {
  if (!revisions?.length) return null;
  return <details><summary>Earlier assessments ({revisions.length})</summary>{revisions.map((revision, index) => <p key={index} className="review-meta">{titleCase(revision.review_status.replaceAll('_', '-'))}{revision.verified_label ? ` · ${titleCase(revision.verified_label)}` : ''} — {revision.reviewer?.name || 'Former agriculturist'}, {formatDate(revision.reviewed_at, true)}</p>)}</details>;
}

function DiagnosesAdmin() {
  const emptyFilters = { class: '', source: '', date_from: '', date_to: '', confidence_min: '', confidence_max: '' };
  const [items, setItems] = useState([]); const [filters, setFilters] = useState(emptyFilters); const [appliedFilters, setAppliedFilters] = useState(emptyFilters); const [selected, setSelected] = useState(null); const [deleteTarget, setDeleteTarget] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const load = useCallback(() => { const query = new URLSearchParams(Object.entries(appliedFilters).filter(([, value]) => value)); query.set('per_page', '50'); api(`/admin/diagnoses?${query}`).then((payload) => { setItems(payload.data.items); setError(''); }).catch((exception) => setError(exception.message)); }, [appliedFilters]);
  useEffect(() => {
    load();
    const refresh = () => { if (document.visibilityState === 'visible') load(); };
    const timer = setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [load]);
  useEffect(() => {
    if (!selected?.id) return undefined;
    const id = selected.id;
    const refresh = () => { if (document.visibilityState === 'visible') api(`/admin/diagnoses/${id}`).then((payload) => setSelected((current) => current?.id === id ? payload.data : current)).catch(() => undefined); };
    const timer = setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [selected?.id]);
  const inspect = async (item) => { setBusy(true); try { const payload = await api(`/admin/diagnoses/${item.id}`); setSelected(payload.data); setError(''); } catch (exception) { setError(exception.message); } finally { setBusy(false); } };
  const remove = async () => { if (!deleteTarget) return; setBusy(true); try { await api(`/admin/diagnoses/${deleteTarget.id}`, { method: 'DELETE' }); setDeleteTarget(null); setSelected(null); setMessage('Diagnosis record deleted.'); setError(''); load(); } catch (exception) { setError(exception.message); setDeleteTarget(null); } finally { setBusy(false); } };
  return <div className="role-stack"><Heading title="Diagnoses" text="Audit original model outputs. Administrators cannot create or silently edit diagnosis records." /><form className="panel diagnosis-filters" onSubmit={(event) => { event.preventDefault(); setAppliedFilters({ ...filters }); }}><label>Class<input placeholder="Class slug" value={filters.class} onChange={(event) => setFilters({ ...filters, class: event.target.value })} /></label><label>Source<select value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })}><option value="">All</option><option value="mobile">Mobile</option><option value="web">Web</option></select></label><label>From<input type="date" value={filters.date_from} onChange={(event) => setFilters({ ...filters, date_from: event.target.value })} /></label><label>To<input type="date" value={filters.date_to} onChange={(event) => setFilters({ ...filters, date_to: event.target.value })} /></label><label>Minimum confidence<input type="number" min="0" max="100" value={filters.confidence_min} onChange={(event) => setFilters({ ...filters, confidence_min: event.target.value })} /></label><label>Maximum confidence<input type="number" min="0" max="100" value={filters.confidence_max} onChange={(event) => setFilters({ ...filters, confidence_max: event.target.value })} /></label><div className="filter-actions"><button type="button" className="secondary-button" onClick={() => { setFilters(emptyFilters); setAppliedFilters(emptyFilters); }}>Clear</button><button className="primary-button">Apply Filters</button></div></form>{message && <div className="success-message">{message}</div>}{error && <div className="form-error">{error}</div>}<section className="panel admin-table-role diagnoses"><header><span>Image / Result</span><span>Farmer</span><span>AI confidence</span><span>Source / Sync</span><span>Date</span><span>Actions</span></header>{items.map((item) => <div key={item.id}><span className="diagnosis-admin-name">{item.image_url ? <img src={item.image_url} alt="" /> : <i><Leaf size={18} /></i>}<span className="diagnosis-admin-copy"><strong>{item.review && item.review.review_status !== 'pending' ? agriculturistVerdict(item.review, item.predicted_class) : item.disease?.name || titleCase(item.predicted_class)}</strong><small>{item.review ? item.review.review_status === 'pending' ? 'Waiting for agriculturist' : 'Agriculturist verdict' : 'Not reviewed'}</small><small>AI: {item.disease?.name || titleCase(item.predicted_class)}</small></span></span><span>{item.user?.name || 'Unknown farmer'}</span><span>{item.confidence}%</span><span>{titleCase(item.source)} · {item.sync_status || (item.source === 'web' ? 'saved' : 'unknown')}</span><span>{formatDate(item.diagnosed_at, true)}</span><span><button onClick={() => inspect(item)} disabled={busy}>View</button><button className="danger-link" onClick={() => setDeleteTarget(item)}>Delete</button></span></div>)}{!items.length && <Empty icon={ScanLine} title="No diagnosis records match these filters." text="Change the filters or wait for new scans." />}</section>
    <ModalShell open={Boolean(selected)} title="Diagnosis Details" description="Agriculturist verdict and original AI result." onClose={() => setSelected(null)} variant="drawer" size="large">{selected && <div className="record-detail">{selected.image_url ? <img className="record-detail-image" src={selected.image_url} alt="Submitted banana leaf" /> : <div className="record-detail-placeholder"><Leaf size={44} /></div>}{selected.review && <section className="review-result"><h3>Agriculturist verdict</h3><strong className="admin-verdict">{agriculturistVerdict(selected.review, selected.predicted_class)}</strong>{selected.review.review_status !== 'pending' && <><p>{selected.review.reviewer?.name ? 'Reviewed by ' + selected.review.reviewer.name + ' · ' : ''}{formatDate(selected.review.reviewed_at, true)}</p>{selected.review.farmer_message && <p><strong>Message to farmer:</strong> {selected.review.farmer_message}</p>}{selected.review.next_steps?.length > 0 && <p><strong>Next steps:</strong> {selected.review.next_steps.map((step) => FARMER_STEP_TEXT[step] || titleCase(step)).join(' · ')}</p>}</>}<ReviewRevisions revisions={selected.review.revisions} /></section>}<dl><div><dt>Original AI prediction</dt><dd>{selected.disease?.name || titleCase(selected.predicted_class)}</dd></div><div><dt>AI confidence</dt><dd>{percent(Number(selected.confidence), 1)}</dd></div><div><dt>Farmer</dt><dd>{selected.user?.name || 'Unknown farmer'}</dd></div>{selected.location && <div><dt>Scanned near</dt><dd><a href={`https://www.openstreetmap.org/?mlat=${selected.location.latitude}&mlon=${selected.location.longitude}#map=14/${selected.location.latitude}/${selected.location.longitude}`} target="_blank" rel="noreferrer">{selected.location.latitude.toFixed(3)}, {selected.location.longitude.toFixed(3)} (map)</a></dd></div>}<div><dt>AI provenance</dt><dd>{selected.prediction_verified ? "Server verified" : "Client reported"}</dd></div><div><dt>Source / sync</dt><dd>{titleCase(selected.source)} · {selected.sync_status || (selected.source === 'web' ? 'saved' : 'unknown')}</dd></div><div><dt>Model</dt><dd>{selected.model_version || 'Not specified'}</dd></div><div><dt>Inference time</dt><dd>{selected.inference_time_ms ? `${selected.inference_time_ms} ms` : 'Not recorded'}</dd></div><div><dt>Date</dt><dd>{formatDate(selected.diagnosed_at, true)}</dd></div><div><dt>Research consent</dt><dd>{selected.research_consent ? 'Active' : 'Not active'}</dd></div></dl>{selected.farmer_notes && <section className="detail-note"><h3>Farmer notes</h3><p>{selected.farmer_notes}</p></section>}<button className="danger-button full" onClick={() => setDeleteTarget(selected)}><Trash2 size={17} />Delete Diagnosis</button></div>}</ModalShell>
    <ConfirmDialog open={Boolean(deleteTarget)} title="Delete diagnosis record?" text="This permanently removes the saved scan and its associated review data. The action cannot be undone." confirmLabel="Delete Diagnosis" danger busy={busy} onCancel={() => setDeleteTarget(null)} onConfirm={remove} />
  </div>;
}

function DiseasesAdmin() {
  const empty = { slug: '', model_class_key: '', name: '', alternative_names: [], scientific_name: '', causal_agent: '', pathogen_type: '', short_description: '', farmer_summary: '', curative_status: 'unclear_evidence', evidence_level: 'limited', image_only_limitations: '', professional_referral: '', prevention: '' };
  const [items, setItems] = useState([]); const [classes, setClasses] = useState([]); const [contentStatus, setContentStatus] = useState(''); const [form, setForm] = useState(empty); const [editing, setEditing] = useState(null); const [selected, setSelected] = useState(null); const [modalOpen, setModalOpen] = useState(false); const [archiveTarget, setArchiveTarget] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const load = useCallback(async () => { try { const [knowledge, system] = await Promise.all([api('/admin/diseases'), api('/admin/system')]); setItems(knowledge.data); setClasses(system.data.classes); setContentStatus(system.data.disease_content_status); } catch (exception) { setError(exception.message); } }, []); useEffect(() => { load(); }, [load]);
  const availableClasses = classes.filter((label) => !items.some((item) => item.model_class_key === label));
  const create = () => { const modelClass = availableClasses[0] || ''; setEditing(null); setForm({ ...empty, model_class_key: modelClass, slug: modelClass }); setError(''); setModalOpen(true); };
  const edit = (item) => { setEditing(item.id); setForm({ ...empty, ...item, alternative_names: item.alternative_names || [], farmer_summary: item.farmer_summary || item.description || '' }); setError(''); setModalOpen(true); };
  const submit = async (event) => { event.preventDefault(); setBusy(true); try { await api(`/admin/diseases${editing ? `/${editing}` : ''}`, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(form) }); setModalOpen(false); setForm(empty); setEditing(null); setMessage(editing ? 'Disease content updated and returned for review.' : 'Missing class record created as a draft.'); setError(''); load(); } catch (exception) { setError(exception.message); } finally { setBusy(false); } };
  const setStatus = async (item, status) => { try { await api(`/admin/diseases/${item.id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }); setMessage(status === 'researched' ? 'Disease content submitted for agricultural review.' : 'Disease status updated.'); setError(''); load(); } catch (exception) { setError(exception.message); } };
  const inspect = async (item) => { try { const payload = await api(`/admin/diseases/${item.id}`); setSelected(payload.data); } catch (exception) { setError(exception.message); } };
  const archive = async () => { if (!archiveTarget) return; setBusy(true); try { await api(`/admin/diseases/${archiveTarget.id}`, { method: 'DELETE' }); setArchiveTarget(null); setSelected(null); setMessage('Disease knowledge record archived.'); setError(''); load(); } catch (exception) { setError(exception.message); setArchiveTarget(null); } finally { setBusy(false); } };
  return <div className="role-stack"><Heading title="Disease Knowledge" text="Maintain one governed knowledge record for each validated model class, then submit researched content to an agriculturist." action={<button className="primary-button" disabled={!availableClasses.length} title={!availableClasses.length ? 'Every validated model class already has a knowledge record.' : undefined} onClick={create}><Plus size={17} />Add Missing Class Record</button>} /><div className={`development-note ${classes.length ? '' : 'warning'}`}><Info size={18} /><p>{contentStatus || 'Checking the final four-class label map...'}</p></div>{!availableClasses.length && classes.length > 0 && <div className="scope-note"><Check size={17} /><span>All {classes.length} validated model classes already have knowledge records. Edit an existing record instead of adding an unsupported disease.</span></div>}{message && <div className="success-message">{message}</div>}{error && <div className="form-error">{error}</div>}<section className="panel admin-table-role knowledge-table"><header><span>Disease</span><span>Pathogen</span><span>Status</span><span>Evidence</span><span>Sources</span><span>Last reviewed</span><span>Actions</span></header>{items.map((item) => <div key={item.id}><span><strong>{item.name}</strong><small>{item.model_class_key}</small></span><span>{item.causal_agent || 'Pending'}</span><span><b className={`status-pill ${item.verification_status}`}>{item.verification_status}</b></span><span>{item.evidence_level}</span><span>{item.sources_count ?? 0}</span><span>{formatDate(item.last_reviewed_at)}</span><span><button onClick={() => inspect(item)}>View</button><button onClick={() => edit(item)}>Edit</button>{item.verification_status === 'draft' && <button onClick={() => setStatus(item, 'researched')}>Submit for Review</button>}<button className="danger-link" onClick={() => setArchiveTarget(item)}>Archive</button></span></div>)}{!items.length && <Empty icon={BookOpen} title="Disease content pending" text={classes.length ? 'Create only the missing records from the validated model classes.' : 'The validated label map is not available, so disease records cannot be created safely.'} action={availableClasses.length ? create : undefined} actionLabel="Add Missing Class Record" />}</section>
    <ModalShell open={modalOpen} title={editing ? 'Edit Disease Content' : 'Add Missing Class Record'} description={editing ? 'Saving changes returns verified content for agricultural re-review.' : 'Only validated model classes without an existing record are available.'} onClose={() => { if (!busy) setModalOpen(false); }} size="large">
      <form className="admin-editor disease-editor modal-form" onSubmit={submit}><div><label>Model class key<select value={form.model_class_key} disabled={Boolean(editing)} onChange={(event) => setForm({ ...form, model_class_key: event.target.value, slug: event.target.value })} required><option value="">Select validated class</option>{(editing ? classes : availableClasses).map((label) => <option key={label}>{label}</option>)}</select></label><label>Accepted disease name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label><label>Scientific name<input value={form.scientific_name || ''} onChange={(event) => setForm({ ...form, scientific_name: event.target.value })} /></label><label>Causal agent<input value={form.causal_agent || ''} onChange={(event) => setForm({ ...form, causal_agent: event.target.value })} /></label><label>Pathogen type<select value={form.pathogen_type || ''} onChange={(event) => setForm({ ...form, pathogen_type: event.target.value })}><option value="">Not established</option>{['fungus', 'bacterium', 'virus', 'other'].map((value) => <option key={value}>{value}</option>)}</select></label><label>Curative status<select value={form.curative_status} onChange={(event) => setForm({ ...form, curative_status: event.target.value })}>{['unclear_evidence', 'manageable_not_curable', 'no_known_cure', 'curative_treatment_available'].map((value) => <option key={value}>{titleCase(value.replaceAll('_', '-'))}</option>)}</select></label><label>Evidence level<select value={form.evidence_level} onChange={(event) => setForm({ ...form, evidence_level: event.target.value })}>{['limited', 'moderate', 'high'].map((value) => <option key={value}>{titleCase(value)}</option>)}</select></label>{[['short_description','Short description'],['farmer_summary','Farmer summary'],['prevention','How to help prevent spread'],['professional_referral','When to seek expert help'],['image_only_limitations','Image-only limitations']].map(([field,label]) => <label key={field}>{label}<textarea value={form[field] || ''} onChange={(event) => setForm({ ...form, [field]: event.target.value })} /></label>)}</div>{error && <div className="form-error">{error}</div>}<footer><button type="button" className="secondary-button" disabled={busy} onClick={() => setModalOpen(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save and Return for Review' : 'Create Draft'}</button></footer></form>
    </ModalShell>
    <ModalShell open={Boolean(selected)} title={selected?.disease?.name || 'Disease Details'} description="Research and farmer-facing content for this validated model class." onClose={() => setSelected(null)} variant="drawer" size="large">{selected && <div className="disease-detail"><section><h3>Farmer guidance</h3><p>{selected.disease.description || 'Insufficient verified evidence available.'}</p><h3>Management and prevention</h3><p>{selected.disease.management || 'Insufficient verified evidence available.'}</p><h3>Image-only limitations</h3><p>{selected.disease.image_only_limitations || 'Not yet documented.'}</p></section><section><h3>Research record</h3><dl><div><dt>Model class</dt><dd>{selected.disease.model_class_key}</dd></div><div><dt>Scientific name</dt><dd>{selected.disease.scientific_name || 'Pending'}</dd></div><div><dt>Causal agent</dt><dd>{selected.disease.causal_agent || 'Pending'}</dd></div><div><dt>Evidence level</dt><dd>{titleCase(selected.disease.evidence_level)}</dd></div><div><dt>Sources</dt><dd>{selected.disease.sources_count ?? 0}</dd></div></dl>{selected.regulatory_recheck_required && <div className="form-error">Regulatory re-check required.</div>}</section>{selected.evidence?.length > 0 && <section><h3>Mapped claims</h3><div className="claim-list">{selected.evidence.map((claim) => <article key={claim.id}><strong>{titleCase(claim.claim_type.replaceAll('_', '-'))}</strong><p>{claim.claim_text}</p></article>)}</div></section>}<div className="drawer-actions"><button className="secondary-button" onClick={() => { const item = selected.disease; setSelected(null); edit(item); }}>Edit Content</button><button className="danger-button" onClick={() => setArchiveTarget(selected.disease)}>Archive Record</button></div></div>}</ModalShell>
    <ConfirmDialog open={Boolean(archiveTarget)} title="Archive disease record?" text={`Archive ${archiveTarget?.name || 'this record'} without deleting its historical evidence and review trail.`} confirmLabel="Archive Record" danger busy={busy} onCancel={() => setArchiveTarget(null)} onConfirm={archive} />
  </div>;
}

function ResearchSourcesAdmin() {
  const empty = { title: '', authors: '', year: '', journal_or_institution: '', source_type: 'peer_reviewed_article', doi: '', reference_url: '', country_or_region: '', peer_reviewed: true, philippines_specific: false, notes: '' };
  const emptyFilters = { search: '', peer_reviewed: false, philippines_specific: false, institution: '', disease_id: '' };
  const [items, setItems] = useState([]); const [form, setForm] = useState(empty); const [editing, setEditing] = useState(null); const [filters, setFilters] = useState(emptyFilters); const [appliedFilters, setAppliedFilters] = useState(emptyFilters); const [tab, setTab] = useState('sources'); const [modalOpen, setModalOpen] = useState(false); const [deleteTarget, setDeleteTarget] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const load = useCallback(() => { const query = new URLSearchParams(Object.entries(appliedFilters).filter(([, value]) => value)); api(`/admin/research-sources?${query}`).then((payload) => { setItems(payload.data); setError(''); }).catch((exception) => setError(exception.message)); }, [appliedFilters]); useEffect(() => { load(); }, [load]);
  const create = () => { setEditing(null); setForm(empty); setError(''); setModalOpen(true); };
  const submit = async (event) => { event.preventDefault(); setBusy(true); const body = { ...form, year: form.year ? Number(form.year) : null, doi: form.doi || null, reference_url: form.reference_url || null }; try { await api(`/admin/research-sources${editing ? `/${editing}` : ''}`, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(body) }); setModalOpen(false); setEditing(null); setForm(empty); setMessage(editing ? 'Source updated; affected verified content was returned for review.' : 'Research source added.'); setError(''); load(); } catch (exception) { setError(exception.message); } finally { setBusy(false); } };
  const edit = (item) => { setEditing(item.id); setForm({ ...empty, ...item, year: item.year || '' }); setError(''); setModalOpen(true); };
  const remove = async () => { if (!deleteTarget) return; setBusy(true); try { await api(`/admin/research-sources/${deleteTarget.id}`, { method: 'DELETE' }); setDeleteTarget(null); setMessage('Unused research source deleted.'); setError(''); load(); } catch (exception) { setError(exception.message); setDeleteTarget(null); } finally { setBusy(false); } };
  const claims = items.flatMap((source) => (source.evidence || []).map((evidence) => ({ ...evidence, source })));
  return <div className="role-stack"><Heading title="Research Sources" text="Maintain traceable evidence and inspect every disease claim that uses it." action={<button className="primary-button" onClick={create}><Plus size={17} />Add Source</button>} /><div className="admin-tabs" role="tablist" aria-label="Research source view"><button role="tab" aria-selected={tab === 'sources'} className={tab === 'sources' ? 'active' : ''} onClick={() => setTab('sources')}><Link2 size={17} />Sources</button><button role="tab" aria-selected={tab === 'claims'} className={tab === 'claims' ? 'active' : ''} onClick={() => setTab('claims')}><BookOpen size={17} />Claim Mappings <span>{claims.length}</span></button></div>
    <form className="panel diagnosis-filters" onSubmit={(event) => { event.preventDefault(); setAppliedFilters({ ...filters }); }}><label>Search<input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></label><label>Institution<input value={filters.institution} onChange={(event) => setFilters({ ...filters, institution: event.target.value })} /></label><label>Disease record ID<input type="number" min="1" value={filters.disease_id} onChange={(event) => setFilters({ ...filters, disease_id: event.target.value })} /></label><label className="check-filter"><input type="checkbox" checked={filters.peer_reviewed} onChange={(event) => setFilters({ ...filters, peer_reviewed: event.target.checked })} /> Peer reviewed</label><label className="check-filter"><input type="checkbox" checked={filters.philippines_specific} onChange={(event) => setFilters({ ...filters, philippines_specific: event.target.checked })} /> Philippines-specific</label><div className="filter-actions"><button type="button" className="secondary-button" onClick={() => { setFilters(emptyFilters); setAppliedFilters(emptyFilters); }}>Clear</button><button className="primary-button">Apply Filters</button></div></form>
    {message && <div className="success-message">{message}</div>}{error && <div className="form-error">{error}</div>}
    {tab === 'sources' ? <section className="panel admin-table-role source-table"><header><span>Reference</span><span>Year</span><span>Type</span><span>Quality</span><span>Claims</span><span>Actions</span></header>{items.map((item) => <div key={item.id}><span><strong>{item.authors} ({item.year || 'n.d.'}). {item.title}.</strong><small>{item.journal_or_institution}{item.doi ? ` · DOI: ${item.doi}` : ''}</small></span><span>{item.year || 'n.d.'}</span><span>{titleCase(item.source_type.replaceAll('_','-'))}</span><span>{item.peer_reviewed ? 'Peer reviewed' : 'Authoritative'}{item.philippines_specific ? ' · Philippines' : ''}</span><span>{item.evidence_count}</span><span><button onClick={() => edit(item)}>Edit</button>{item.reference_url && <a href={item.reference_url} target="_blank" rel="noreferrer">Open</a>}{item.evidence_count ? <span className="in-use-label" title="Remove or replace mapped claims before deleting this source.">In use</span> : <button className="danger-link" onClick={() => setDeleteTarget(item)}>Delete</button>}</span></div>)}{!items.length && <Empty icon={Link2} title="No research sources found." text={Object.values(appliedFilters).some(Boolean) ? 'Adjust the filters and try again.' : 'Add only sources checked against the original publication or authority.'} action={!Object.values(appliedFilters).some(Boolean) ? create : undefined} actionLabel="Add Source" />}</section> : <section className="panel evidence-audit"><h2>Claims using the filtered sources</h2>{claims.map((claim) => <article key={claim.id}><strong>{titleCase(claim.claim_type.replaceAll('_', '-'))} · {titleCase(claim.evidence_strength)}</strong><p>{claim.claim_text}</p><small>{claim.disease?.name || 'Disease record'} — {claim.source.authors} ({claim.source.year || 'n.d.'}). {claim.source.title}.{claim.source.doi ? ` DOI: ${claim.source.doi}` : ''}</small></article>)}{!claims.length && <Empty icon={BookOpen} title="No mapped claims found." text="Claims will appear after a source is mapped to disease knowledge." />}</section>}
    <ModalShell open={modalOpen} title={editing ? 'Edit Research Source' : 'Add Research Source'} description={editing ? 'Changing a source returns affected verified content for agricultural re-review.' : 'Record only sources checked against the original publication or issuing authority.'} onClose={() => { if (!busy) setModalOpen(false); }} size="large"><form className="admin-editor source-editor modal-form" onSubmit={submit}><div>{[['title','Title'],['authors','Authors'],['year','Publication year'],['journal_or_institution','Journal or institution'],['doi','DOI (leave blank if none)'],['reference_url','Reference URL'],['country_or_region','Country or region']].map(([field,label]) => <label key={field}>{label}<input type={field === 'year' ? 'number' : field === 'reference_url' ? 'url' : 'text'} value={form[field] || ''} onChange={(event) => setForm({ ...form, [field]: event.target.value })} required={['title','authors','journal_or_institution'].includes(field)} /></label>)}<label>Source type<select value={form.source_type} onChange={(event) => setForm({ ...form, source_type: event.target.value })}>{['peer_reviewed_article','systematic_review','review_article','government_guideline','FAO_guideline','university_extension','regulatory_document','academic_book_chapter','research_institute'].map((value) => <option key={value} value={value}>{titleCase(value.replaceAll('_','-'))}</option>)}</select></label><label>Notes<textarea value={form.notes || ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label><label className="check-filter"><input type="checkbox" checked={form.peer_reviewed} onChange={(event) => setForm({ ...form, peer_reviewed: event.target.checked })} /> Peer reviewed</label><label className="check-filter"><input type="checkbox" checked={form.philippines_specific} onChange={(event) => setForm({ ...form, philippines_specific: event.target.checked })} /> Philippines-specific</label></div>{error && <div className="form-error">{error}</div>}<footer><button type="button" className="secondary-button" disabled={busy} onClick={() => setModalOpen(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save and Trigger Re-review' : 'Add Source'}</button></footer></form></ModalShell>
    <ConfirmDialog open={Boolean(deleteTarget)} title="Delete unused source?" text={`Delete ${deleteTarget?.title || 'this source'}. Sources with mapped claims cannot be deleted.`} confirmLabel="Delete Source" danger busy={busy} onCancel={() => setDeleteTarget(null)} onConfirm={remove} />
  </div>;
}

const ARTICLE_TOPICS = [['field_care', 'Field care'], ['prevention', 'Prevention'], ['treatment', 'Treatment'], ['varieties', 'Varieties'], ['identification', 'Identifying'], ['safety', 'Safety'], ['research', 'Research']];
const ARTICLE_DISEASES = [['healthy', 'Healthy'], ['sigatoka', 'Sigatoka'], ['panama-disease', 'Panama disease'], ['cordana-leaf-spot', 'Cordana leaf spot']];
const LIBRARY_CACHE_KEY = 'dahonmd-library-v1';
const articleDiseaseLabel = (key) => tr(ARTICLE_DISEASES.find(([value]) => value === key)?.[1] || 'General');
const articleTopicLabel = (key) => tr(ARTICLE_TOPICS.find(([value]) => value === key)?.[1] || titleCase(key));
const normalizeSearch = (text = '') => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// Same rules as the phone app: every word must match; title matches come first.
function searchLibrary(articles, { query, disease, topic }) {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  const matches = articles.filter((article) => {
    if (disease === 'general' ? article.disease_key : disease !== 'all' && article.disease_key !== disease) return false;
    if (topic !== 'all' && article.topic !== topic) return false;
    const haystack = normalizeSearch([article.title, article.summary, article.body, article.authors, ...(article.images || []).map((photo) => photo.caption), ...(article.references || []).map((ref) => `${ref.title} ${ref.authors}`)].join(' '));
    return words.every((word) => haystack.includes(word));
  });
  const titleScore = (article) => words.filter((word) => normalizeSearch(article.title).includes(word)).length;
  return words.length ? [...matches].sort((a, b) => titleScore(b) - titleScore(a)) : matches;
}

const articleImageUrl = (photo) => apiFileUrl(`/article-images/${encodeURIComponent(photo.file)}`);

function ArticlePhoto({ photo }) {
  return <figure className="article-photo">
    <a href={articleImageUrl(photo)} target="_blank" rel="noreferrer"><img src={articleImageUrl(photo)} alt={photo.caption} loading="lazy" /></a>
    <figcaption>{photo.caption}<small>{tr('Photo: {credit} ({license})', { credit: photo.credit, license: photo.license })}{photo.source_url && <> · <a href={photo.source_url} target="_blank" rel="noreferrer">{tr('Source')}</a></>}</small></figcaption>
  </figure>;
}

/** One line of article text with its **bold** and *italic* parts styled. */
function InlineText({ text }) {
  return parseInline(text).map((span, index) => {
    if (!span.bold && !span.italic) return span.text;
    const content = span.italic ? <em>{span.text}</em> : span.text;
    return span.bold ? <strong key={index}>{content}</strong> : <em key={index}>{span.text}</em>;
  });
}

function ArticleBody({ body = '', images = [] }) {
  const lines = body.split('\n').map((line) => line.trim()).filter(Boolean);
  const blocks = [];
  const addListItem = (type, key, text) => { const last = blocks[blocks.length - 1]; if (last?.type === type) last.items.push(text); else blocks.push({ type, key, items: [text] }); };
  lines.forEach((line, index) => {
    const placed = ARTICLE_IMAGE_LINE.exec(line);
    const numbered = numberedLineText(line);
    if (placed) { const photo = images.find((item) => item.file === placed[1].trim()); if (photo) blocks.push({ type: 'photo', key: index, photo }); }
    else if (line.startsWith('- ')) addListItem('list', index, line.slice(2));
    else if (numbered !== null) addListItem('numbered', index, numbered);
    else if (line.startsWith('## ')) blocks.push({ type: 'heading', key: index, text: line.slice(3) });
    else blocks.push({ type: 'paragraph', key: index, text: line });
  });
  return <div className="article-body">{blocks.map((block) => {
    if (block.type === 'photo') return <ArticlePhoto key={block.key} photo={block.photo} />;
    if (block.type === 'heading') return <h3 key={block.key}><InlineText text={block.text} /></h3>;
    if (block.type === 'list') return <ul key={block.key}>{block.items.map((item, i) => <li key={i}><InlineText text={item} /></li>)}</ul>;
    if (block.type === 'numbered') return <ol key={block.key}>{block.items.map((item, i) => <li key={i}><InlineText text={item} /></li>)}</ol>;
    return <p key={block.key}><InlineText text={block.text} /></p>;
  })}</div>;
}

function GuideTabs({ active, navigate, onOpenLibrary }) {
  return <div className="admin-tabs guide-tabs" role="tablist" aria-label={tr('Guide sections')}><button role="tab" aria-selected={active === 'conditions'} className={active === 'conditions' ? 'active' : ''} onClick={() => navigate('/farmer/diseases')}><Leaf size={17} />{tr('Leaf conditions')}</button><button role="tab" aria-selected={active === 'library'} className={active === 'library' ? 'active' : ''} onClick={() => (onOpenLibrary ? onOpenLibrary(null) : navigate('/farmer/library'))}><Library size={17} />{tr('Library')}</button></div>;
}

function ArticleLibrary({ navigate, onOpenLibrary, initialDisease = 'all', showGuideTabs = true }) {
  const readCache = () => { try { return JSON.parse(window.localStorage.getItem(LIBRARY_CACHE_KEY) || 'null'); } catch { return null; } };
  const [library, setLibrary] = useState(readCache);
  const [loading, setLoading] = useState(!library);
  const [offline, setOffline] = useState(false);
  const [query, setQuery] = useState('');
  const [disease, setDisease] = useState(initialDisease);
  const [topic, setTopic] = useState('all');
  const [openSlug, setOpenSlug] = useState(null);
  useEffect(() => {
    api('/articles').then((payload) => {
      const next = { articles: payload.data, updatedAt: new Date().toISOString() };
      setLibrary(next); setOffline(false);
      // Saved in this browser so the library still opens without a connection.
      try { window.localStorage.setItem(LIBRARY_CACHE_KEY, JSON.stringify(next)); } catch { /* storage full or blocked */ }
    }).catch(() => setOffline(true)).finally(() => setLoading(false));
  }, []);
  const articles = library?.articles || [];
  const results = searchLibrary(articles, { query, disease, topic });
  const open = articles.find((article) => article.slug === openSlug);
  const show = (slug) => { setOpenSlug(slug); window.scrollTo({ top: 0 }); };
  const filtered = query.trim() || disease !== 'all' || topic !== 'all';
  const heading = <Heading title={tr('Article library')} text={tr('Practical articles on what farmers and researchers do against each disease. Saved in this browser, so you can read them offline.')} />;

  if (open) return <div className="role-stack">{heading}<article className="panel article-reader">
    <button className="text-button" onClick={() => show(null)}><ArrowLeft size={17} />{tr('Back to library')}</button>
    <div className="article-tags"><span>{articleDiseaseLabel(open.disease_key)}</span><span className="muted">{articleTopicLabel(open.topic)}</span></div>
    <h2>{open.title}</h2>
    <p className="article-meta">{tr('By {authors}', { authors: open.authors })} · {tr('{count} min read', { count: open.reading_minutes })}{open.published_at ? ` · ${formatDate(open.published_at)}` : ''}</p>
    {getLanguage() === 'fil' && <p className="article-note">{tr('Articles are in English for now.')}</p>}
    <p className="article-lead">{open.summary}</p>
    <ArticleBody body={open.body} images={open.images || []} />
    <section className="article-references"><h3>{tr('References')}</h3><ol>{(open.references || []).map((ref) => <li key={ref.id || ref.title}><span>{ref.authors}{ref.year ? ` (${ref.year})` : ''}. {ref.title}.{ref.journal_or_institution ? ` ${ref.journal_or_institution}.` : ''}{ref.doi ? ` doi:${ref.doi}` : ''}</span><span className="article-tags">{ref.peer_reviewed && <span className="muted">{tr('Peer-reviewed')}</span>}{ref.philippines_specific && <span className="muted">{tr('Philippines')}</span>}{ref.reference_url && <a href={ref.reference_url} target="_blank" rel="noreferrer">{tr('Open source')}</a>}</span></li>)}</ol><p className="article-note">{tr('Articles summarise the listed references. Ask your agriculturist before acting on them.')}</p></section>
  </article></div>;

  return <div className="role-stack">
    {heading}
    {showGuideTabs && <GuideTabs active="library" navigate={navigate} onOpenLibrary={onOpenLibrary} />}
    <section className="panel library-filters">
      <label className="library-search"><Search size={18} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr('Search articles')} aria-label={tr('Search articles')} /></label>
      <div className="library-chips" role="group" aria-label={tr('Leaf condition')}>{[['all', 'All'], ...ARTICLE_DISEASES, ['general', 'General']].map(([value, label]) => <button key={value} className={disease === value ? 'active' : ''} aria-pressed={disease === value} onClick={() => setDisease(value)}>{tr(label)}</button>)}</div>
      <div className="library-chips small" role="group" aria-label={tr('Topic')}>{[['all', 'All topics'], ...ARTICLE_TOPICS].map(([value, label]) => <button key={value} className={topic === value ? 'active' : ''} aria-pressed={topic === value} onClick={() => setTopic(value)}>{tr(label)}</button>)}</div>
      <p className="library-status"><span>{tr('{count} article(s)', { count: results.length })}</span>{offline && library ? <span className="offline"><CloudOff size={14} />{tr('Offline: showing the saved library')}</span> : library ? <span className="saved"><Cloud size={14} />{tr('Saved for offline reading')}</span> : null}</p>
    </section>
    {loading ? <Loading text={tr('Loading articles...')} /> : !library ? <Empty icon={CloudOff} title={tr('Library not saved yet')} text={tr('Connect to the internet once to save the article library in this browser.')} /> : !results.length ? <Empty icon={Search} title={tr('No articles match your search.')} text="" action={filtered ? () => { setQuery(''); setDisease('all'); setTopic('all'); } : undefined} actionLabel={tr('Clear search and filters')} /> : <section className="library-grid">{results.map((article) => <button key={article.slug} className="panel library-card" onClick={() => show(article.slug)}>
      {article.images?.[0] && <img className="library-card-cover" src={articleImageUrl(article.images[0])} alt="" loading="lazy" />}
      <span className="article-tags"><span>{articleDiseaseLabel(article.disease_key)}</span><span className="muted">{articleTopicLabel(article.topic)}</span></span>
      <strong>{article.title}</strong><p>{article.summary}</p>
      <small>{tr('{count} min read', { count: article.reading_minutes })} · {tr('References')}: {(article.references || []).length}</small>
    </button>)}</section>}
  </div>;
}

function ArticlesAdmin() {
  const empty = { title: '', disease_key: '', topic: 'field_care', language: 'en', summary: '', body: '', authors: '', status: 'draft', source_ids: [], images: [] };
  const [uploading, setUploading] = useState(false);
  const [items, setItems] = useState([]); const [sources, setSources] = useState([]); const [form, setForm] = useState(empty); const [editing, setEditing] = useState(null); const [modalOpen, setModalOpen] = useState(false); const [deleteTarget, setDeleteTarget] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [preview, setPreview] = useState(false);
  const [filters, setFilters] = useState({ search: '', disease: 'all', status: 'all' }); const [sourceSearch, setSourceSearch] = useState('');
  const editor = useRef(null); const setBody = useCallback((body) => setForm((current) => ({ ...current, body })), []);
  const load = useCallback(() => { api('/admin/articles').then((payload) => { setItems(payload.data); setError(''); }).catch((exception) => setError(exception.message)); }, []);
  useEffect(() => { load(); api('/admin/research-sources').then((payload) => setSources(payload.data)).catch(() => setSources([])); }, [load]);
  const create = () => { setEditing(null); setForm(empty); setPreview(false); setError(''); setModalOpen(true); };
  const edit = (item) => { setEditing(item.id); setForm({ ...empty, ...item, disease_key: item.disease_key || '', source_ids: (item.references || []).map((ref) => ref.id), images: (item.images || []).map(({ url, ...photo }) => ({ ...photo, license_url: photo.license_url || '', source_url: photo.source_url || '' })) }); setPreview(false); setError(''); setModalOpen(true); };
  const submit = async (event) => { event.preventDefault(); if (!form.body.trim()) { setError('Write the article text before saving.'); return; } setBusy(true); try { await api(`/admin/articles${editing ? `/${editing}` : ''}`, { method: editing ? 'PUT' : 'POST', body: JSON.stringify({ ...form, disease_key: form.disease_key || null, images: form.images.map((photo) => ({ ...photo, license_url: photo.license_url || null, source_url: photo.source_url || null })) }) }); setModalOpen(false); setMessage(editing ? 'Article updated. Phones download the change on their next connection.' : 'Article added.'); setError(''); load(); } catch (exception) { setError(exception.message); } finally { setBusy(false); } };
  const remove = async () => { if (!deleteTarget) return; setBusy(true); try { await api(`/admin/articles/${deleteTarget.id}`, { method: 'DELETE' }); setDeleteTarget(null); setMessage('Article deleted.'); load(); } catch (exception) { setError(exception.message); setDeleteTarget(null); } finally { setBusy(false); } };
  // Photos are re-encoded as WebP by the server; each needs a caption, credit and license before saving.
  const uploadPhoto = async (file) => {
    if (!file) return; setUploading(true); setError('');
    try {
      const body = new FormData(); body.append('image', file);
      const payload = await api('/admin/article-images', { method: 'POST', body });
      const photo = { file: payload.data.file, caption: '', credit: '', license: '', license_url: '', source_url: '' };
      setForm((current) => ({ ...current, images: [...current.images, photo] }));
      editor.current?.insertPhoto(photo);
    } catch (exception) { setError(exception.message); } finally { setUploading(false); }
  };
  const updatePhoto = (file, field, value) => setForm((current) => ({ ...current, images: current.images.map((photo) => photo.file === file ? { ...photo, [field]: value } : photo) }));
  const removePhoto = (file) => setForm((current) => ({ ...current, images: current.images.filter((photo) => photo.file !== file), body: current.body.split('\n').filter((line) => line.trim() !== `[[image:${file}]]`).join('\n') }));
  const toggleSource = (id) => setForm((current) => ({ ...current, source_ids: current.source_ids.includes(id) ? current.source_ids.filter((value) => value !== id) : [...current.source_ids, id] }));
  const visible = items.filter((item) => (filters.status === 'all' || item.status === filters.status) && (filters.disease === 'all' || (filters.disease === 'general' ? !item.disease_key : item.disease_key === filters.disease)) && normalizeSearch(`${item.title} ${item.authors} ${item.summary}`).includes(normalizeSearch(filters.search.trim())));
  const sourceMatches = sources.filter((source) => form.source_ids.includes(source.id) || normalizeSearch(`${source.title} ${source.authors} ${source.year || ''}`).includes(normalizeSearch(sourceSearch.trim())));
  return <div className="role-stack"><Heading title="Article Library" text="Write and publish farmer articles. Every published article must cite research sources; phones keep the published library for offline reading." action={<button className="primary-button" onClick={create}><Plus size={17} />Add Article</button>} />
    <section className="panel diagnosis-filters"><label>Search<input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Title, author or summary" /></label><label>Leaf condition<select value={filters.disease} onChange={(event) => setFilters({ ...filters, disease: event.target.value })}><option value="all">All</option>{ARTICLE_DISEASES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="general">General</option></select></label><label>Status<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="all">All</option><option value="published">Published</option><option value="draft">Draft</option></select></label></section>
    {message && <div className="success-message">{message}</div>}{error && !modalOpen && <div className="form-error">{error}</div>}
    <section className="panel admin-table-role article-table"><header><span>Article</span><span>Condition</span><span>Topic</span><span>Status</span><span>References</span><span>Actions</span></header>{visible.map((item) => <div key={item.id}><span><strong>{item.title}</strong><small>{item.authors} · {item.reading_minutes} min · updated {formatDate(item.updated_at)}</small></span><span>{ARTICLE_DISEASES.find(([value]) => value === item.disease_key)?.[1] || 'General'}</span><span>{ARTICLE_TOPICS.find(([value]) => value === item.topic)?.[1] || item.topic}</span><span><b className={`status-pill ${item.status === 'published' ? 'ok' : 'muted'}`}>{titleCase(item.status)}</b></span><span>{(item.references || []).length}</span><span><button onClick={() => edit(item)}>Edit</button><button className="danger-link" onClick={() => setDeleteTarget(item)}>Delete</button></span></div>)}{!visible.length && <Empty icon={Library} title="No articles found." text={items.length ? 'Adjust the filters and try again.' : 'Add an article and cite the research sources it summarises.'} action={items.length ? undefined : create} actionLabel="Add Article" />}</section>
    <ModalShell open={modalOpen} title={editing ? 'Edit Article' : 'Add Article'} description="Write in plain language for farmers. Format the text with the toolbar, as in a word processor, or paste from Word or Google Docs." onClose={() => { if (!busy) setModalOpen(false); }} size="large"><form className="admin-editor article-editor modal-form" onSubmit={submit}>
      {error && <div className="form-error">{error}</div>}
      <label>Title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required maxLength={255} /></label>
      <div className="article-editor-row"><label>Leaf condition<select value={form.disease_key} onChange={(event) => setForm({ ...form, disease_key: event.target.value })}><option value="">General (all conditions)</option>{ARTICLE_DISEASES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Topic<select value={form.topic} onChange={(event) => setForm({ ...form, topic: event.target.value })}>{ARTICLE_TOPICS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Language<select value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })}><option value="en">English</option><option value="fil">Filipino</option></select></label><label>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="draft">Draft (hidden)</option><option value="published">Published</option></select></label></div>
      <label>Authors<input value={form.authors} onChange={(event) => setForm({ ...form, authors: event.target.value })} required maxLength={500} placeholder="Who wrote or compiled this article" /></label>
      <label>Summary<textarea rows={3} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} required maxLength={1000} /></label>
      <div className="article-body-field"><div className="article-body-heading"><span>Article text</span><div className="admin-tabs article-mode-tabs" role="tablist" aria-label="Article view"><button type="button" role="tab" aria-selected={!preview} className={!preview ? 'active' : ''} onClick={() => setPreview(false)}>Write</button><button type="button" role="tab" aria-selected={preview} className={preview ? 'active' : ''} onClick={() => setPreview(true)}><Eye size={16} />Preview on phone</button></div></div>
        <div hidden={preview}><ArticleEditor value={form.body} images={form.images} imageUrl={articleImageUrl} onChange={setBody} onAddPhoto={uploadPhoto} uploading={uploading} controller={editor} placeholder="Start writing. Use the toolbar for headings, bold, lists and photos, or paste from Word." /></div>
        {preview && <div className="article-preview phone"><ArticleBody body={form.body} images={form.images} />{!form.body.trim() && <p className="field-hint">Nothing to preview yet.</p>}</div>}
        <small className="field-hint">{form.body.length.toLocaleString()} / 30,000 characters</small></div>
      <fieldset className="article-photos"><legend>Photos ({form.images.length})</legend>
        <p className="field-hint">Use the Photo button in the toolbar to place a photo where the cursor is. Uploads are saved as WebP. Use only photos you may reuse, and credit them below. To move a photo, delete it from the text and use "Place in article".</p>
        {form.images.map((photo) => <div key={photo.file} className="article-photo-row">
          <img src={articleImageUrl(photo)} alt="" />
          <div>
            <label>Caption<input value={photo.caption} onChange={(event) => updatePhoto(photo.file, 'caption', event.target.value)} required maxLength={300} placeholder="What the farmer should notice in this photo" /></label>
            <div className="article-editor-row"><label>Credit<input value={photo.credit} onChange={(event) => updatePhoto(photo.file, 'credit', event.target.value)} required maxLength={300} placeholder="Photographer or source" /></label><label>License<input value={photo.license} onChange={(event) => updatePhoto(photo.file, 'license', event.target.value)} required maxLength={100} placeholder="CC0 1.0, CC BY 4.0, own photo" /></label></div>
            <div className="article-editor-row"><label>License link<input type="url" value={photo.license_url} onChange={(event) => updatePhoto(photo.file, 'license_url', event.target.value)} /></label><label>Source page<input type="url" value={photo.source_url} onChange={(event) => updatePhoto(photo.file, 'source_url', event.target.value)} /></label></div>
            {form.body.includes(`[[image:${photo.file}]]`) ? <small>In the article text.</small> : <small className="article-photo-unplaced">Not in the article text. <button type="button" className="text-button" onClick={() => { setPreview(false); editor.current?.insertPhoto(photo); }}>Place in article</button></small>}
          </div>
          <button type="button" className="danger-link" onClick={() => removePhoto(photo.file)}>Remove</button>
        </div>)}
      </fieldset>
      <fieldset className="article-sources"><legend>References ({form.source_ids.length} selected){form.status === 'published' && !form.source_ids.length ? ' — required to publish' : ''}</legend><input value={sourceSearch} onChange={(event) => setSourceSearch(event.target.value)} placeholder="Search research sources" aria-label="Search research sources" /><div className="article-source-list">{sourceMatches.map((source) => <label key={source.id} className="check-filter"><input type="checkbox" checked={form.source_ids.includes(source.id)} onChange={() => toggleSource(source.id)} /><span>{form.source_ids.includes(source.id) && <b>{form.source_ids.indexOf(source.id) + 1}. </b>}{source.authors} ({source.year || 'n.d.'}). {source.title}</span></label>)}{!sources.length && <small>Add sources under Research Sources first.</small>}</div></fieldset>
      <footer><button type="button" className="secondary-button" onClick={() => setModalOpen(false)} disabled={busy}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving...' : editing ? 'Save Article' : 'Add Article'}</button></footer>
    </form></ModalShell>
    <ConfirmDialog open={Boolean(deleteTarget)} title="Delete article?" text={`Delete "${deleteTarget?.title || 'this article'}". Phones remove it on their next connection.`} confirmLabel="Delete Article" danger busy={busy} onCancel={() => setDeleteTarget(null)} onConfirm={remove} />
  </div>;
}

function ExpertDashboard({ user, navigate }) {
  const { data, error } = useAdmin('/expert/dashboard'); if (error) return <div className="form-error">{error}</div>; if (!data) return <Loading text="Loading review dashboard..." />;
  return <div className="role-stack"><Welcome user={user} text="Scans waiting for your review are below." /><section className="admin-stat-grid"><Stat label="Needs Review" value={data.needs_review} note="Open image cases" icon={ShieldCheck} /><Stat label="Uncertain AI Results" value={data.uncertain_results} note="Below confidence threshold" icon={AlertTriangle} /><Stat label="Farmer Review Requests" value={data.farmer_review_requests} note="Explicitly requested" icon={Users} /><Stat label="Content Awaiting Verification" value={data.disease_content_awaiting_verification} note="Researched records" icon={BookOpen} /></section><section className="panel expert-case-list"><div className="panel-heading"><div><h2>Newest open cases</h2></div><button className="text-button" onClick={() => navigate('/expert/cases')}>View all<ChevronRight size={17} /></button></div>{data.cases.map((item) => <button key={item.id} className="expert-case-row" onClick={() => navigate(`/expert/cases?case=${item.id}`)}>{item.image_url ? <img src={item.image_url} alt="Banana leaf submitted for review" /> : <span><Leaf size={23} /></span>}<div><strong>{item.disease?.name || titleCase(item.predicted_class)}</strong><small>Farmer: {item.user?.name || 'Unknown'} · {formatDate(item.diagnosed_at, true)}</small></div><b>{Number(item.confidence).toFixed(1)}%</b><em>{item.review_reasons?.join(' · ') || (item.review?.review_status === 'pending' ? 'Farmer requested review' : 'Low confidence')}</em><ChevronRight size={18} /></button>)}{!data.cases.length && <Empty icon={Check} title="No cases need review." text="New uncertain results and farmer requests will appear here." />}</section></div>;
}

const REVIEW_CLASS_CHOICES = [
  ['sigatoka', 'Black Sigatoka'],
  ['panama-disease', 'Panama disease'],
  ['cordana-leaf-spot', 'Cordana leaf spot'],
  ['healthy', 'No supported disease visible'],
];
const REVIEW_OTHER_CHOICES = [
  ['cannot_determine', 'Cannot determine from this photo'],
  ['field_or_laboratory_required', 'Field or laboratory check needed'],
  ['possible_outside_supported_classes', 'Looks like another condition'],
];
const REVIEW_CHOICES = [...REVIEW_CLASS_CHOICES, ...REVIEW_OTHER_CHOICES];
const EXPERT_MESSAGE_TEMPLATES = [
  { id: 'blurry', label: 'Photo is blurry', message: 'The photo is blurry. Please take a clearer photo in daylight with the affected leaf in focus.' },
  { id: 'poor_light', label: 'Photo is too dark', message: 'The photo is too dark to assess. Please take another photo in even daylight.' },
  { id: 'field', label: 'Ask for a field inspection', message: 'Please ask your local agriculture office to check the plant in person.' },
  { id: 'monitor', label: 'Monitor the plant', message: 'Please check the plant over the next few days and take a new photo if the symptoms spread.' },
  { id: 'healthy', label: 'No disease visible', message: 'I do not see a supported disease in this photo. Continue checking the plant for new symptoms.' },
  { id: 'missing', label: 'Photo did not arrive', message: 'The scan photo did not arrive. Please send a new clear photo so I can assess the leaf.' },
];
const expertMessageOptions = (choice, photoAvailable) => !photoAvailable
  ? EXPERT_MESSAGE_TEMPLATES.filter(({ id }) => id === 'missing' || id === 'field')
  : choice === 'cannot_determine'
    ? EXPERT_MESSAGE_TEMPLATES.filter(({ id }) => ['blurry', 'poor_light', 'field'].includes(id))
    : choice === 'field_or_laboratory_required'
      ? EXPERT_MESSAGE_TEMPLATES.filter(({ id }) => ['field', 'blurry', 'poor_light'].includes(id))
    : choice === 'healthy'
      ? EXPERT_MESSAGE_TEMPLATES.filter(({ id }) => id === 'healthy' || id === 'field')
      : EXPERT_MESSAGE_TEMPLATES.filter(({ id }) => ['field', 'monitor', 'blurry', 'poor_light'].includes(id));

function reviewChoiceFor(item) {
  const review = item?.review;
  if (!review || review.review_status === 'pending') return '';
  if (review.review_status === 'confirmed') return review.verified_label || item.predictedClass;
  if (review.review_status === 'alternate_class') return review.verified_label || '';
  return REVIEW_OTHER_CHOICES.some(([value]) => value === review.review_status) ? review.review_status : '';
}

function reviewPayload(choice, predictedClass, notes, farmerMessage = '', messageChoice = 'none') {
  const isClass = REVIEW_CLASS_CHOICES.some(([value]) => value === choice);
  const reviewStatus = isClass ? (choice === predictedClass ? 'confirmed' : 'alternate_class') : choice;
  const unclearPhoto = messageChoice === 'blurry' || messageChoice === 'poor_light' || choice === 'cannot_determine';
  return {
    review_status: reviewStatus,
    verified_label: reviewStatus === 'alternate_class' ? choice : null,
    image_quality: messageChoice === 'blurry' ? 'blurry' : messageChoice === 'poor_light' ? 'poor_lighting' : choice === 'cannot_determine' ? 'insufficient_image' : 'good',
    next_steps: [
      ...(unclearPhoto ? ['retake_photo'] : []),
      ...(choice === 'cannot_determine' || choice === 'field_or_laboratory_required' || choice === 'possible_outside_supported_classes' || choice === 'panama-disease' ? ['seek_field_inspection'] : ['monitor_plant']),
    ],
    notes: notes.trim() || null,
    farmer_message: farmerMessage.trim() || null,
  };
}

function ExpertCases({ reviewed = false }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [claimNote, setClaimNote] = useState('');
  // Opening a waiting case marks it as yours so other agriculturists do not assess it
  // at the same time; the claim is renewed while open and released on leaving.
  const selectedId = selected?.id;
  const selectedPending = !selected?.review || selected.review.review_status === 'pending';
  useEffect(() => {
    setClaimNote('');
    if (!selectedId || reviewed || !selectedPending) return undefined;
    let active = true;
    const claim = () => api(`/expert/diagnosis-reviews/${selectedId}/claim`, { method: 'POST' })
      .then(() => { if (active) setClaimNote(''); })
      .catch((exception) => { if (active) setClaimNote(exception.message || 'Another agriculturist is working on this case.'); });
    claim();
    const timer = setInterval(claim, 10 * 60000);
    const release = () => api(`/expert/diagnosis-reviews/${selectedId}/claim`, { method: 'DELETE', keepalive: true }).catch(() => undefined);
    window.addEventListener('pagehide', release);
    return () => { active = false; clearInterval(timer); window.removeEventListener('pagehide', release); release(); };
  }, [selectedId, selectedPending, reviewed]);
  const [choice, setChoice] = useState('');
  const [notes, setNotes] = useState('');
  const [farmerMessage, setFarmerMessage] = useState('');
  const [messageChoice, setMessageChoice] = useState('none');
  const [photoFailed, setPhotoFailed] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    try {
      const cases = await api(`/expert/diagnosis-reviews?scope=${reviewed ? 'reviewed' : 'pending'}`);
      const mapped = cases.data.map(mapDiagnosis);
      setItems(mapped);
      const requested = new URLSearchParams(window.location.search).get('case');
      if (requested) {
        const target = mapped.find((item) => item.id === requested);
        if (target) { const savedMessage = target.review?.farmer_message || ''; setSelected(target); setChoice(reviewChoiceFor(target)); setNotes(target.review?.notes || ''); setFarmerMessage(savedMessage); setMessageChoice(savedMessage ? EXPERT_MESSAGE_TEMPLATES.find(({ message }) => message === savedMessage)?.id || 'other' : 'none'); setPhotoFailed(false); }
      }
      setError('');
    } catch (exception) { setError(exception.message); }
  }, [reviewed]);
  useEffect(() => { load(); }, [load]);

  const openCase = async (item) => {
    setBusy(true); setError(''); setMessage(''); setPhotoFailed(false);
    try {
      const detail = mapDiagnosis((await api(`/expert/diagnosis-reviews/${item.id}`)).data);
      setSelected(detail);
      setChoice(reviewChoiceFor(detail));
      setNotes(detail.review?.notes || '');
      const savedMessage = detail.review?.farmer_message || '';
      setFarmerMessage(savedMessage);
      setMessageChoice(savedMessage ? EXPERT_MESSAGE_TEMPLATES.find(({ message }) => message === savedMessage)?.id || 'other' : 'none');
    } catch (exception) { setError(exception.message); }
    finally { setBusy(false); }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!selected || !choice || busy || (messageChoice === 'other' && !farmerMessage.trim()) || ((!selected.image || photoFailed) && choice !== 'cannot_determine')) return;
    setBusy(true); setError('');
    try {
      const payload = await api(`/expert/diagnosis-reviews/${selected.id}`, {
        method: 'PUT', body: JSON.stringify({ ...reviewPayload(choice, selected.predictedClass, notes, farmerMessage, messageChoice), expected_review_version: selected.review?.version ?? 0 }),
      });
      setSelected(mapDiagnosis(payload.data));
      setMessage('Assessment saved. The original AI result is unchanged.');
      await load();
    } catch (exception) { setError(exception.message); }
    finally { setBusy(false); }
  };
  const nominate = async () => {
    if (!selected || busy) return;
    setBusy(true); setError('');
    try {
      await api(`/expert/dataset-candidates/from-diagnosis/${selected.id}`, { method: 'POST' });
      setMessage('Image nominated for manual dataset review.');
    } catch (exception) { setError(exception.message); }
    finally { setBusy(false); }
  };
  const photoAvailable = Boolean(selected?.image && !photoFailed);
  const reviewedCase = selected?.review && selected.review.review_status !== 'pending';

  return <div className="role-stack">
    <Heading title={reviewed ? 'Reviewed Cases' : 'Case Reviews'} text={reviewed ? 'View the photo and completed assessment.' : 'Open the leaf photo, choose one assessment, and add a note if needed.'} />
    {error && <div className="form-error" role="alert">{error}</div>}{message && <div className="success-message" role="status">{message}</div>}
    <section className="expert-review-layout">
      <div className="panel expert-case-list">
        {items.map((item) => <button key={item.id} type="button" disabled={busy} className={`expert-case-row ${selected?.id === item.id ? 'active' : ''}`} onClick={() => openCase(item)}>
          {item.image ? <img src={item.image} alt={`Leaf photo for scan ${item.id}`} /> : <span><Leaf size={23} /></span>}
          <div><strong>{item.disease?.name || titleCase(item.predictedClass)}</strong><small>{item.user?.name || 'Unknown farmer'} · {formatDate(item.date)}</small>{!item.image && <small className="priority-reason">Photo not uploaded yet</small>}{item.reviewClaim?.user && <small className="claimed-label">Being reviewed by {item.reviewClaim.user.name}</small>}</div>
          <b>{reviewed ? `${item.confidence.toFixed(1)}%` : `P${Math.round(item.priority)}`}</b><ChevronRight size={18} />
        </button>)}
        {!items.length && <Empty icon={Check} title={reviewed ? 'No completed reviews yet.' : 'No cases need review.'} text={reviewed ? 'Completed assessments will appear here.' : 'New farmer requests and uncertain results will appear here.'} />}
      </div>
      {selected && <article className="panel expert-review-card">
        <h2>Submitted leaf photo</h2>
        {selected.image && !photoFailed ? <button type="button" className="expert-photo-open" onClick={() => setPreview({ src: selected.image, label: 'Submitted leaf photo' })} aria-label="Enlarge submitted leaf photo"><img className="expert-leaf-image" src={selected.image} alt="Submitted banana leaf" onError={() => setPhotoFailed(true)} /><span>Tap to enlarge</span></button>
          : <div className="expert-photo-missing"><Leaf size={38} /><strong>Photo not uploaded yet</strong><p>The farmer's phone sends it the next time their app syncs online.</p><p>A disease class cannot be assigned without the submitted photo.</p></div>}
        <dl><div><dt>Original AI result</dt><dd>{titleCase(selected.predictedClass)} ({selected.confidence.toFixed(1)}%)</dd></div><div><dt>Farmer</dt><dd className="account-name-inline">{selected.user && <i className="account-avatar"><AvatarContent user={selected.user} /></i>}{selected.user?.name || 'Unknown'}</dd></div><div><dt>Date</dt><dd>{formatDate(selected.date, true)}</dd></div></dl>
        {selected.farmerNotes && <p className="review-meta"><strong>Farmer's note:</strong> {selected.farmerNotes}</p>}{selected.location && <p className="review-meta"><strong>Scanned near:</strong> <a href={`https://www.openstreetmap.org/?mlat=${selected.location.latitude}&mlon=${selected.location.longitude}#map=14/${selected.location.latitude}/${selected.location.longitude}`} target="_blank" rel="noreferrer">{selected.location.latitude.toFixed(3)}, {selected.location.longitude.toFixed(3)} (map)</a></p>}{selected.review?.review_status === 'pending' && selected.review.revisions?.length > 0 && (() => { const last = selected.review.revisions[0]; return <p className="review-meta reopened-note"><strong>Reopened by the farmer.</strong> Previous assessment: {titleCase(last.review_status)}{last.verified_label ? ` (${titleCase(last.verified_label)})` : ''}{last.reviewer?.name ? ` by ${last.reviewer.name}` : ''}.{last.farmer_message ? ` Message sent: "${last.farmer_message}"` : ''}</p>; })()}{selected.review?.farmer_reply && <p className="review-meta"><strong>Farmer's reply:</strong> {selected.review.farmer_reply}</p>}{selected.farmerHistory?.length > 0 && <details className="farmer-history" open><summary>This farmer's recent scans ({selected.farmerHistory.length})</summary><ul>{selected.farmerHistory.map((past) => <li key={past.id}>{formatDate(past.diagnosed_at)} · {titleCase(past.predicted_class)} {Number(past.confidence).toFixed(0)}%{past.review_status && past.review_status !== 'pending' ? ` · reviewed: ${titleCase(past.verified_label || past.review_status)}` : past.review_status === 'pending' ? ' · review waiting' : ''}</li>)}</ul></details>}
        <div className="expert-reference-section"><h3>Reference leaf photos</h3><p>Examples for comparison; they do not establish a diagnosis.</p><div className="expert-reference-grid">{REVIEW_CLASS_CHOICES.map(([value, label]) => <button type="button" key={value} onClick={() => setPreview({ src: GUIDE_MEDIA[value].images[0], label: `${label} reference` })}><img src={GUIDE_MEDIA[value].images[0]} alt={`${label} reference leaf`} loading="lazy" /><span>{label}</span></button>)}</div></div>
        {reviewedCase ? <section className="review-result"><h3>Assessment: {REVIEW_CHOICES.find(([value]) => value === reviewChoiceFor(selected))?.[1] || titleCase(selected.review.review_status)}</h3><p><strong>Message to farmer:</strong> {selected.review?.farmer_message || 'None'}</p><p><strong>Internal notes:</strong> {selected.review?.notes || 'None'}</p><ReviewRevisions revisions={selected.review?.revisions} />{selected.image && selected.researchConsent && <button type="button" className="secondary-button full" disabled={busy} onClick={nominate}><Database size={17} />Nominate as Dataset Candidate</button>}</section>
          : <form className="expert-review-form" onSubmit={submit}><h2>What does the photo show?</h2><fieldset><legend>Choose one assessment</legend>{REVIEW_CHOICES.filter(([value]) => photoAvailable || value === 'cannot_determine').map(([value, label]) => <label key={value} className={choice === value ? 'selected' : ''}><input type="radio" name="review-choice" value={value} checked={choice === value} onChange={() => { if (choice !== value) { setMessageChoice('none'); setFarmerMessage(''); } setChoice(value); }} />{label}</label>)}</fieldset><label>Message to the farmer
  <select value={messageChoice} onChange={(event) => { const next = event.target.value; setMessageChoice(next); setFarmerMessage(EXPERT_MESSAGE_TEMPLATES.find(({ id }) => id === next)?.message || ''); }}>
    <option value="none">Choose a suggested response (optional)</option>
    {expertMessageOptions(choice, photoAvailable).map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
    <option value="other">Other — write your own</option>
  </select>
</label>
{messageChoice === 'other' ? <label>Your message to the farmer<textarea maxLength={2000} required value={farmerMessage} onChange={(event) => setFarmerMessage(event.target.value)} placeholder="What should the farmer check or do next?" /></label> : farmerMessage ? <p className="review-meta"><strong>Message preview:</strong> {farmerMessage}</p> : null}<label>Internal note (agriculturists and admins only)<textarea maxLength={5000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Visible signs, uncertainty, or advice for field inspection" /></label><p className="review-meta">The farmer sees the assessment, a suggested next step and your message. Internal notes are never shown to the farmer.</p>{claimNote && <p className="form-error" role="alert">{claimNote}</p>}<button className="primary-button" disabled={busy || Boolean(claimNote) || !choice || messageChoice === 'other' && !farmerMessage.trim() || (!photoAvailable && choice !== 'cannot_determine')}>{busy ? 'Saving…' : 'Save assessment'}</button></form>}
      </article>}
    </section>
    <ModalShell open={Boolean(preview)} title={preview?.label || 'Leaf photo'} onClose={() => setPreview(null)} size="large">{preview && <img className="expert-photo-zoom" src={preview.src} alt={preview.label} />}</ModalShell>
  </div>;
}

function ExpertDiseases() {
  const [items, setItems] = useState([]); const [detail, setDetail] = useState(null); const [notes, setNotes] = useState(''); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const load = useCallback(() => api('/expert/diseases').then((payload) => setItems(payload.data)).catch((exception) => setError(exception.message)), []); useEffect(() => { load(); }, [load]);
  const inspect = async (item) => { try { const payload = await api(`/expert/diseases/${item.id}`); setDetail(payload.data); setNotes(''); setError(''); } catch (exception) { setError(exception.message); } }; const decide = async (status) => { try { await api(`/expert/diseases/${detail.disease.id}/verification`, { method: 'POST', body: JSON.stringify({ status, notes }) }); setMessage(`Review recorded: ${titleCase(status.replaceAll('_', '-'))}.`); setDetail(null); setNotes(''); load(); } catch (exception) { setError(exception.message); } };
  return <div className="role-stack"><Heading title="Disease Knowledge" text="Verify researched agricultural content and return incomplete records for revision." />{error && <div className="form-error">{error}</div>}{message && <div className="success-message">{message}</div>}<section className="panel admin-table-role knowledge-table"><header><span>Disease</span><span>Pathogen</span><span>Status</span><span>Evidence</span><span>Sources</span><span>Last reviewed</span><span>Actions</span></header>{items.map((item) => <div key={item.id}><span><strong>{item.name}</strong><small>{item.model_class_key}</small></span><span>{item.causal_agent || 'Pending'}</span><span><b className={`status-pill ${item.verification_status}`}>{item.verification_status}</b></span><span>{item.evidence_level}</span><span>{item.sources_count ?? 0}</span><span>{formatDate(item.last_reviewed_at)}</span><span><button onClick={() => inspect(item)}>Review</button></span></div>)}</section>{detail && <section className="panel expert-content-review"><header><div><h2>Review {detail.disease.name}</h2></div><IconButton label="Close" onClick={() => setDetail(null)}><X size={20} /></IconButton></header><div className="expert-content-grid"><article><h3>Farmer content</h3><p>{detail.disease.description || 'Missing farmer summary.'}</p><h3>Symptoms</h3><p>{detail.disease.symptoms?.join(' · ') || 'No image-visible symptoms documented.'}</p><h3>Management and prevention</h3><p>{detail.disease.management || 'No management content documented.'}</p></article><article><h3>Scientific record</h3><p><strong>Causal agent:</strong> {detail.disease.causal_agent || 'Pending'}</p><p><strong>Evidence level:</strong> {detail.disease.evidence_level}</p><p><strong>Research sources:</strong> {detail.disease.sources_count ?? 0}</p><p><strong>Image limitation:</strong> {detail.disease.image_only_limitations || 'Not documented.'}</p>{detail.regulatory_recheck_required && <div className="form-error">FPA / REGULATORY RE-CHECK REQUIRED</div>}</article></div><label>Agriculturist notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Record evidence gaps, corrections, or verification rationale." /></label><footer><button className="primary-button" disabled={detail.disease.verification_status !== 'researched'} onClick={() => decide('verified')}>Verify Content</button><button className="secondary-button" onClick={() => decide('revision_required')}>Request Revision</button><button className="danger-button" onClick={() => decide('rejected')}>Reject</button></footer></section>}</div>;
}

function AdminResearchImages() {
  const [items, setItems] = useState([]); const [reason, setReason] = useState({}); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(() => api('/admin/research-images').then((response) => setItems(response.data)).catch((exception) => setError(exception.message)), []);
  useEffect(() => { load(); }, [load]);
  const remove = async (item) => { setBusy(true); setError(''); try { await api(`/admin/research-images/${item.id}`, { method: 'DELETE', body: JSON.stringify({ reason: item.file_removal_pending ? item.revocation_reason || 'Retry file removal' : reason[item.id] }) }); await load(); } catch (exception) { setError(exception.message); } finally { setBusy(false); } };
  return <section className="panel role-form"><h2>Research photo audit</h2><p>Private copies stay after scan or account deletion. Record a reason when removing one.</p>{error && <p className="form-error">{error}</p>}{items.map((item) => <div key={item.id} className="review-notice"><Database size={20} /><div><strong>#{item.id} · {titleCase(item.verified_label)}</strong><p>{item.file_removal_pending ? 'Research use revoked; file removal pending.' : item.revoked_at ? `Removed ${formatDate(item.revoked_at, true)} · ${item.revocation_reason}` : `Approved ${formatDate(item.approved_at, true)}`}</p>{(!item.revoked_at || item.file_removal_pending) && <>{!item.file_removal_pending && <input value={reason[item.id] || ''} onChange={(event) => setReason({ ...reason, [item.id]: event.target.value })} placeholder="Reason for removal" maxLength={500} />}<button className="danger-button" disabled={busy || !item.file_removal_pending && !reason[item.id]?.trim()} onClick={() => remove(item)}>{item.file_removal_pending ? 'Retry file removal' : 'Remove private copy'}</button></>}</div></div>)}</section>;
}

function ExpertDatasetCandidates({ base = '/expert' }) {
  const [items, setItems] = useState([]); const [filter, setFilter] = useState(''); const [notes, setNotes] = useState({}); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const load = useCallback(() => api(`${base}/dataset-candidates${filter ? `?status=${filter}` : ''}`).then((payload) => setItems(payload.data)).catch((exception) => setError(exception.message)), [base, filter]); useEffect(() => { load(); }, [load]);
  const decide = async (item, status) => { try { await api(`${base}/dataset-candidates/${item.id}`, { method: 'PUT', body: JSON.stringify({ status, review_notes: notes[item.id] || null }) }); setMessage('Manual dataset-candidate decision recorded.'); setError(''); load(); } catch (exception) { setError(exception.message); } };
  return <div className="role-stack"><Heading title="Candidate Dataset Images" text="Approval saves a separate private copy of a consented, reviewed photo." />{base === '/admin' && <AdminResearchImages />}<div className="development-note"><Info size={18} /><p>Approval retains a private research copy. Export, de-identification, and inclusion in future training remain separate controlled steps. Farmers can remove copies after approval.</p></div><section className="panel diagnosis-filters"><label>Status<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">All candidates</option>{['pending','approved','rejected','uncertain'].map((value) => <option key={value}>{titleCase(value)}</option>)}</select></label></section>{error && <div className="form-error">{error}</div>}{message && <div className="success-message">{message}</div>}<section className="dataset-candidate-grid">{items.map((item) => <article className="panel dataset-candidate" key={item.id}>{item.diagnosis?.image_url ? <img src={item.diagnosis.image_url} alt="Reviewed candidate banana leaf" /> : <div className="expert-leaf-placeholder"><Leaf size={35} /></div>}<span className={`status-pill ${item.status}`}>{item.status}</span><h2>{item.diagnosis?.disease?.name || titleCase(item.diagnosis?.predicted_class || '')}</h2><p><strong>AI:</strong> {titleCase(item.diagnosis?.predicted_class || '')} · {Number(item.diagnosis?.confidence || 0).toFixed(1)}%</p><p><strong>Agricultural review:</strong> {titleCase(item.diagnosis?.review?.review_status?.replaceAll('_', '-') || 'Pending')}</p><textarea value={notes[item.id] ?? item.review_notes ?? ''} onChange={(event) => setNotes({ ...notes, [item.id]: event.target.value })} placeholder="Record why this image should be approved, rejected, or kept uncertain." /><footer><button className="primary-button" disabled={!item.diagnosis?.research_consent_current || item.status === 'approved' || !['confirmed', 'alternate_class'].includes(item.diagnosis?.review?.review_status) || item.diagnosis?.review?.image_quality !== 'good'} title="Approval requires consent and a clear, completed agricultural assessment" onClick={() => decide(item, 'approved')}>Approve</button><button className="secondary-button" disabled={item.status === 'approved'} onClick={() => decide(item, 'uncertain')}>Uncertain</button><button className="danger-button" disabled={item.status === 'approved'} onClick={() => decide(item, 'rejected')}>Reject</button></footer></article>)}{!items.length && <Empty icon={Database} title="No research candidates found." text="An agriculturist must first complete a case assessment and manually nominate an image." />}</section></div>;
}

function ExpertSources() {
  const { data, error } = useAdmin('/expert/research-sources'); if (error) return <div className="form-error">{error}</div>; if (!data) return <Loading text="Loading research sources..." />;
  return <div className="role-stack"><Heading title="Research Sources" text="Review the evidence used for disease claims. Administrators retain source-management access." /><section className="panel admin-table-role source-table"><header><span>Reference</span><span>Year</span><span>Type</span><span>Quality</span><span>Claims</span><span>Link</span></header>{data.map((item) => <div key={item.id}><span><strong>{item.authors} ({item.year || 'n.d.'}). {item.title}.</strong><small>{item.journal_or_institution}</small></span><span>{item.year || 'n.d.'}</span><span>{titleCase(item.source_type.replaceAll('_','-'))}</span><span>{item.peer_reviewed ? 'Peer reviewed' : 'Authoritative'}{item.philippines_specific ? ' · Philippines' : ''}</span><span>{item.evidence_count}</span><span>{item.reference_url ? <a href={item.reference_url} target="_blank" rel="noreferrer">Open source</a> : 'No link'}</span></div>)}</section></div>;
}

function SystemAdmin() {
  const { data, error } = useAdmin('/admin/system'); if (error) return <div className="form-error">{error}</div>; if (!data) return <Loading text="Loading system information..." />; const fields = [['Model', data.model], ['Attention', data.attention], ['Deployment', data.deployment], ['Version', data.version || 'Not configured'], ['Input size', data.input_size || 'Not configured'], ['Classes', data.classes.length ? data.classes.join(', ') : 'Not configured'], ['Confidence threshold', `${data.confidence_threshold}%`]];
  return <div className="role-stack"><Heading title="System / Model Information" text="Technical deployment details are visible only to administrators." /><section className="panel system-role-card"><div className="system-mode"><span>AI Mode</span><strong>{data.ai_mode}</strong></div><dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><div className="development-note"><Info size={18} /><p>Performance values are omitted until validated research artifacts are available.</p></div></section></div>;
}

function ModelComparisonAdmin() {
  const input = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const choose = (next) => {
    if (!next?.type.startsWith('image/')) {
      setError('Choose a JPG, PNG, or WEBP banana-leaf image.');
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setResult(null);
    setError('');
  };

  const compare = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult(null);
    const body = new FormData();
    body.append('image', file);

    try {
      const payload = await api('/admin/model-comparison', { method: 'POST', body });
      setResult(payload.data);
    } catch (exception) {
      setError(exception.message);
    } finally {
      setBusy(false);
    }
  };

  const difference = (value, unit) => {
    const amount = Number(value);
    return `${amount >= 0 ? '+' : ''}${amount.toFixed(2)} ${unit}`;
  };

  return <div className="role-stack">
    <Heading title="Model comparison" text="Run the baseline and proposed CA-MobileNetV3-Small on one shared image. Research runs are not saved to farmer history." />

    <section className="panel comparison-workspace">
      <div className="comparison-image-panel">
        {preview
          ? <img src={preview} alt="Banana leaf selected for model comparison" />
          : <div><FileImage size={38} /><strong>Select one banana leaf image</strong><small>JPG, PNG, or WEBP · up to 10 MB</small></div>}
        <input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => choose(event.target.files[0])} />
      </div>

      <div className="comparison-actions">
        <button className="secondary-button" onClick={() => input.current?.click()}><Upload size={17} />{file ? 'Choose another image' : 'Choose image'}</button>
        <button className="primary-button" disabled={!file || busy} onClick={compare}>
          {busy ? <RefreshCw className="spin" size={17} /> : <GitCompareArrows size={17} />}
          {busy ? 'Running sequentially...' : 'Run comparison'}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}
      <div className="development-note"><Info size={18} /><p>Baseline runs first and is released before the proposed-model interpreter loads. A higher confidence on one image does not prove higher accuracy.</p></div>
    </section>

    {result && <>
      <section className="comparison-results" aria-label="Model results">
        <ComparisonModelCard title="Baseline" value={result.baseline} />
        <ComparisonModelCard title="Proposed" value={result.enhanced} />
      </section>

      <section className="comparison-card comparison-summary">
        <header className="comparison-card-header">
          <span>Comparison summary</span>
          <h2>{result.comparison.summary}</h2>
        </header>
        <dl className="comparison-metrics">
          <div><dt>Prediction agreement</dt><dd>{result.comparison.prediction_agreement ? 'Agreement' : 'Different predictions'}</dd></div>
          <div><dt>Confidence difference</dt><dd>{difference(result.comparison.enhanced_confidence_difference_percentage_points, 'points')}</dd></div>
          <div><dt>Inference-time difference</dt><dd>{difference(result.comparison.enhanced_latency_difference_ms, 'ms')}</dd></div>
        </dl>
        <p className="comparison-note">{result.comparison.interpretation_note}</p>
      </section>
    </>}
  </div>;
}

const HOME_STEPS = [
  ['Take a photo', 'Take or upload a clear photo of one banana leaf.'],
  ['Check the result', 'DahonMD tells you what the leaf most likely has and what to do next.'],
  ['Ask an agriculturist', 'If the result is unclear, send it to an agriculturist for a second look.'],
];
const HOME_CONDITIONS = [
  ['healthy', 'Healthy leaf', 'Green leaf with no spots or yellowing.'],
  ['sigatoka', 'Sigatoka', 'Yellow streaks that turn into brown or black spots.'],
  ['cordana-leaf-spot', 'Cordana Leaf Spot', 'Large pale brown patches with a yellow edge.'],
  ['panama-disease', 'Panama Disease', 'Yellowing that starts at the leaf edge and spreads.'],
];
const HOME_BENEFITS = [
  ['Scan history', 'Your past scans are saved and can be opened on any device.'],
  ['Answers from agriculturists', 'An agriculturist can check your photo and reply with advice.'],
  ['Works offline', 'Scans are kept in your browser and sent when you are back online.'],
  ['Disease guide', 'Signs, prevention and care for each disease, plus short articles.'],
];

function PublicLanding({ online, authMode, onAuthMode, onAuthenticated }) {
  const goToScan = () => document.getElementById('scan')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return <div className="public-app">
    <header className="public-header"><a className="public-brand" href="/" onClick={(event) => { event.preventDefault(); onAuthMode(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><span><LogoMark /></span><div><strong>DahonMD</strong></div></a><div className="public-auth-actions"><select className="public-language" aria-label={tr('Language')} value={getLanguage()} onChange={(event) => setLanguage(event.target.value)}><option value="en">English</option><option value="fil">Filipino</option></select><button className="secondary-button" onClick={() => onAuthMode('login')}><CircleUserRound size={17} />{tr('Log in')}</button><button className="primary-button" onClick={() => onAuthMode('register')}><Plus size={17} />{tr('Sign up')}</button></div></header>
    <main>
      <section className="home-hero">
        <div className="home-hero-text">
          <h1>{tr('Check your banana leaves with one photo.')}</h1>
          <p>{tr('DahonMD helps banana farmers spot common leaf diseases early. Take a photo, see the result in seconds, and ask an agriculturist when you need help.')}</p>
          <div className="home-hero-actions">
            <button type="button" className="primary-button" onClick={goToScan}><ScanLine size={18} />{tr('Scan a leaf now')}</button>
            <button type="button" className="secondary-button" onClick={() => onAuthMode('register')}>{tr('Create a free account')}</button>
          </div>
          <small>{tr('Free to use. No account needed to try a scan.')}</small>
        </div>
        <img className="home-hero-image" src="/assets/disease-guide/sigatoka-2.webp" alt={tr('Banana leaf with Sigatoka spots')} />
      </section>

      <section className="home-section">
        <h2>{tr('How it works')}</h2>
        <ol className="home-steps">{HOME_STEPS.map(([title, text]) => <li key={title}><h3>{tr(title)}</h3><p>{tr(text)}</p></li>)}</ol>
      </section>

      <section className="home-section">
        <h2>{tr('What DahonMD can check')}</h2>
        <p className="home-section-text">{tr('The scanner looks for these leaf conditions. More diseases are explained in the guide after you sign up.')}</p>
        <div className="home-conditions">{HOME_CONDITIONS.map(([key, name, text]) => <article key={key}><img src={GUIDE_MEDIA[key].images[0]} alt="" loading="lazy" /><h3>{tr(name)}</h3><p>{tr(text)}</p></article>)}</div>
      </section>

      <section className="home-section" id="scan">
        <FarmerScan onSaved={null} online={online} onAuthRequired={onAuthMode} navigate={() => onAuthMode('login')} autoStartCamera={false} />
      </section>

      <section className="home-section">
        <h2>{tr('With a free account')}</h2>
        <dl className="home-benefits">{HOME_BENEFITS.map(([title, text]) => <div key={title}><dt>{tr(title)}</dt><dd>{tr(text)}</dd></div>)}</dl>
        <button type="button" className="primary-button home-signup-button" onClick={() => onAuthMode('register')}>{tr('Sign up')}</button>
      </section>

      <footer className="home-footer"><p>{tr('DahonMD gives screening support only. It cannot confirm a disease. Always ask your local agriculturist before spraying or removing plants.')}</p></footer>
    </main>
    <AuthModal mode={authMode} onClose={() => onAuthMode(null)} onMode={onAuthMode} onAuthenticated={onAuthenticated} />
    <AssistantWidget user={null} online={online} onLogin={() => onAuthMode('login')} />
  </div>;
}

export default function RoleApp() {
  useLanguage();
  const first = window.location.pathname; const [path, setPath] = useState(first); const [user, setUser] = useState(null); const [loading, setLoading] = useState(true); const [online, setOnline] = useState(navigator.onLine); const [records, setRecords] = useState([]); const [selected, setSelected] = useState(null); const [pendingChanges, setPendingChanges] = useState(0); const [logoutPending, setLogoutPending] = useState(null); const [logoutError, setLogoutError] = useState('');
  const navigate = useCallback((next, replace = false) => { window.history[replace ? 'replaceState' : 'pushState']({}, '', next); setPath(next); }, []);
  useEffect(() => { const onExpired = () => { if (user?.role === 'farmer') clearWebAccountData(user.id, true).catch(() => undefined); setUser(null); setRecords([]); setPendingChanges(0); navigate('/', true); }; window.addEventListener(AUTH_EXPIRED_EVENT, onExpired); return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired); }, [navigate, user?.id, user?.role]);
  useEffect(() => { const pop = () => setPath(window.location.pathname); const network = () => setOnline(navigator.onLine); window.addEventListener('popstate', pop); window.addEventListener('online', network); window.addEventListener('offline', network); return () => { window.removeEventListener('popstate', pop); window.removeEventListener('online', network); window.removeEventListener('offline', network); }; }, []);
  useEffect(() => { api('/auth/me').then((payload) => { setToken(true); setUser(payload.data.user); }).catch((error) => { if (error.status === 401) setToken(null); }).finally(() => setLoading(false)); }, []);
  const syncInFlight = useRef(null);
  const loadRecords = useCallback(async () => {
    if (user?.role !== 'farmer') return;
    try {
      if (!online) throw new Error('Offline');
      if (!syncInFlight.current) {
        syncInFlight.current = (async () => {
          await flushWebDiagnosisOutbox(user.id);
          await pullWebDiagnosisChanges(user.id, mapDiagnosis);
        })().finally(() => { syncInFlight.current = null; });
      }
      await syncInFlight.current;
      const [serverRecords, pending, pendingCount] = await Promise.all([readCachedHistory(user.id), listPendingWebDiagnoses(user.id), countPendingWebChanges(user.id)]);
      setRecords(mergeRecords(pending, serverRecords));
      setPendingChanges(pendingCount);
      return true;
    } catch {
      const [cached, pending, pendingCount] = await Promise.all([readCachedHistory(user.id), listPendingWebDiagnoses(user.id), countPendingWebChanges(user.id)]).catch(() => [[], [], 0]);
      setRecords(mergeRecords(pending, cached));
      setPendingChanges(pendingCount);
      return false;
    }
  }, [user?.id, user?.role, online]);
  useEffect(() => {
    loadRecords();
    if (user?.role !== 'farmer') return undefined;
    const refresh = () => { if (document.visibilityState === 'visible') loadRecords(); };
    const timer = setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [loadRecords, user?.role]);
  useEffect(() => { if (user?.role === 'farmer' && records.length) cacheHistory(user.id, records.filter((record) => record.synced)).catch(() => undefined); }, [user?.id, user?.role, records]);
  useEffect(() => { if (!loading && !user && !['/', '/login', '/signup'].includes(path)) navigate('/', true); }, [loading, user, path, navigate]);
  useEffect(() => { if (!user) return; const legacy = ['/', '/dashboard', '/diagnose', '/history', '/profile'].includes(path); const prefix = user.role === 'admin' ? '/admin' : user.role === 'agricultural_expert' ? '/expert' : '/farmer'; const wrong = !path.startsWith(prefix); if (legacy || wrong) navigate(roleHome(user.role), true); }, [user, path, navigate]);
  const resetSessionUi = () => { setUser(null); setRecords([]); setPendingChanges(0); setLogoutPending(null); setLogoutError(''); navigate('/', true); };
  const finishSignOut = async () => {
    const currentUser = user;
    setLogoutPending(null);
    try {
      await logout();
    } catch {
      setLogoutError('DahonMD could not securely end the server session. Check your connection and try again.');
      return;
    }
    if (currentUser?.role === 'farmer') await clearWebAccountData(currentUser.id, true).catch(() => undefined);
    resetSessionUi();
  };
  const signedOut = async () => {
    const currentUser = user;
    let remainingPending = currentUser?.role === 'farmer'
      ? await countPendingWebChanges(currentUser.id).catch(() => pendingChanges)
      : 0;
    if (currentUser?.role === 'farmer' && online) {
      try { await flushWebDiagnosisOutbox(currentUser.id); remainingPending = await countPendingWebChanges(currentUser.id); } catch { /* Confirm deletion below. */ }
    }
    if (remainingPending > 0) { setLogoutPending(remainingPending); return; }
    await finishSignOut();
  };
  const accountDeleted = async () => {
    if (user?.role === 'farmer') await clearWebAccountData(user.id, true).catch(() => undefined);
    resetSessionUi();
  };
  const save = async (record, imageFile, requestReview = false) => {
    const queued = await queueWebDiagnosis(user.id, record, imageFile, requestReview);
    setRecords((current) => [queued, ...current]);
    countPendingWebChanges(user.id).then(setPendingChanges).catch(() => undefined);
    if (online) loadRecords();
    return queued;
  };
  const removeDiagnosis = async (record) => {
    await queueWebDiagnosisDeletion(user.id, record);
    setRecords((current) => current.filter((item) => item.id !== record.id));
    setSelected(null);
    setPendingChanges(await countPendingWebChanges(user.id));
    if (online) loadRecords();
  };
  const [reviewQueue, setReviewQueue] = useState(0);
  const [chatTopic, setChatTopic] = useState(null);
  const [guideClass, setGuideClass] = useState(null);
  const [libraryClass, setLibraryClass] = useState(null);
  useEffect(() => {
    if (user?.role !== 'agricultural_expert') { setReviewQueue(0); return undefined; }
    const refresh = () => { if (document.visibilityState === 'visible') api('/expert/dashboard').then((payload) => setReviewQueue(payload.data.farmer_review_requests || 0)).catch(() => undefined); };
    refresh();
    const timer = setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [user?.id, user?.role]);
  // Opening a scan with a new expert review marks it as read on every device.
  const openRecord = (record) => {
    setSelected(record);
    if (!record?.synced || !isNewReview(record.review)) return;
    api(`/diagnoses/${record.id}/review-seen`, { method: 'POST', body: JSON.stringify({ expected_review_version: record.review.version ?? 0 }) }).then((payload) => {
      const updated = mapDiagnosis(payload.data);
      updated.image ||= record.image;
      setRecords((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelected((current) => current?.id === updated.id ? updated : current);
    }).catch(() => undefined);
  };
  const logoutDialogs = <><ConfirmDialog open={logoutPending !== null} title="Discard unsynchronized changes?" text={`${logoutPending ?? 0} unsynchronized change${logoutPending === 1 ? '' : 's'} will be removed from this browser when you log out.`} confirmLabel="Discard and log out" danger onCancel={() => setLogoutPending(null)} onConfirm={finishSignOut} /><ModalShell open={Boolean(logoutError)} title="Could not log out" description={logoutError} onClose={() => setLogoutError('')} size="small"><div className="confirm-actions"><button type="button" className="primary-button" onClick={() => setLogoutError('')}>Close</button></div></ModalShell></>;
  if (loading) return <Loading text="Restoring your secure session..." />; if (!user) { const authMode = path === '/login' ? 'login' : path === '/signup' ? 'register' : null; const setAuthMode = (mode) => navigate(mode === 'login' ? '/login' : mode === 'register' ? '/signup' : '/', true); const authenticated = (nextUser) => { setUser(nextUser); navigate(roleHome(nextUser.role), true); }; return <PublicLanding online={online} authMode={authMode} onAuthMode={setAuthMode} onAuthenticated={authenticated} />; }
  if (user.role === 'farmer') { const requestReview = async (record, farmerNotes = '') => {
    // The agriculturist checks the leaf from its photo, so it is saved on the server before the request.
    if (!record.serverImage && record.image?.startsWith('data:image/') && record.syncUuid) {
      const blob = await (await fetch(record.image)).blob();
      const body = new FormData();
      body.append('image', blob, 'saved-banana-leaf.jpg');
      body.append('purpose', 'review');
      await api(`/sync/${record.syncUuid}/image`, { method: 'POST', body });
    }
    const payload = await api(`/diagnoses/${record.id}/review-request`, { method: 'POST', body: JSON.stringify({ farmer_notes: farmerNotes || null }) });
    const updated = mapDiagnosis(payload.data);
    updated.image ||= record.image;
    setRecords((current) => current.map((item) => item.id === updated.id ? updated : item));
    setSelected(updated);
  }; const openLibrary = (classKey) => { setLibraryClass(classKey); navigate('/farmer/library'); }; const openGuide = (classKey) => { setSelected(null); setGuideClass(classKey); navigate('/farmer/diseases'); }; const askAboutScan = (record) => { setSelected(null); setChatTopic((current) => ({ key: (current?.key ?? 0) + 1, diagnosisId: Number(record.id), label: record.disease?.name || titleCase(record.predictedClass) })); }; const replyToReview = async (record, text, file) => {
    const body = new FormData();
    body.append('farmer_reply', text);
    if (file) body.append('image', file);
    const payload = await api(`/diagnoses/${record.id}/follow-up`, { method: 'POST', body });
    const updated = mapDiagnosis(payload.data);
    if (!file) updated.image ||= record.image;
    setRecords((current) => current.map((item) => item.id === updated.id ? updated : item));
    setSelected(updated);
  }; const researchConsent = async (record, granted) => { const payload = await api(`/diagnoses/${record.id}/research-consent`, { method: granted ? 'POST' : 'DELETE' }); const updated = mapDiagnosis(payload.data); updated.image ||= record.image; setRecords((current) => current.map((item) => item.id === updated.id ? updated : item)); setSelected(updated); }; const currentSelected = selected ? records.find((record) => record.id === selected.id) || selected : null; let page = <FarmerHome user={user} records={records} online={online} navigate={navigate} onOpen={openRecord} pendingChanges={pendingChanges} />; if (path === '/farmer/scan') page = <FarmerScan onSaved={save} navigate={navigate} online={online} />; if (path === '/farmer/history') page = <FarmerHistory records={records} navigate={navigate} onOpen={openRecord} />; if (path === '/farmer/diseases') page = <DiseaseGuide key={guideClass || 'all'} initialClass={guideClass} navigate={navigate} onOpenLibrary={openLibrary} />; if (path === '/farmer/library') page = <ArticleLibrary key={libraryClass || 'all'} navigate={navigate} onOpenLibrary={openLibrary} initialDisease={libraryClass || 'all'} />; if (path === '/farmer/profile') page = <ProfilePage user={user} onUser={setUser} onAccountDeleted={accountDeleted} />; return <><FarmerShell user={user} path={path} navigate={navigate} onSignedOut={signedOut} online={online} chatTopic={chatTopic} badges={{ '/farmer/history': records.filter((record) => isNewReview(record.review)).length }}>{page}<DiagnosisDialog record={currentSelected} onClose={() => setSelected(null)} onRequestReview={requestReview} onDelete={removeDiagnosis} onResearchConsent={researchConsent} onReply={replyToReview} onAskAssistant={askAboutScan} onOpenGuide={openGuide} /></FarmerShell>{logoutDialogs}</>; }
  if (user.role === 'agricultural_expert') { let page = <ExpertDashboard user={user} navigate={navigate} />; if (path.startsWith('/expert/cases')) page = <ExpertCases />; if (path === '/expert/diseases') page = <ExpertDiseases />; if (path === '/expert/sources') page = <ExpertSources />; if (path === '/expert/library') page = <ArticleLibrary navigate={navigate} showGuideTabs={false} />; if (path === '/expert/dataset') page = <ExpertDatasetCandidates />; if (path === '/expert/reviewed') page = <ExpertCases reviewed />; if (path === '/expert/profile') page = <ProfilePage user={user} onUser={setUser} onAccountDeleted={accountDeleted} />; return <><Shell role="agricultural_expert" user={user} path={path.split('?')[0]} navigate={navigate} onSignedOut={signedOut} online={online} badges={{ '/expert/cases': reviewQueue }}>{page}</Shell>{logoutDialogs}</>; }
  let page = <AdminDashboard user={user} />; if (path === '/admin/accounts') page = <AccountsAdmin />; if (path === '/admin/farmers') page = <AccountsAdmin initialRole="farmer" />; if (path === '/admin/experts') page = <AccountsAdmin initialRole="agricultural_expert" />; if (path === '/admin/diagnoses') page = <DiagnosesAdmin />; if (path === '/admin/diseases') page = <DiseasesAdmin />; if (path === '/admin/sources') page = <ResearchSourcesAdmin />; if (path === '/admin/articles') page = <ArticlesAdmin />; if (path === '/admin/dataset') page = <ExpertDatasetCandidates base="/admin" />; if (path === '/admin/analytics') page = <AdminAnalytics />; if (path === '/admin/model-comparison') page = <ModelComparisonAdmin />; if (path === '/admin/system') page = <SystemAdmin />; if (path === '/admin/profile') page = <ProfilePage user={user} onUser={setUser} onAccountDeleted={accountDeleted} />; return <><Shell role="admin" user={user} path={path} navigate={navigate} onSignedOut={signedOut} online={online}>{page}</Shell>{logoutDialogs}</>;
}
