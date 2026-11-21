import { useState, useEffect, useRef } from 'react';
import { load, save, uid, syncAll, addActivity, loadSession, saveSession, clearSession } from './db.js';
import { Recu, Devis, printDoc, fmt, dt } from './Docs.jsx';
import { fx, reduce } from './fx.js';
import { exportCsv } from './exports.js';
import { bluetoothAvailable, connectPrinter, printReceiptBluetooth, bytesAsHex } from './bluetooth.js';
import { trackingUrl } from './qr.js';

const PERM = {
  admin: ['dash', 'colis', 'devis', 'recu', 'users', 'caisse', 'journal', 'clients', 'reports'],
  caissier: ['colis', 'devis', 'recu', 'caisse', 'clients'],
  agent: ['colis', 'devis', 'clients']
};
const TITLES = { dash: 'Tableau de bord', colis: 'Colis', docs: 'Documents', users: 'Administration', caisse: 'Clôture de caisse', journal: 'Journal d’activité', clients: 'Clients', reports: 'Rapports' };
const ICON = { dash: '▣', colis: '▤', docs: '▥', users: '⚙', caisse: '€', journal: '≡', clients: '♙', reports: '▥' };
const today = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const STAT = ['En transit', 'Arrivé', 'Retiré'];
const PAYMENTS = ['Espèces', 'Orange Money', 'MTN MoMo', 'Virement'];
const storageInfo = (c, settings, date = today()) => {
  if (!c.dateArrivee || !settings.storageRate) return { days: 0, fee: 0 };
  const day = value => { const [y, m, d] = value.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const endDate = c.statut === 'Retiré' && c.dateRetrait ? c.dateRetrait : date;
  const days = Math.max(0, Math.floor((day(endDate) - day(c.dateArrivee)) / 86400000));
  return { days, fee: Math.max(0, days - Number(settings.freeDays || 0)) * Number(settings.storageRate || 0) };
};
const trackingFromHash = () => {
  const match = window.location.hash.match(/^#\/suivi\/(.+)$/);
  if (!match) return '';
  try { return decodeURIComponent(match[1]); } catch { return ''; }
};

function Footer() {
  return <footer className="app-footer">Réalisé par <a href="https://groupe-bigdatacenter.com/" target="_blank" rel="noopener noreferrer">BigDataCenter &amp; IA</a></footer>;
}

function Login({ users, onLogin }) {
  const [l, setL] = useState(''), [p, setP] = useState(''), [err, setErr] = useState('');
  useEffect(() => { fx(g => { g.timeline().from('.login', { y: 50, opacity: 0, duration: .6, ease: 'power3.out' })
    .from('.login .stripe', { scaleX: 0, transformOrigin: 'left', duration: .5, ease: 'power2.out' }, '-=.2')
    .from('.login form > *', { y: 14, opacity: 0, stagger: .08, duration: .35, clearProps: 'all' }, '-=.2'); }); }, []);
  const go = ev => {
    ev.preventDefault();
    const u = users.find(x => x.login === l && x.pass === p);
    if (u) onLogin({ id: u.id, nom: u.nom, role: u.role });
    else { setErr('Identifiant ou mot de passe incorrect.'); fx(g => g.fromTo('.login', { x: -10 }, { x: 0, duration: .5, ease: 'elastic.out(1,.3)' })); }
  };
  return <div className="auth-shell"><div className="login card"><div className="stripe"/><h2>Kamga Cargo</h2><p>Connectez-vous pour ouvrir le facturier.</p>
    <form onSubmit={go}><input aria-label="Identifiant" placeholder="Identifiant" value={l} onChange={x => setL(x.target.value)} required/>
      <input aria-label="Mot de passe" type="password" placeholder="Mot de passe" value={p} onChange={x => setP(x.target.value)} required/>
      <button>Se connecter</button></form><p className="err" role="alert">{err}</p><small>Démo : admin/admin123 · caisse/caisse123 · agent/agent123</small></div><Footer/></div>;
}

function Panel({ children }) {
  const r = useRef();
  useEffect(() => { fx(g => g.from(r.current, { height: 0, opacity: 0, duration: .45, ease: 'power2.out', clearProps: 'all' })); }, []);
  return <div ref={r} className="panel">{children}</div>;
}

function Kpi({ v, l, unit = 'FCFA' }) {
  const r = useRef();
  useEffect(() => { const el = r.current; fx(g => { const o = { v: 0 }; g.to(o, { v, duration: 1.1, ease: 'power2.out', onUpdate: () => { el.textContent = fmt(Math.round(o.v)) + (unit ? ' ' + unit : ''); } }); }); }, [v, unit]);
  return <div className="card kpi rise"><b ref={r}>{fmt(v)}{unit ? ' ' + unit : ''}</b>{l}</div>;
}

function Toast({ m, done }) {
  const r = useRef();
  useEffect(() => {
    if (!m) return;
    if (!window.gsap || reduce()) { const t = setTimeout(done, 1800); return () => clearTimeout(t); }
    const tl = window.gsap.timeline({ onComplete: done });
    tl.fromTo(r.current, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: .35, ease: 'back.out(2)' }).to(r.current, { opacity: 0, y: 20, duration: .3, delay: 1.6 });
    return () => tl.kill();
  }, [m]);
  return m ? <div ref={r} className="toast" role="status">{m}</div> : null;
}

export default function App() {
  const [d, setD] = useState(load);
  const [user, setUser] = useState(loadSession);
  const [tab, setTab] = useState('colis'), [view, setView] = useState(null), [ticket, setTicket] = useState(false);
  const [q, setQ] = useState(''), [open, setOpen] = useState(false), [toast, setToast] = useState('');
  const [lastId, setLastId] = useState(null), [editId, setEditId] = useState(null), [activityFilter, setActivityFilter] = useState('');
  const [closureDate, setClosureDate] = useState(today()), [counted, setCounted] = useState('');
  const [selectedClient, setSelectedClient] = useState(null), [filters, setFilters] = useState({ from: '', to: '', receipt: '', status: '', client: '', mode: '', cashier: '' });
  const [trackingRef, setTrackingRef] = useState(() => decodeURIComponent((location.hash.match(/^#\/suivi\/(.+)$/) || [])[1] || ''));
  const [printer, setPrinter] = useState(null), [printerMessage, setPrinterMessage] = useState(''), [printerTest, setPrinterTest] = useState(true), [bytePreview, setBytePreview] = useState('');
  const [reportPeriod, setReportPeriod] = useState('jour'), [printClosureId, setPrintClosureId] = useState('');
  const mainRef = useRef();
  useEffect(() => { if (!d.loadError) save(d); }, [d]);
  useEffect(() => {
    const updateRoute = () => setTrackingRef(trackingFromHash());
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);
  const upd = f => setD(prev => { const next = structuredClone(prev); f(next); return next; });

  useEffect(() => { if (user && mainRef.current) fx(g => g.from(mainRef.current.querySelectorAll('.rise'), { y: 22, opacity: 0, duration: .5, stagger: .06, ease: 'power2.out', clearProps: 'all' })); }, [tab, user]);
  useEffect(() => { if (lastId) fx(g => g.fromTo('.fresh', { backgroundColor: '#fff3b0', x: -24, opacity: 0 }, { backgroundColor: '#ffffff', x: 0, opacity: 1, duration: .9, ease: 'power2.out', clearProps: 'x,opacity,backgroundColor' })); }, [lastId]);
  useEffect(() => { if (view) fx(g => { g.from('.modal', { opacity: 0, duration: .25 }); g.from('.sheet', { y: 60, scale: .95, opacity: 0, duration: .5, ease: 'power3.out', clearProps: 'all' }); }); }, [view]);
  useEffect(() => { const h = e => { const b = e.target.closest('button'); if (b) fx(g => g.fromTo(b, { scale: .93 }, { scale: 1, duration: .4, ease: 'back.out(3)', clearProps: 'transform' })); }; document.addEventListener('click', h); return () => document.removeEventListener('click', h); }, []);

  if (d.loadError) return <main className="storage-error" role="alert"><h1>Données locales protégées</h1><p>{d.loadError}</p>
    {d.loadErrorBackup && <button onClick={() => {
      const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([d.loadErrorBackup], { type: 'application/json' }));
      link.download = 'kamga-cargo-sauvegarde-locale.json'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }}>Télécharger la sauvegarde brute</button>}</main>;
  if (trackingRef) {
    const shipment = d.colis.find(c => c.ref === trackingRef);
    return <div className="tracking-page"><header>{d.settings.logo && <img className="company-logo" src={d.settings.logo} alt="Logo Kamga Cargo"/>}<h1>Suivi de colis — Kamga Cargo</h1></header>
      {shipment ? <section className="card"><h2>Référence {shipment.ref}</h2><p className="tracking-status">{shipment.statut}</p>
        {shipment.dateArrivee && <p>Arrivé le {dt(shipment.dateArrivee)}</p>}</section> : <p className="card">Aucun colis trouvé pour cette référence.</p>}
      <a href="#">Retour à l’application</a></div>;
  }
  if (!user) return <Login users={d.users} onLogin={u => {
    upd(n => addActivity(n, u, 'Connexion', 'Session ouverte'));
    saveSession(u); setUser(u); setTab(u.role === 'admin' ? 'dash' : 'colis');
  }}/>;
  const can = a => PERM[user.role].includes(a);
  const recus = d.docs.filter(x => x.type === 'recu' && !x.annule);
  const paye = c => recus.filter(x => x.colisId === c.id).reduce((s, x) => s + x.avance, 0);
  const frais = c => storageInfo(c, d.settings).fee;
  const remise = c => Number(c.remiseMagasinage || 0);
  const totalDu = c => Math.max(0, c.montant + frais(c) - remise(c));
  const reste = c => Math.max(0, totalDu(c) - paye(c));
  const pending = [...d.colis, ...d.docs].filter(x => !x.synced).length;
  const closeView = () => window.gsap && !reduce() ? window.gsap.to('.modal', { opacity: 0, duration: .2, onComplete: () => setView(null) }) : setView(null);
  const hasReceipt = c => d.docs.some(x => x.type === 'recu' && x.colisId === c.id);

  const addColis = f => {
    const id = editId || uid();
    upd(n => {
      let c = n.clients.find(x => x.tel === f.tel);
      if (!c) { c = { id: uid(), nom: f.nom, tel: f.tel }; n.clients.push(c); }
      const cbm = +f.cbm || 0, pu = +f.pu || n.settings.prixCbm, forfait = +f.forfait || 0;
      const values = { id, ref: f.ref, clientId: c.id, nom: c.nom, tel: c.tel, cartons: +f.cartons || 1, cbm, pu, forfait,
        montant: forfait || Math.round(cbm * pu), arrivee: f.arrivee, creeLe: editId ? n.colis.find(x => x.id === id)?.creeLe : today(),
        statut: editId ? (n.colis.find(x => x.id === id)?.statut || STAT[0]) : STAT[0], synced: false };
      if (editId) { Object.assign(n.colis.find(x => x.id === id), values); addActivity(n, user, 'Modification', 'Colis ' + f.ref); }
      else { n.colis.unshift(values); addActivity(n, user, 'Création', 'Colis ' + f.ref); }
    });
    setOpen(false); setEditId(null); setLastId(id); setToast((editId ? 'Colis ' : 'Colis ') + f.ref + (editId ? ' modifié' : ' enregistré'));
  };

  const makeDoc = (c, type) => {
    let avance = 0, modePaiement = '';
    if (type === 'recu') {
      const resteColis = reste(c);
      const value = window.prompt('Montant encaissé (FCFA) — reste à payer : ' + fmt(resteColis), String(resteColis));
      const a = Number.parseInt(value, 10);
      if (!value || !Number.isFinite(a) || a <= 0 || a > resteColis) { if (value !== null) alert('Montant invalide.'); return; }
      modePaiement = window.prompt('Mode de paiement : ' + PAYMENTS.join(', '), PAYMENTS[0]) || '';
      if (!PAYMENTS.includes(modePaiement)) { alert('Mode de paiement invalide.'); return; }
      if (d.closures.some(x => x.date === today() && x.caissierId === user.id)) { alert('Votre caisse est clôturée pour aujourd’hui : aucun reçu ne peut être créé.'); return; }
      avance = a;
    }
    const key = type === 'recu' ? 'nextRecu' : 'nextDevis', num = d.settings[key];
    const numero = type === 'recu' ? String(num).padStart(7, '0') : 'D-' + String(num).padStart(4, '0');
    const fee = frais(c), discount = remise(c);
    const doc = { id: uid(), type, numero, colisId: c.id, ref: c.ref, nom: c.nom, tel: c.tel, cartons: c.cartons, cbm: c.cbm, pu: c.pu,
      forfait: c.forfait, montant: c.montant, fraisMagasinage: fee, remiseMagasinage: discount, motifRemise: c.motifRemise || '',
      totalDu: c.montant + fee - discount, reste: Math.max(0, c.montant + fee - discount - paye(c) - avance),
      avance, modePaiement, arrivee: c.arrivee, date: today(), lieu: 'Dla', par: user.nom, parId: user.id, synced: false };
    upd(n => { n.settings[key] = num + 1; n.docs.unshift(doc); addActivity(n, user, 'Création', (type === 'recu' ? 'Reçu ' : 'Devis ') + numero); });
    setLastId(doc.id); setToast((type === 'recu' ? 'Reçu ' : 'Devis ') + numero + ' créé'); setView(doc);
  };

  const cancelDoc = doc => {
    if (doc.type === 'recu' && user.role !== 'admin') return;
    if (doc.type === 'devis' && !['admin', 'caissier'].includes(user.role)) return;
    if (!window.confirm('Confirmer l’annulation du document ' + doc.numero + ' ? Le numéro sera conservé.')) return;
    const reason = window.prompt('Motif obligatoire de l’annulation :');
    if (!reason || !reason.trim()) { alert('Le motif est obligatoire.'); return; }
    upd(n => {
      const target = n.docs.find(x => x.id === doc.id);
      target.annule = true; target.motifAnnulation = reason.trim(); target.annuleLe = new Date().toISOString(); target.annulePar = user.nom;
      addActivity(n, user, 'Annulation', (doc.type === 'recu' ? 'Reçu ' : 'Devis ') + doc.numero + ' — ' + reason.trim());
    });
    if (view?.id === doc.id) setView({ ...doc, annule: true, motifAnnulation: reason.trim() });
    setToast('Document ' + doc.numero + ' annulé');
  };

  const changeStatus = (c, status) => {
    let dateArrivee = c.dateArrivee;
    if (status === 'Arrivé' && c.statut !== 'Arrivé') {
      dateArrivee = window.prompt('Date réelle d’arrivée (AAAA-MM-JJ) :', today());
      if (!dateArrivee || !/^\d{4}-\d{2}-\d{2}$/.test(dateArrivee)) { alert('Date d’arrivée invalide.'); return; }
    }
    upd(n => { const x = n.colis.find(y => y.id === c.id); x.statut = status; x.dateArrivee = dateArrivee;
      x.dateRetrait = status === 'Retiré' && c.statut !== 'Retiré' ? today() : status !== 'Retiré' ? '' : x.dateRetrait; x.synced = false;
      addActivity(n, user, 'Modification', 'Statut du colis ' + c.ref + ' : ' + status); });
  };

  const whatsappLink = c => {
    let phone = String(c.tel || '').replace(/\D/g, '');
    if (phone.startsWith('0')) phone = phone.slice(1);
    if (!phone.startsWith('237')) phone = '237' + phone;
    const message = (d.settings.whatsappTemplate || '')
      .replaceAll('{nom}', c.nom).replaceAll('{ref}', c.ref)
      .replaceAll('{reste}', fmt(reste(c))).replaceAll('{jours}', String(d.settings.freeDays));
    return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message);
  };
  const grantDiscount = c => {
    const amount = Number(window.prompt('Montant de la remise de magasinage (FCFA) :', String(frais(c))));
    if (!Number.isFinite(amount) || amount <= 0 || amount > c.montant + frais(c) - paye(c)) { alert('Montant de remise invalide.'); return; }
    const reason = window.prompt('Motif obligatoire de la remise :');
    if (!reason || !reason.trim()) { alert('Le motif est obligatoire.'); return; }
    if (!window.confirm('Accorder une remise de ' + fmt(amount) + ' FCFA ?')) return;
    upd(n => { const x = n.colis.find(y => y.id === c.id); x.remiseMagasinage = amount; x.motifRemise = reason.trim();
      addActivity(n, user, 'Modification', 'Remise de magasinage — colis ' + c.ref + ' — ' + reason.trim()); });
  };

  const createClosure = ev => {
    ev.preventDefault();
    if (!window.confirm('Clôturer définitivement la caisse de ' + user.nom + ' pour le ' + dt(closureDate) + ' ?')) return;
    if (d.closures.some(x => x.date === closureDate && x.caissierId === user.id)) { alert('Cette journée est déjà clôturée.'); return; }
    const dayReceipts = d.docs.filter(x => x.type === 'recu' && !x.annule && x.date === closureDate && (x.parId ? x.parId === user.id : x.par === user.nom));
    const expected = dayReceipts.reduce((s, x) => s + x.avance, 0);
    const countedAmount = Number(counted);
    if (!Number.isFinite(countedAmount) || countedAmount < 0) { alert('Saisissez un montant compté valide.'); return; }
    const byMode = Object.fromEntries(PAYMENTS.map(mode => [mode, dayReceipts.filter(x => x.modePaiement === mode).reduce((s, x) => s + x.avance, 0)]));
    const closure = { id: uid(), date: closureDate, caissierId: user.id, caissier: user.nom, recus: dayReceipts.length, expected, counted: countedAmount, variance: countedAmount - expected, byMode };
    upd(n => { n.closures.unshift(closure); addActivity(n, user, 'Clôture', 'Caisse du ' + dt(closureDate) + ' — écart ' + fmt(closure.variance) + ' FCFA'); });
    setToast('Caisse clôturée'); setCounted('');
  };
  const logSettingChange = label => upd(n => addActivity(n, user, 'Modification', 'Paramètre : ' + label));
  const uploadLogo = ev => {
    const file = ev.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) {
      alert('Choisissez une image PNG, JPEG ou WebP de moins de 1 Mo.'); ev.target.value = ''; return;
    }
    if (!window.confirm('Remplacer le logo utilisé sur les documents ?')) { ev.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      upd(n => { n.settings.logo = String(reader.result); addActivity(n, user, 'Modification', 'Logo de la société'); });
      setToast('Logo enregistré');
    };
    reader.onerror = () => alert('Impossible de lire ce fichier image.');
    reader.readAsDataURL(file);
  };
  const connectBluetooth = async () => {
    try { const connection = await connectPrinter(); setPrinter(connection); setPrinterMessage('Imprimante connectée : ' + (connection.device.name || 'appareil BLE')); }
    catch (error) { setPrinterMessage(error.message + (bluetoothAvailable() ? '' : ' Repli : utilisez « Imprimer / Enregistrer en PDF ».')); }
  };
  const bluetoothPrint = async () => {
    try {
      const bytes = await printReceiptBluetooth(view, printer, printerTest);
      setBytePreview(bytesAsHex(bytes));
      setPrinterMessage(printerTest ? 'Mode test : octets ESC/POS préparés, aucun envoi à l’imprimante.' : 'Reçu envoyé à l’imprimante.');
    } catch (error) { setPrinterMessage(error.message + ' Repli : utilisez « Imprimer / Enregistrer en PDF ».'); }
  };

  const tabs = ['dash', 'colis', 'docs', 'clients', 'caisse', 'reports', 'journal', 'users'].filter(k => k === 'docs' || can(k));
  const list = d.colis.filter(c => (c.ref + c.nom + c.tel).toLowerCase().includes(q.toLowerCase())
    && (!filters.from || (c.creeLe || c.arrivee || '') >= filters.from)
    && (!filters.to || (c.creeLe || c.arrivee || '') <= filters.to)
    && (!filters.status || c.statut === filters.status)
    && (!filters.client || c.nom.toLowerCase().includes(filters.client.toLowerCase())));
  const filteredDocs = d.docs.filter(x => can(x.type)
    && (!filters.from || x.date >= filters.from) && (!filters.to || x.date <= filters.to)
    && (!filters.receipt || x.numero.toLowerCase().includes(filters.receipt.toLowerCase()))
    && (!filters.client || x.nom.toLowerCase().includes(filters.client.toLowerCase()))
    && (!filters.mode || x.modePaiement === filters.mode)
    && (!filters.cashier || (x.par || '').toLowerCase().includes(filters.cashier.toLowerCase()))
    && (!filters.status || (filters.status === 'Annulé' ? x.annule : filters.status === 'Valide' ? !x.annule : true)));
  const reportNow = new Date(today() + 'T00:00:00');
  let reportStart = new Date(reportNow), reportEnd = new Date(reportNow);
  if (reportPeriod === 'semaine') {
    reportStart.setDate(reportNow.getDate() - ((reportNow.getDay() + 6) % 7));
    reportEnd.setDate(reportStart.getDate() + 6);
  } else if (reportPeriod === 'mois') {
    reportStart.setDate(1); reportEnd = new Date(reportNow.getFullYear(), reportNow.getMonth() + 1, 0);
  }
  const dateKey = date => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  const reportReceipts = recus.filter(x => x.date >= dateKey(reportStart) && x.date <= dateKey(reportEnd));
  const reportTotal = reportReceipts.reduce((s, x) => s + x.avance, 0);
  const reportBuckets = Array.from({ length: Math.max(1, Math.round((reportEnd - reportStart) / 86400000) + 1) }, (_, index) => {
    const date = new Date(reportStart); date.setDate(date.getDate() + index);
    const key = dateKey(date);
    return { date: key, label: date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }), amount: reportReceipts.filter(x => x.date === key).reduce((s, x) => s + x.avance, 0) };
  });
  const exportData = kind => {
    const rows = kind === 'colis' ? d.colis.map(c => ({ reference: c.ref, client: c.nom, telephone: c.tel, cartons: c.cartons, cbm: c.cbm, montant: c.montant, statut: c.statut, date_creation: c.creeLe || '', date_arrivee: c.dateArrivee || '' }))
      : kind === 'recus' ? d.docs.filter(x => x.type === 'recu').map(x => ({ numero: x.numero, date: x.date, client: x.nom, reference: x.ref, montant: x.avance, paiement: x.modePaiement || '', caissier: x.par, statut: x.annule ? 'Annulé' : 'Valide', motif_annulation: x.motifAnnulation || '' }))
        : kind === 'clotures' ? d.closures.map(x => ({ date: x.date, caissier: x.caissier, recus: x.recus, attendu: x.expected, compte: x.counted, ecart: x.variance, ...x.byMode }))
          : d.activity.map(x => ({ date_heure: x.date, utilisateur: x.utilisateur, action: x.action, element: x.element }));
    exportCsv('kamga-cargo-' + kind + '-' + today() + '.csv', rows);
  };
  const jour = recus.filter(x => x.date === today()).reduce((s, x) => s + x.avance, 0);
  const total = recus.reduce((s, x) => s + x.avance, 0);
  const creances = d.colis.reduce((s, c) => s + reste(c), 0);

  return <div className="shell">
    <aside className="side"><div className="brand">{d.settings.logo ? <img className="brand-logo" src={d.settings.logo} alt="Logo Kamga Cargo"/> : <i>KC</i>} Kamga Cargo</div>
      {tabs.map(k => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><span>{ICON[k]}</span>{TITLES[k]}</button>)}
    </aside>
    <div className="content"><div className="top">{d.settings.logo && <img className="header-logo" src={d.settings.logo} alt="Logo Kamga Cargo"/>}<h1>{TITLES[tab]}</h1><span className="chip">{user.nom} · {user.role}</span>
      <button className="sec" onClick={async () => { const r = await syncAll(d); alert(r.msg + '\n' + pending + ' élément(s) en attente.'); }}>Synchro ({pending})</button>
      <button className="sec" onClick={() => { clearSession(); setUser(null); }}>Quitter</button></div>
      <main ref={mainRef}>
        {tab === 'dash' && can('dash') && <div className="kpis"><Kpi v={jour} l="Encaissé aujourd'hui"/><Kpi v={total} l="Total encaissé"/>
          <Kpi v={creances} l="Créances non soldées"/><Kpi v={d.colis.length} unit="" l="Colis enregistrés"/></div>}

        {tab === 'colis' && <>
          <div className="tools rise"><input aria-label="Rechercher un colis" placeholder="Rechercher (référence, nom, téléphone)" value={q} onChange={e => setQ(e.target.value)}/>
            {can('colis') && <button onClick={() => { setOpen(o => !o); setEditId(null); setSelectedClient(null); }}>{open ? 'Fermer' : '+ Nouveau colis'}</button>}</div>
          <div className="filters rise"><label>Du<input aria-label="Date de début des colis" type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })}/></label>
            <label>Au<input aria-label="Date de fin des colis" type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })}/></label>
            <label>Statut<select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="">Tous</option>{STAT.map(s => <option key={s}>{s}</option>)}</select></label>
            <label>Client<input placeholder="Nom du client" value={filters.client} onChange={e => setFilters({ ...filters, client: e.target.value })}/></label></div>
          {open && <Panel><form className="card grid" key={editId || 'new'} onSubmit={ev => { ev.preventDefault(); addColis(Object.fromEntries(new FormData(ev.target))); }}>
            <input name="ref" placeholder="Référence (ex. K16)" required defaultValue={d.colis.find(x => x.id === editId)?.ref || ''}/>
            <input name="nom" placeholder="Nom du client" required defaultValue={d.colis.find(x => x.id === editId)?.nom || selectedClient?.nom || ''}/>
            <input name="tel" placeholder="Téléphone" required defaultValue={d.colis.find(x => x.id === editId)?.tel || selectedClient?.tel || ''}/>
            <input name="cartons" type="number" min="1" placeholder="Cartons" defaultValue={d.colis.find(x => x.id === editId)?.cartons || ''}/>
            <input name="cbm" type="number" step="0.01" min="0" placeholder="CBM" required defaultValue={d.colis.find(x => x.id === editId)?.cbm || ''}/>
            <input name="pu" type="number" placeholder={'Prix du CBM (' + fmt(d.settings.prixCbm) + ')'} defaultValue={d.colis.find(x => x.id === editId)?.pu || ''}/>
            <input name="forfait" type="number" placeholder="Forfait (optionnel)" defaultValue={d.colis.find(x => x.id === editId)?.forfait || ''}/>
            <input name="arrivee" type="date" aria-label="Arrivée probable" defaultValue={d.colis.find(x => x.id === editId)?.arrivee || ''}/>
            <button>{editId ? 'Enregistrer les modifications' : 'Enregistrer le colis'}</button>
          </form></Panel>}
          {list.length === 0 && <p className="empty rise">Aucun colis. Utilisez « Nouveau colis » pour enregistrer le premier.</p>}
          {list.map(c => <div className={'card colis rise' + (c.id === lastId ? ' fresh' : '')} key={c.id}>
            <div><b>{c.ref}</b> · {c.nom} · {c.tel}<br/>{c.cartons} carton(s) · {c.cbm} CBM · <b>{fmt(c.montant)} FCFA</b>
              {frais(c) > 0 && <> · magasinage {fmt(frais(c))} FCFA</>} · reste {fmt(reste(c))} FCFA<br/>
              <small>{c.statut}{c.dateArrivee ? ' · arrivé le ' + dt(c.dateArrivee) : ''}{frais(c) > 0 ? ' · ' + storageInfo(c, d.settings).days + ' jour(s) de stockage' : ''}</small></div>
            <div className="acts"><select aria-label={'Statut ' + c.ref} value={c.statut} disabled={!can('colis')} onChange={e => changeStatus(c, e.target.value)}>{STAT.map(s => <option key={s}>{s}</option>)}</select>
              {can('colis') && !hasReceipt(c) && <button className="sec" onClick={() => { setEditId(c.id); setOpen(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Modifier</button>}
              {user.role === 'admin' && c.statut === 'Arrivé' && frais(c) > 0 && <button className="sec" onClick={() => grantDiscount(c)}>Accorder une remise</button>}
              {can('recu') && c.statut === 'Arrivé' && <a className="button-link" href={whatsappLink(c)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
              {can('devis') && <button className="sec" onClick={() => makeDoc(c, 'devis')}>Créer un devis</button>}
              {can('recu') && reste(c) > 0 && <button onClick={() => makeDoc(c, 'recu')}>Encaisser (reçu)</button>}
            </div></div>)}
        </>}

        {tab === 'docs' && <>
          <div className="filters rise"><label>Du<input type="date" aria-label="Date de début des documents" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })}/></label>
            <label>Au<input type="date" aria-label="Date de fin des documents" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })}/></label>
            <label>N° reçu / devis<input placeholder="Numéro" value={filters.receipt} onChange={e => setFilters({ ...filters, receipt: e.target.value })}/></label>
            <label>Client<input placeholder="Nom" value={filters.client} onChange={e => setFilters({ ...filters, client: e.target.value })}/></label>
            <label>Statut<select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="">Tous</option><option>Valide</option><option>Annulé</option></select></label>
            <label>Mode de paiement<select value={filters.mode} onChange={e => setFilters({ ...filters, mode: e.target.value })}><option value="">Tous</option>{PAYMENTS.map(m => <option key={m}>{m}</option>)}</select></label>
            <label>Caissier<input placeholder="Nom du caissier" value={filters.cashier} onChange={e => setFilters({ ...filters, cashier: e.target.value })}/></label></div>
          {d.docs.length === 0 && <p className="empty rise">Aucun document. Créez un devis ou un reçu depuis un colis.</p>}
          {filteredDocs.map(x => <div className={'card colis rise' + (x.id === lastId ? ' fresh' : '')} key={x.id}>
            <div><b>{x.type === 'recu' ? 'Reçu' : 'Devis'} {x.numero}</b> · {x.nom} · {dt(x.date)}{x.annule ? <strong className="err"> · ANNULÉ</strong> : ''}<br/>
              {x.ref} · {x.type === 'recu' ? 'payé ' + fmt(x.avance) + ' FCFA · ' + (x.modePaiement || '—') : 'total ' + fmt(x.montant) + ' FCFA'} · caissier : {x.par} {x.synced ? '' : '· en attente de synchro'}</div>
            <div className="acts"><button className="sec" onClick={() => setView(x)}>Voir / imprimer</button>
              {!x.annule && ((x.type === 'recu' && user.role === 'admin') || (x.type === 'devis' && ['admin', 'caissier'].includes(user.role))) &&
                <button className="danger" onClick={() => cancelDoc(x)}>Annuler</button>}</div></div>)}
        </>}

        {tab === 'caisse' && can('caisse') && <>
          <form className="card grid rise" onSubmit={createClosure}><label>Date à clôturer<input type="date" value={closureDate} onChange={e => setClosureDate(e.target.value)} required/></label>
            <label>Montant compté (FCFA)<input type="number" min="0" value={counted} onChange={e => setCounted(e.target.value)} required/></label><button>Clôturer ma caisse</button></form>
          {d.closures.filter(x => user.role === 'admin' || x.caissierId === user.id).map(x => <div className={'card rise' + (printClosureId === x.id ? ' print-closure' : '')} key={x.id}>
            <h3>Caisse du {dt(x.date)} · {x.caissier}</h3><p>{x.recus} reçu(s) · attendu {fmt(x.expected)} FCFA · compté {fmt(x.counted)} FCFA · écart <b>{fmt(x.variance)} FCFA</b></p>
            <div className="payment-totals">{PAYMENTS.map(m => <span key={m}>{m} : {fmt(x.byMode?.[m] || 0)} FCFA</span>)}</div>
            <button className="sec no-print" onClick={() => { setPrintClosureId(x.id); setTimeout(() => window.print(), 50); }}>Imprimer la fiche</button></div>)}
        </>}

        {tab === 'clients' && can('clients') && <>
          <div className="tools rise"><input placeholder="Rechercher un client (nom ou téléphone)" aria-label="Rechercher un client" value={q} onChange={e => setQ(e.target.value)}/>
            {selectedClient && <button className="sec" onClick={() => setSelectedClient(null)}>Retour à la liste</button>}</div>
          {!selectedClient && d.clients.filter(c => (c.nom + c.tel).toLowerCase().includes(q.toLowerCase())).map(c => {
            const parcels = d.colis.filter(x => x.clientId === c.id || x.tel === c.tel);
            return <button key={c.id} className="card client-row rise" onClick={() => setSelectedClient(c)}><b>{c.nom}</b> · {c.tel} · {parcels.length} colis · dû {fmt(parcels.reduce((s, x) => s + reste(x), 0))} FCFA</button>;
          })}
          {selectedClient && <section className="card rise"><h2>{selectedClient.nom}</h2><p>{selectedClient.tel}</p>
            {can('colis') && <button onClick={() => { setTab('colis'); setEditId(null); setOpen(true); }}>Nouveau colis</button>}
            <h3>Colis et paiements</h3>
            {d.colis.filter(x => x.clientId === selectedClient.id || x.tel === selectedClient.tel).map(c => <div className="history-item" key={c.id}>
              <b>{c.ref}</b> · {c.statut} · reste {fmt(reste(c))} FCFA
              {d.docs.filter(x => x.type === 'recu' && x.colisId === c.id).map(x => <p key={x.id}>{dt(x.date)} · reçu {x.numero} · {fmt(x.avance)} FCFA · {x.modePaiement}{x.annule ? ' · ANNULÉ' : ''}</p>)}
            </div>)}
            <strong>Total dû : {fmt(d.colis.filter(x => x.clientId === selectedClient.id || x.tel === selectedClient.tel).reduce((s, x) => s + reste(x), 0))} FCFA</strong>
          </section>}
          {!selectedClient && d.clients.length === 0 && <p className="empty rise">Aucun client enregistré.</p>}
        </>}

        {tab === 'reports' && can('reports') && <section className="report-area rise">
          <div className="tools no-print"><label>Période<select value={reportPeriod} onChange={e => setReportPeriod(e.target.value)}>
            <option value="jour">Aujourd’hui</option><option value="semaine">Cette semaine</option><option value="mois">Ce mois</option></select></label>
            <button className="sec" onClick={() => window.print()}>Imprimer le rapport</button></div>
          <h2>Encaissements — {dt(dateKey(reportStart))}{reportPeriod !== 'jour' ? ' au ' + dt(dateKey(reportEnd)) : ''}</h2>
          <p>{reportReceipts.length} reçu(s) valide(s) · <b>{fmt(reportTotal)} FCFA</b></p>
          <div className="chart" role="img" aria-label="Graphique des encaissements par jour">
            {reportBuckets.map(b => <div className="chart-col" key={b.date} title={b.date + ' : ' + fmt(b.amount) + ' FCFA'}>
              <span>{b.amount ? fmt(b.amount) : ''}</span><div style={{ height: Math.max(2, Math.round(b.amount / Math.max(1, ...reportBuckets.map(x => x.amount)) * 150)) + 'px' }}/><small>{b.label}</small></div>)}
          </div>
          <h3>Exports CSV (Excel, séparateur point-virgule)</h3>
          <div className="acts no-print"><button onClick={() => exportData('colis')}>Exporter les colis</button>
            <button onClick={() => exportData('recus')}>Exporter les reçus</button>
            <button onClick={() => exportData('clotures')}>Exporter les clôtures</button>
            <button onClick={() => exportData('journal')}>Exporter le journal</button></div>
        </section>}

        {tab === 'journal' && can('journal') && <>
          <div className="tools rise"><input type="search" placeholder="Filtrer par utilisateur, action ou élément" value={activityFilter} onChange={e => setActivityFilter(e.target.value)}/></div>
          {d.activity.filter(x => (x.utilisateur + x.action + x.element).toLowerCase().includes(activityFilter.toLowerCase())).map(x =>
            <div className="card rise" key={x.id}><b>{new Date(x.date).toLocaleString('fr-FR')}</b> · {x.utilisateur}<br/>{x.action} — {x.element}</div>)}
        </>}

        {tab === 'users' && can('users') && <>
          <form className="card grid rise" onSubmit={ev => { ev.preventDefault(); const f = Object.fromEntries(new FormData(ev.target));
            upd(n => { n.users.push({ id: uid(), ...f }); addActivity(n, user, 'Création', 'Utilisateur ' + f.login); }); ev.target.reset(); setToast('Utilisateur ajouté'); }}>
            <input name="nom" placeholder="Nom" required/><input name="login" placeholder="Identifiant" required/><input name="pass" placeholder="Mot de passe" required/>
            <select name="role" aria-label="Rôle"><option value="caissier">caissier</option><option value="agent">agent</option><option value="admin">admin</option></select><button>Ajouter l'utilisateur</button></form>
          {d.users.map(u => <div className="card colis rise" key={u.id}><div><b>{u.nom}</b> · {u.login} · {u.role}</div><div className="acts">
            {u.id !== user.id && <button className="sec" onClick={() => { if (window.confirm('Supprimer cet utilisateur ?')) upd(n => { n.users = n.users.filter(x => x.id !== u.id); addActivity(n, user, 'Suppression', 'Utilisateur ' + u.login); }); }}>Supprimer</button>}</div></div>)}
          <label className="card rise">Prix du CBM par défaut (FCFA)<input type="number" value={d.settings.prixCbm} onChange={e => upd(n => { n.settings.prixCbm = +e.target.value || 0; })} onBlur={() => logSettingChange('prix du CBM')}/></label>
          <label className="card rise">Jours gratuits de magasinage<input type="number" min="0" value={d.settings.freeDays} onChange={e => upd(n => { n.settings.freeDays = +e.target.value || 0; })} onBlur={() => logSettingChange('jours gratuits de magasinage')}/></label>
          <label className="card rise">Tarif par jour supplémentaire (FCFA)<input type="number" min="0" value={d.settings.storageRate} onChange={e => upd(n => { n.settings.storageRate = +e.target.value || 0; })} onBlur={() => logSettingChange('tarif de magasinage')}/></label>
          <label className="card rise">Modèle de message WhatsApp
            <textarea rows="4" value={d.settings.whatsappTemplate} onChange={e => upd(n => { n.settings.whatsappTemplate = e.target.value; })} onBlur={() => logSettingChange('modèle WhatsApp')}/>
            <small>Variables : {'{nom}'}, {'{ref}'}, {'{reste}'}, {'{jours}'}</small></label>
          <label className="card rise">Logo (PNG, JPEG ou WebP, 1 Mo maximum)
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadLogo}/>
            {d.settings.logo && <img className="settings-logo" src={d.settings.logo} alt="Aperçu du logo"/>}</label>
        </>}
      </main><Footer/>
    </div>
    <Toast m={toast} done={() => setToast('')}/>
    {view && <div className="modal"><div className="bar no-print">
      <select aria-label="Format d’impression" value={ticket ? 't' : 's'} onChange={e => setTicket(e.target.value === 't')}><option value="s">Format standard</option><option value="t">Ticket 58 mm</option></select>
      <button onClick={() => printDoc(view, ticket)}>Imprimer / Enregistrer en PDF</button>
      {view.type === 'recu' && <>
        <button className="sec" onClick={connectBluetooth}>Connecter l’imprimante</button>
        <label className="test-toggle"><input type="checkbox" checked={printerTest} onChange={e => setPrinterTest(e.target.checked)}/> Mode test (afficher les octets)</label>
        <button onClick={bluetoothPrint}>Imprimer sur l’imprimante</button>
        {printerMessage && <span role="status">{printerMessage}</span>}
        {bytePreview && <details className="byte-preview"><summary>Octets ESC/POS préparés</summary><code>{bytePreview}</code></details>}
      </>}
      {!view.annule && view.type === 'recu' && user.role === 'admin' && <button className="danger" onClick={() => cancelDoc(view)}>Annuler le reçu</button>}
      <button className="sec" onClick={closeView}>Fermer</button></div>
      {view.type === 'recu' ? <Recu d={view} t={ticket} logo={d.settings.logo} qrUrl={trackingUrl(view.ref)}/> :
        <Devis d={view} t={ticket} logo={d.settings.logo} qrUrl={trackingUrl(view.ref)}/>}</div>}
  </div>;
}
