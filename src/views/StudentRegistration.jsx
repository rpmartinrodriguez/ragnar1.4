import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { db } from '../firebase';
import { notifyActivity } from '../services/notifyActivity';
import { ShieldCheck, LogIn, Dumbbell, Mail, Lock } from 'lucide-react';

export default function StudentRegistration({ inviteId, onRegisterSuccess }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Estados para el formulario de registro
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const auth = getAuth();

  useEffect(() => {
    const fetchInviteProfile = async () => {
      try {
        const docRef = doc(db, 'clients', inviteId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          // Verificamos si el link ya fue usado por alguien más
          if (data.studentUserId) {
            setError("Este link de invitación ya ha sido utilizado o el alumno ya está registrado.");
          } else {
            setProfile(data);
            // Si el entrenador ya le asignó un email, lo pre-cargamos obligatoriamente
            if (data.email) {
              setEmail(data.email);
            }
          }
        } else {
          setError("Invitación inválida o el perfil ha sido eliminado.");
        }
      } catch (e) { 
        console.error(e);
        setError("Ocurrió un error al cargar la invitación."); 
      } finally { 
        setLoading(false); 
      }
    };

    if (inviteId) {
      fetchInviteProfile();
    }
  }, [inviteId]);

  const handleEmailRegister = async (e) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      alert("Las contraseñas no coinciden. Por favor, verifica.");
      return;
    }

    if (password.length < 6) {
      alert("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Creamos el usuario en Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. VINCULACIÓN: Guardamos su UID en el documento que creó el entrenador
      await updateDoc(doc(db, 'clients', inviteId), {
        studentUserId: user.uid,
        email: user.email, // Por seguridad re-confirmamos el email
        linkedAt: new Date()
      });
      void notifyActivity({ clientId: inviteId, type: 'student_linked', resourceId: inviteId });

      // 3. Llamamos a la función de éxito para redirigirlo a su app
      onRegisterSuccess();
    } catch (e) { 
      console.error(e); 
      if (e.code === 'auth/email-already-in-use') {
        alert("Ese correo electrónico ya está registrado en la plataforma.");
      } else if (e.code === 'auth/invalid-email') {
        alert("El formato del correo no es válido.");
      } else {
        alert("Error al intentar crear la cuenta. Por favor, intenta nuevamente."); 
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-yellow-400"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] p-8 w-full max-w-sm text-center shadow-2xl relative overflow-hidden">
        
        <div className="absolute top-0 left-0 w-full h-1 bg-yellow-400"></div>
        
        <div className="bg-yellow-400/10 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 text-yellow-400 shadow-inner">
          <ShieldCheck size={48} />
        </div>

        {error ? (
          <div className="animate-in slide-in-from-bottom-4">
            <h2 className="text-white font-black uppercase text-xl mb-4 italic tracking-tighter">Ups...</h2>
            <p className="text-zinc-500 text-sm mb-8 leading-relaxed px-4">{error}</p>
            <button 
              onClick={() => window.location.href = '/'} 
              className="text-yellow-400 hover:text-yellow-300 font-bold uppercase text-xs tracking-widest transition-colors"
            >
              Volver al Inicio
            </button>
          </div>
        ) : (
          <div className="animate-in slide-in-from-bottom-4">
            <h2 className="text-white font-black uppercase text-2xl mb-2 italic tracking-tighter">¡Bienvenido Atleta!</h2>
            <p className="text-zinc-500 text-sm mb-6 leading-relaxed">
              Crea tu contraseña para acceder al perfil de <span className="text-white font-bold">{profile?.name}</span>.
            </p>
            
            <div className="bg-black/50 border border-zinc-800 rounded-2xl p-4 mb-6 flex items-center gap-4 text-left shadow-inner">
              <div className="bg-zinc-800 p-2 rounded-xl text-yellow-400">
                <Dumbbell size={20}/>
              </div>
              <div>
                <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">Plan Asignado</p>
                <p className="text-white font-bold text-sm uppercase">{profile?.plan || 'Plan Base'}</p>
              </div>
            </div>

            <form onSubmit={handleEmailRegister} className="space-y-4">
              
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail size={16} className={profile?.email ? "text-yellow-400" : "text-zinc-500"} />
                </div>
                <input 
                  type="email" 
                  required 
                  disabled={!!profile?.email} // Si el coach puso email, se bloquea el input
                  placeholder="Tu correo electrónico" 
                  className={`w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-11 pr-4 py-3.5 text-white outline-none focus:border-yellow-400 text-sm transition-colors ${profile?.email ? 'opacity-70 cursor-not-allowed text-yellow-400 font-bold' : ''}`}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              {profile?.email && (
                <p className="text-[9px] text-zinc-500 uppercase tracking-widest mt-1 text-left px-2 font-bold">
                  Email vinculado por tu entrenador
                </p>
              )}

              <div className="relative mt-4">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock size={16} className="text-zinc-500" />
                </div>
                <input 
                  type="password" 
                  required 
                  minLength={6}
                  placeholder="Crea una contraseña (mín 6 caract.)" 
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-11 pr-4 py-3.5 text-white outline-none focus:border-yellow-400 text-sm transition-colors"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>

              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock size={16} className="text-zinc-500" />
                </div>
                <input 
                  type="password" 
                  required 
                  minLength={6}
                  placeholder="Repite tu contraseña" 
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-11 pr-4 py-3.5 text-white outline-none focus:border-yellow-400 text-sm transition-colors"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full bg-yellow-400 text-black hover:bg-yellow-300 disabled:opacity-50 disabled:hover:bg-yellow-400 font-black py-4 rounded-2xl uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all shadow-[0_0_20px_rgba(250,204,21,0.2)] mt-2"
              >
                {isSubmitting ? (
                  <span className="animate-pulse">Vinculando cuenta...</span>
                ) : (
                  <><LogIn size={20}/> Unirme a Ragnar</>
                )}
              </button>
            </form>
            
          </div>
        )}
      </div>
    </div>
  );
}
