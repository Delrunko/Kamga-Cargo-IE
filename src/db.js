// Couche locale isolée, prête à devenir asynchrone lors du branchement Supabase.
const KEY = 'kc_db_local';
const LEGACY_KEYS = ['kc_db_v1'];
const SESSION_KEY = 'kc_user';
export const SCHEMA_VERSION = 2;

const seed = () => ({
  schemaVersion: SCHEMA_VERSION,
  users: [
    { id: 'u1', login: 'admin', pass: 'admin123', nom: 'Administrateur', role: 'admin' },
    { id: 'u2', login: 'caisse', pass: 'caisse123', nom: 'Caissier', role: 'caissier' },
    { id: 'u3', login: 'agent', pass: 'agent123', nom: 'Agent', role: 'agent' }
  ],
  clients: [], colis: [], docs: [], activity: [], closures: [],
  settings: {
    prixCbm: 300000, nextRecu: 2167, nextDevis: 1, freeDays: 3, storageRate: 0,
    whatsappTemplate: 'Bonjour {nom}, votre colis {ref} est arrivé. Merci de le retirer sous {jours} jours. Reste à payer : {reste} FCFA.'
  }
});

function migrate(raw) {
  const base = seed();
  const data = raw && typeof raw === 'object' ? raw : {};
  if (Number(data.schemaVersion || 1) > SCHEMA_VERSION) throw new Error('Version de données locale plus récente que l’application.');
  return {
    ...base,
    ...data,
    schemaVersion: SCHEMA_VERSION,
    users: Array.isArray(data.users) ? data.users : base.users,
    clients: Array.isArray(data.clients) ? data.clients : [],
    colis: Array.isArray(data.colis) ? data.colis : [],
    docs: Array.isArray(data.docs) ? data.docs.map(d => ({ ...d, annule: !!d.annule })) : [],
    activity: Array.isArray(data.activity) ? data.activity : [],
    closures: Array.isArray(data.closures) ? data.closures : [],
    settings: { ...base.settings, ...(data.settings || {}) }
  };
}

export const load = () => {
  let raw;
  try {
    raw = localStorage.getItem(KEY);
    if (!raw) raw = LEGACY_KEYS.map(k => localStorage.getItem(k)).find(Boolean);
  } catch (error) {
    console.error('Accès aux données locales impossible.', error);
    return { ...seed(), loadError: 'Le stockage local est inaccessible. Aucune modification ne sera enregistrée.' };
  }
  try {
    const data = migrate(raw ? JSON.parse(raw) : seed());
    if (raw) localStorage.setItem(KEY, JSON.stringify(data));
    return data;
  } catch (error) {
    console.error('Impossible de lire ou migrer les données locales.', error);
    try { if (raw) localStorage.setItem(KEY + '_backup', raw); } catch (backupError) { console.error('Copie de secours locale impossible.', backupError); }
    return { ...seed(), loadError: 'Les données locales sont illisibles. L’application est en lecture seule pour protéger les données.', loadErrorBackup: raw || '' };
  }
};

export const save = data => localStorage.setItem(KEY, JSON.stringify(migrate(data)));
export const loadSession = () => {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); }
  catch (error) { console.error('Session locale illisible.', error); return null; }
};
export const saveSession = user => localStorage.setItem(SESSION_KEY, JSON.stringify(user));
export const clearSession = () => localStorage.removeItem(SESSION_KEY);
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
export const addActivity = (data, user, action, item) => {
  data.activity.unshift({
    id: uid(), date: new Date().toISOString(), utilisateur: user?.nom || 'Système',
    action, element: item
  });
};
// TODO Supabase : envoyer les lignes avec synced:false puis les marquer synced:true.
export async function syncAll() { return { ok: false, msg: 'Connexion Supabase à brancher.' }; }
