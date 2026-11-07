import React, { useState } from 'react';
import { AlertTriangle, DatabaseBackup, Download, ShieldCheck } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { db } from '../firebase';
import { exportRagnarData, downloadRagnarBackup } from '../utils/backupFirestore';

export default function DataBackupPanel() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const runExport = async () => {
    setRunning(true);
    setProgress('Preparando...');
    setResult(null);
    setError('');
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error('No hay una sesión autenticada.');
      const backup = await exportRagnarData(db, user, setProgress);
      setResult({
        total: backup.records.length,
        partial: backup.partial,
        errors: backup.errors,
        counts: backup.counts,
        warnings: backup.warnings
      });
      downloadRagnarBackup(backup);
    } catch (err) {
      setError(err.message || 'No se pudo generar el respaldo.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="rounded-2xl border border-yellow-400/30 bg-zinc-900 p-5 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-xl p-3 bg-yellow-400/10 text-yellow-400"><DatabaseBackup size={24}/></div>
        <div>
          <h3 className="font-black uppercase text-white tracking-wide">Rescate de datos</h3>
          <p className="text-zinc-400 text-xs mt-1">Copia de lectura, sin modificar Firebase de origen.</p>
        </div>
      </div>
      <div className="flex gap-2 text-sm text-zinc-300 items-start">
        <ShieldCheck size={18} className="shrink-0 mt-0.5 text-emerald-400"/>
        <p>Solo se podrán descargar registros que tu usuario de entrenador esté autorizado a leer. Se conservan las rutas y los tipos de datos de Firestore.</p>
      </div>
      <div className="flex gap-2 text-sm text-amber-300 items-start">
        <AlertTriangle size={18} className="shrink-0 mt-0.5"/>
        <p>El archivo contiene información personal de alumnos: guardalo en un lugar privado. No lo subas a GitHub ni lo compartas en enlaces públicos. No incluye usuarios ni contraseñas de Authentication.</p>
      </div>
      <button
        type="button"
        disabled={running}
        onClick={runExport}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-yellow-400 px-5 py-3 font-black text-black text-sm disabled:opacity-50 hover:bg-yellow-300"
      >
        <Download size={18}/>{running ? 'Leyendo base...' : 'Descargar respaldo de Ragnar'}
      </button>
      {progress && <p role="status" className="text-xs text-zinc-400">{progress}</p>}
      {error && <p role="alert" className="text-sm p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300">{error}</p>}
      {result && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-4 space-y-2">
          <p className="text-white font-bold">
            {result.total} documentos exportados
            {result.partial ? ' — RESPALDO PARCIAL' : ' — sin errores de lectura detectados'}
          </p>
          <p className="text-xs text-zinc-400">Se descargó un JSON. Conservalo para la importación al nuevo Firebase.</p>
          {Object.entries(result.counts).map(([path, count]) => (
            <p key={path} className="text-xs text-zinc-300">{path}: {count}</p>
          ))}
          {result.errors.map((item, index) => (
            <p key={index} className="text-xs text-red-300">{item.path}: {item.reason}</p>
          ))}
          <p className="text-xs text-zinc-500">{result.warnings.join(' ')}</p>
        </div>
      )}
    </section>
  );
}
