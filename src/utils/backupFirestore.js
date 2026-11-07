import {
  Bytes, DocumentReference, GeoPoint, Timestamp,
  collection, doc, getDoc, getDocs, query, where
} from 'firebase/firestore';

// Respaldo de lo que puede leer una sesión autenticada. No usa privilegios administrativos.
const ROOT_COLLECTIONS = ['exercises', 'routines', 'trainerNotifications', 'communityFeed'];
const CLIENT_SUBCOLLECTIONS = ['sessions', 'messages', 'payments'];

function serializeValue(value) {
  if (value instanceof Timestamp) {
    return { __firestoreType: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (value instanceof GeoPoint) {
    return { __firestoreType: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  }
  if (value instanceof Bytes) {
    return { __firestoreType: 'bytes', base64: value.toBase64() };
  }
  if (value instanceof DocumentReference) {
    return { __firestoreType: 'reference', path: value.path };
  }
  if (value instanceof Date) {
    return { __firestoreType: 'date', iso: value.toISOString() };
  }
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, serializeValue(val)]));
  }
  return value;
}

function documentRecord(snapshot) {
  return { path: snapshot.ref.path, data: serializeValue(snapshot.data()) };
}

export async function exportRagnarData(db, user, onProgress = () => {}) {
  if (!user?.uid) throw new Error('Iniciá sesión como entrenador antes de hacer el respaldo.');

  const report = (label) => onProgress(label);
  const warnings = [];
  const errors = [];
  const records = [];
  const counts = {};
  const seen = new Set();

  const include = (snap) => {
    if (seen.has(snap.ref.path)) return;
    seen.add(snap.ref.path);
    records.push(documentRecord(snap));
    const key = snap.ref.path.split('/').filter((_, index) => index % 2 === 0).join('/');
    counts[key] = (counts[key] || 0) + 1;
  };

  // Condición de acceso: el usuario debe tener clientes explícitamente asignados.
  // La consulta respeta en todo momento las Firestore Security Rules del origen.
  report('Verificando alumnos del entrenador...');
  const mine = await getDocs(query(collection(db, 'clients'), where('trainerId', '==', user.uid)));
  if (mine.empty) {
    throw new Error('Esta cuenta no tiene alumnos asignados como entrenador. No se habilita la exportación.');
  }

  mine.forEach(include);
  const clientIds = new Set(mine.docs.map((snapshot) => snapshot.id));
  report('Encontrados ' + clientIds.size + ' alumnos. Leyendo historiales...');

  for (let i = 0; i < mine.docs.length; i += 1) {
    const client = mine.docs[i];
    for (const name of CLIENT_SUBCOLLECTIONS) {
      const path = 'clients/' + client.id + '/' + name;
      try {
        const snap = await getDocs(collection(db, path));
        snap.forEach(include);
      } catch (error) {
        errors.push({ path, reason: error.code || error.message || 'Error de lectura' });
      }
    }
    // Bitácora creada en la rama de mejoras; puede no existir en la instalación original.
    try {
      const snap = await getDocs(collection(db, 'clients', client.id, 'trainingLogs'));
      snap.forEach(include);
    } catch (error) {
      warnings.push('No se pudo leer la bitácora opcional de ' + client.id + ': ' + (error.code || error.message));
    }
    report('Historiales: ' + (i + 1) + '/' + mine.docs.length + ' alumnos');
  }

  for (const name of ROOT_COLLECTIONS) {
    report('Leyendo colección ' + name + '...');
    try {
      const snap = await getDocs(collection(db, name));
      snap.forEach((item) => {
        const data = item.data();
        // Notificaciones y publicaciones se limitan a los atletas de este entrenador.
        if (name === 'trainerNotifications' && data.clientId && !clientIds.has(data.clientId)) return;
        if (name === 'communityFeed' && data.userId && !clientIds.has(data.userId)) return;
        include(item);
      });
    } catch (error) {
      errors.push({ path: name, reason: error.code || error.message || 'Error de lectura' });
    }
  }

  report('Leyendo configuración...');
  try {
    const general = await getDoc(doc(db, 'settings', 'general'));
    if (general.exists()) include(general);
  } catch (error) {
    errors.push({ path: 'settings/general', reason: error.code || error.message || 'Error de lectura' });
  }

  // La aplicación web no puede descubrir arbitrariamente colecciones desconocidas.
  warnings.push('El respaldo recorre las colecciones conocidas por Ragnar; no certifica colecciones desconocidas.');
  warnings.push('No incluye usuarios ni contraseñas de Firebase Authentication, archivos de Storage, reglas ni claves.');
  if (errors.length) warnings.push('Hubo lecturas denegadas o fallidas: el respaldo es PARCIAL.');

  const backup = {
    format: 'ragnar-firestore-client-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    sourceProjectId: db.app.options.projectId,
    sourceTrainerUid: user.uid,
    records,
    counts,
    errors,
    warnings,
    partial: errors.length > 0
  };
  report('Respaldo preparado: ' + records.length + ' documentos' + (backup.partial ? ' (parcial)' : '') + '.');
  return backup;
}

export function downloadRagnarBackup(backup) {
  const text = JSON.stringify(backup, null, 2);
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'ragnar-respaldo-' + new Date().toISOString().slice(0, 10) +
    (backup.partial ? '-PARCIAL' : '') + '.json';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
