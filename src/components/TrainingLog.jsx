import React, { useEffect, useState } from 'react';
import { addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { BookOpen, CalendarDays, Dumbbell, Save } from 'lucide-react';
import { db } from '../firebase';
import { notifyActivity } from '../services/notifyActivity';

/**
 * Bitácora presencial compartida. Los registros son nuevos documentos, no se
 * reemplaza el plan del entrenador ni se borran registros anteriores.
 */
export default function TrainingLog({ clientId, actor = 'student', clientName = '' }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    date: new Date().toLocaleDateString('en-CA'),
    exercise: '',
    sets: '',
    reps: '',
    weight: '',
    notes: ''
  });

  useEffect(() => {
    if (!clientId) return;
    const q = query(collection(db, 'clients', clientId, 'trainingLogs'), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, (snap) => {
      setEntries(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
      setLoading(false);
      setError('');
    }, (err) => {
      console.error(err);
      setLoading(false);
      setError('No se pudo cargar la bitácora. Verificá tus permisos de Firebase.');
    });
  }, [clientId]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async (event) => {
    event.preventDefault();
    if ((!form.exercise.trim() && !form.notes.trim()) || saving) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        date: form.date,
        exercise: form.exercise.trim().slice(0, 120),
        sets: form.sets.trim().slice(0, 12),
        reps: form.reps.trim().slice(0, 12),
        weight: form.weight.trim().slice(0, 20),
        notes: form.notes.trim().slice(0, 1000),
        authorRole: actor,
        authorUid: getAuth().currentUser?.uid || '',
        createdAt: serverTimestamp()
      };
      const entry = await addDoc(collection(db, 'clients', clientId, 'trainingLogs'), payload);
      // El registro se guarda aunque la notificación externa no esté configurada.
      void notifyActivity({ clientId, type: payload.notes ? 'training_note' : 'training_log', resourceId: entry.id });
      setForm((previous) => ({ ...previous, exercise: '', sets: '', reps: '', weight: '', notes: '' }));
    } catch (err) {
      console.error(err);
      setError('No se pudo guardar. Revisá la conexión o las reglas de Firebase.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-[2rem] bg-zinc-900 border border-zinc-800 p-4 sm:p-6 space-y-5" aria-label="Bitácora de entrenamiento presencial">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-yellow-400/10 p-3 text-yellow-400"><BookOpen size={22}/></span>
        <div>
          <h3 className="text-white font-black uppercase tracking-tight text-lg">Bitácora presencial</h3>
          <p className="text-xs text-zinc-400 mt-1">Ejercicios, cargas y notas compartidas entre el atleta y su entrenador.</p>
        </div>
      </div>
      <form onSubmit={handleSave} className="space-y-3 rounded-2xl bg-black/40 border border-zinc-800 p-4">
        <label className="block text-xs text-zinc-400 font-bold">Fecha
          <input type="date" required value={form.date} onChange={(e) => setField('date', e.target.value)} className="mt-1 w-full bg-zinc-900 text-white border border-zinc-700 rounded-xl p-3 [color-scheme:dark]"/>
        </label>
        <label className="block text-xs text-zinc-400 font-bold">Ejercicio
          <input maxLength={120} value={form.exercise} onChange={(e) => setField('exercise', e.target.value)} placeholder="Ej.: sentadilla, prensa, movilidad..." className="mt-1 w-full bg-zinc-900 text-white border border-zinc-700 rounded-xl p-3"/>
        </label>
        <div className="grid grid-cols-3 gap-2">
          {[
            ['sets', 'Series', '3'],
            ['reps', 'Reps', '12'],
            ['weight', 'Carga / kg', '40']
          ].map(([key, label, hint]) => (
            <label key={key} className="block text-xs text-zinc-400 font-bold">{label}
              <input maxLength={20} value={form[key]} onChange={(e) => setField(key, e.target.value)} placeholder={hint} className="mt-1 w-full bg-zinc-900 text-white border border-zinc-700 rounded-xl p-3"/>
            </label>
          ))}
        </div>
        <label className="block text-xs text-zinc-400 font-bold">Notas del entrenamiento
          <textarea maxLength={1000} rows={3} value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="Cómo te sentiste, técnica, molestias, indicaciones para la próxima clase..." className="mt-1 w-full bg-zinc-900 text-white border border-zinc-700 rounded-xl p-3 resize-y"/>
        </label>
        {error && <p role="alert" className="text-red-400 text-xs">{error}</p>}
        <button disabled={saving || (!form.exercise.trim() && !form.notes.trim())} type="submit" className="w-full py-3 rounded-xl bg-yellow-400 text-black font-black text-xs uppercase tracking-wide flex gap-2 justify-center items-center disabled:opacity-50">
          <Save size={16}/>{saving ? 'Guardando...' : 'Guardar en bitácora'}
        </button>
      </form>
      <div className="space-y-3">
        <h4 className="text-white font-black text-sm uppercase flex items-center gap-2"><CalendarDays size={16} className="text-yellow-400"/> Historial reciente</h4>
        {loading ? <p className="text-zinc-500 text-sm">Cargando registros...</p> : entries.length === 0 ? (
          <p className="text-zinc-500 text-sm border border-dashed border-zinc-800 rounded-xl p-5 text-center">Todavía no hay registros presenciales.</p>
        ) : entries.map((entry) => (
          <article key={entry.id} className="border border-zinc-800 rounded-2xl bg-black/30 p-4 space-y-2">
            <div className="flex justify-between gap-2 items-start">
              <div className="flex items-center gap-2 text-white font-bold text-sm"><Dumbbell size={16} className="text-yellow-400"/>{entry.exercise || 'Nota del entrenamiento'}</div>
              <span className="text-[10px] text-zinc-400 shrink-0">{entry.date}</span>
            </div>
            {(entry.sets || entry.reps || entry.weight) && <p className="text-xs text-zinc-300">Series: {entry.sets || '—'} · Reps: {entry.reps || '—'} · Carga: {entry.weight || '—'} kg</p>}
            {entry.notes && <p className="text-sm text-zinc-300 whitespace-pre-wrap">{entry.notes}</p>}
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">{entry.authorRole === 'trainer' ? 'Coach' : (clientName || 'Atleta')} · Registro compartido</p>
          </article>
        ))}
      </div>
    </section>
  );
}
