import React, { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { arrayRemove, arrayUnion, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../firebase';

export default function PushPermissionButton() {
  const [status, setStatus] = useState('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const supported = 'Notification' in window && 'serviceWorker' in navigator && window.isSecureContext;
    setStatus(supported ? Notification.permission : 'unsupported');
  }, []);

  const enable = async () => {
    setBusy(true);
    setMessage('');
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error('Iniciá sesión antes de activar los avisos.');
      if (!import.meta.env.VITE_FIREBASE_VAPID_PUBLIC_KEY) {
        throw new Error('Falta configurar VITE_FIREBASE_VAPID_PUBLIC_KEY en Netlify.');
      }
      const permission = await Notification.requestPermission();
      setStatus(permission);
      if (permission !== 'granted') return;
      const messagingModule = await import('firebase/messaging');
      if (!(await messagingModule.isSupported())) throw new Error('Push no disponible en este navegador.');
      const { app } = await import('../firebase');
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      const token = await messagingModule.getToken(messagingModule.getMessaging(app), {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_PUBLIC_KEY,
        serviceWorkerRegistration: registration
      });
      if (!token) throw new Error('No se recibió el token de notificaciones.');
      await setDoc(doc(db, 'pushDevices', user.uid), {
        tokens: arrayUnion(token),
        updatedAt: serverTimestamp()
      }, { merge: true });
      localStorage.setItem('ragnar_push_token', token);
      setMessage('Notificaciones activadas en este dispositivo.');
    } catch (error) {
      console.error(error);
      setMessage(error.message || 'No se pudieron activar las notificaciones.');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const user = getAuth().currentUser;
      const token = localStorage.getItem('ragnar_push_token');
      if (user && token) {
        await updateDoc(doc(db, 'pushDevices', user.uid), {
          tokens: arrayRemove(token),
          updatedAt: serverTimestamp()
        });
      }
      localStorage.removeItem('ragnar_push_token');
      setMessage('Este dispositivo dejó de recibir avisos de Ragnar.');
    } catch (error) {
      console.error(error);
      setMessage('No se pudo desactivar desde este dispositivo.');
    } finally {
      setBusy(false);
    }
  };

  if (status === 'loading') return null;
  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Bell className="text-yellow-400 shrink-0" size={20}/>
        <div>
          <h3 className="font-black text-white text-sm uppercase">Avisos de Ragnar</h3>
          <p className="text-xs text-zinc-400 mt-1">Mensajes, rutinas, entrenamientos y notas. Se activan únicamente si vos lo autorizás.</p>
        </div>
      </div>
      {status === 'unsupported' ? (
        <p className="text-xs text-amber-300">Este navegador no admite notificaciones web. En iPhone, instalá la app desde Safari en la pantalla de inicio.</p>
      ) : status === 'denied' ? (
        <p className="text-xs text-amber-300">Permiso bloqueado. Habilitá notificaciones para este sitio desde los ajustes del dispositivo.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={enable} className="rounded-xl bg-yellow-400 text-black font-black text-xs uppercase px-4 py-3 disabled:opacity-60"><Bell size={15} className="inline mr-2"/>{busy ? 'Procesando...' : status === 'granted' ? 'Activar en este equipo' : 'Activar notificaciones'}</button>
          {localStorage.getItem('ragnar_push_token') && <button type="button" disabled={busy} onClick={disable} className="rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-bold px-4 py-3"><BellOff size={15} className="inline mr-2"/>Desactivar</button>}
        </div>
      )}
      {message && <p className="text-xs text-zinc-300" role="status">{message}</p>}
    </div>
  );
}
