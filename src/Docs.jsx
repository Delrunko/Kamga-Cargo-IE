import {C} from './company.js';
import {words} from './words.js';
import {qrDataUrl} from './qr.js';
export const fmt=n=>Number(n||0).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g,' ');
export const dt=s=>{
  if(/^\d{4}-\d{2}-\d{2}$/.test(s||'')){
    const [y,m,d]=s.split('-').map(Number);
    return new Date(y,m-1,d).toLocaleDateString('fr-FR');
  }
  return new Date(s).toLocaleDateString('fr-FR');
};
const Row=({l,v})=><div className="row"><b>{l}</b><span>{v}</span></div>;
const Pair=({children})=><div className="row-pair">{children}</div>;

// Reçu : même disposition des lignes que la facture-reçu manuscrite (image 2)
export function Recu({d,t,logo,qrUrl}){
  const reste=d.reste ?? (d.totalDu ?? d.montant)-d.avance;
  const qr=qrUrl?qrDataUrl(qrUrl):'';
  return <div className={'sheet recu'+(t?' ticket':'')}>
    {d.annule&&<div className="watermark">ANNULÉ</div>}
    <div className="rh">
      <div className="logo">{logo?<img className="company-logo" src={logo} alt="Logo Kamga Cargo"/>:'KC'}<small>On Grandit Ensemble</small></div>
      <div className="rc"><h2>{C.nom}</h2><p><b>Transports de colis Import-Export</b></p>
        <p>N°Cont : {C.cont} RCCM : {C.rccm}</p><p>{C.adresse}</p><p>Tél : {C.tels}</p></div>
      <div className="bpf">BPF<br/><b>{fmt(d.avance)} Frs</b></div>
    </div>
    <div className="titre"><h3>FACTURE</h3><b className="no">N° {d.numero}</b></div>
    <Row l="Reçu de M." v={d.nom}/>
    <Row l="La somme de" v={words(d.avance)+' francs'}/>
    <Row l="Motif(s)" v={'Paiement du '+d.ref}/>
    <Pair>
      <Row l="Nombre de colis" v={String(d.cartons).padStart(2,'0')+' carton(s)'}/>
      <Row l="Nombre de CBM" v={d.cbm}/>
    </Pair>
    <Row l="Numéro du client" v={d.tel}/>
    {d.fraisMagasinage>0&&<Row l="Frais de magasinage" v={fmt(d.fraisMagasinage)+' FCFA'}/>}
    {d.remiseMagasinage>0&&<Row l="Remise accordée" v={'−'+fmt(d.remiseMagasinage)+' FCFA'+(d.motifRemise?' ('+d.motifRemise+')':'')}/>}
    <Pair>
      <Row l="Total dû" v={fmt(d.totalDu ?? d.montant)+' FCFA'}/>
      <Row l="Mode de paiement" v={d.modePaiement||'—'}/>
    </Pair>
    <Pair>
      <Row l="Avance" v={fmt(d.avance)+' FCFA'}/>
      <Row l="Reste" v={fmt(reste)+' FCFA'}/>
    </Pair>
    {d.motifAnnulation&&<Row l="Motif d’annulation" v={d.motifAnnulation}/>}
    <p className="fait"><span>Fait à : {d.lieu}</span><span>Le : {dt(d.date)}</span></p>
    <div className="sign"><span>Signature Client</span><span>Signature Responsable</span></div>
    {qr&&<div className="doc-qr"><img src={qr} alt={'QR code de suivi du colis '+d.ref}/><small>Suivi local : {d.ref}</small></div>}
  </div>;
}

// Devis : même disposition que la proforma / packing list (image 1)
export function Devis({d,t,logo,qrUrl}){
  const cbmMontant=d.forfait?0:Math.round(d.cbm*d.pu);
  const qr=qrUrl?qrDataUrl(qrUrl):'';
  return <div className={'sheet devis'+(t?' ticket':'')}>
    {d.annule&&<div className="watermark">ANNULÉ</div>}
    <div className="banner">{logo&&<img className="company-logo" src={logo} alt="Logo Kamga Cargo"/>}<div><h2>KAMGA CARGO CHINE</h2><p>MARITIME</p></div></div>
    <div className="dh">
      <div className="dh-main"><h3>GUANGZHOU</h3>
        <p>DATE PROBABLE D'ARRIVÉE<br/>DATE OF ARRIVAL</p>
        <p>DATE : <b>{d.arrivee?dt(d.arrivee):'—'}</b></p></div>
      <div className="ref">PACKING LIST / PROFORMA<br/><b>REF : {d.ref}</b><br/>N° {d.numero} · {dt(d.date)}</div>
    </div>
    <div className="dc">
      <p className="addr">📍 Bureau situé à Douala sis précisément à AKWA Glacier moderne, après AXA, en face du centre linguistique américain.</p>
      <div className="contacts"><p>📞 Mr. KAMGA : {C.kamga}</p><p>Mr. Gabin : {C.gabin}</p><p>Bureau : {C.bureau}</p></div>
    </div>
    <h4>BON À SAVOIR :</h4>
    <ul className="clause">{C.clause.map((c,i)=><li key={i}>{c}</li>)}</ul>
    <p><b>NOM : {d.nom}</b></p><p><b>TÉLÉPHONE : {d.tel}</b></p><p><b>NOMBRE DE CARTONS : {d.cartons}</b></p>
    <table className="tarif"><thead><tr><th></th><th>NATURE</th><th>QUANTITÉ</th><th>PRIX UNITAIRE</th><th>MONTANT</th></tr></thead>
      <tbody>
        <tr><th>CBM</th><td>{d.cartons} CARTON{d.cartons>1?'S':''}</td><td>{d.cbm}</td><td>{fmt(d.pu)}</td><td>{d.forfait?'':fmt(cbmMontant)}</td></tr>
        <tr><th>FORFAIT</th><td></td><td></td><td></td><td>{d.forfait?fmt(d.forfait):''}</td></tr>
        <tr><th>Montant de la Douane/Transport</th><td></td><td></td><td></td><td><b>{fmt(d.montant)}</b></td></tr>
      </tbody></table>
    <p className="arret">La présente facture a été arrêtée à la somme de : {fmt(d.montant)} FCFA ({words(d.montant)} francs CFA)</p>
    {d.motifAnnulation&&<p><b>Motif d’annulation :</b> {d.motifAnnulation}</p>}
    <p className="nb"><b>NB :</b> {C.nb}</p>
    <p className="devise"><i>Ensemble, nous irons plus loin !!!</i></p>
    <p className="chine">Numéro Chine : {C.chine}</p>
    {qr&&<div className="doc-qr"><img src={qr} alt={'QR code de suivi du colis '+d.ref}/><small>Suivi local : {d.ref}</small></div>}
  </div>;
}

export function printDoc(d,t){
  const size=t?'58mm auto':(d.type==='recu'?'A5 landscape':'A4');
  const s=document.createElement('style');
  s.textContent='@page{size:'+size+';margin:8mm}';
  document.head.append(s);window.print();setTimeout(()=>s.remove(),500);
}