import React, { useState, useEffect } from 'react';
import { 
  Menu, Dumbbell, Settings, BarChart3, Users, Calendar, 
  X, LogOut, List, Layout, Bell, MessageSquare, CreditCard 
} from 'lucide-react';

// --- Firebase ---
import { 
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, 
  doc, query, orderBy, where, getDocs, getDoc, limit, setDoc 
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { db, isPreviewMissingFirebase } from './firebase'; 

// --- Componentes ---
import { Sidebar } from './components/Sidebar';
import DashboardView from './views/DashboardView';
import ClientsView from './views/ClientsView';
import ClientDetailView from './views/ClientDetailView';
import ExercisesView from './views/ExercisesView';
import RoutinesView from './views/RoutinesView';
import CalendarView from './views/CalendarView';
import LoginView from './views/LoginView';
import StudentView from './views/StudentView';
import StudentRegistration from './views/StudentRegistration';
import NotificationsView from './views/NotificationsView';
import SettingsView from './views/SettingsView';
import CommunityView from './views/CommunityView'; 
import PaymentsView from './views/PaymentsView';
import PushPermissionButton from './components/PushPermissionButton'; 

export default function App() {
  // --- ESTADOS GLOBALES ---
  const [user, setUser] = useState(null);
  
  // Estados para la Pantalla de Carga (Splash Screen Anti-Parpadeo)
  const [isAppReady, setIsAppReady] = useState(false);
  const [splashFade, setSplashFade] = useState(false);
  
  // Rol del usuario: 'trainer' | 'student' | null
  const [userRole, setUserRole] = useState(null);
  const [studentProfileId, setStudentProfileId] = useState(null); 

  // Estado de Invitación (Link Mágico para nuevos alumnos)
  const [inviteId, setInviteId] = useState(null);

  // Estados de navegación y datos (Modo Entrenador)
  const [activeView, setActiveView] = useState('dashboard');
  const [selectedClient, setSelectedClient] = useState(null);
  const [clients, setClients] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [routines, setRoutines] = useState([]); 
  const [settings, setSettings] = useState(null); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const auth = getAuth();

  // --- EFECTO 1: Gestión de Sesión y Pantalla de Carga ---
  useEffect(() => {
    if (isPreviewMissingFirebase) { setIsAppReady(true); return; }
    const params = new URLSearchParams(window.location.search);
    const inviteParam = params.get('invite');
    if (inviteParam) {
      setInviteId(inviteParam);
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        await checkUserRole(currentUser.uid);
        setUser(currentUser);
      } else {
        setUser(null);
        setUserRole(null);
        setStudentProfileId(null);
      }
      
      // El splash termina cuando se resuelve el estado de autenticación.
      // Evitamos 2.2 segundos de espera artificial en cada apertura.
      setSplashFade(true);
      setIsAppReady(true); 
    });
    
    return () => unsubscribe();
  }, []);

  const checkUserRole = async (uid) => {
    try {
      const q = query(collection(db, 'clients'), where('studentUserId', '==', uid));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const clientDoc = querySnapshot.docs[0];
        setUserRole('student');
        setStudentProfileId(clientDoc.id);
      } else {
        // Una cuenta registrada no se convierte automáticamente en entrenador.
        let explicitTrainer = false;
        try {
          const trainerSnap = await getDoc(doc(db, 'trainers', uid));
          explicitTrainer = trainerSnap.exists() && trainerSnap.data()?.active === true;
        } catch (error) {
          // Las reglas anteriores no incluyen /trainers: conservar acceso del coach existente.
          console.warn('Rol de coach sin provisionar: comprobando alumnos asignados.');
        }
        if (explicitTrainer) {
          setUserRole('trainer');
        } else {
          // Compatibilidad con el coach histórico que ya tiene atletas a cargo.
          const assigned = await getDocs(query(collection(db, 'clients'), where('trainerId', '==', uid), limit(1)));
          setUserRole(assigned.empty ? 'unapproved' : 'trainer');
        }
      }
    } catch (error) {
      console.error(error);
      setUserRole('unapproved');
    }
  };

  // --- EFECTO 2: Sincronización de Datos (Solo Trainer) ---
  useEffect(() => {
    if (!user || userRole !== 'trainer') return;

    const unsubClients = onSnapshot(query(collection(db, 'clients'), where('trainerId', '==', user.uid)), (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qExercises = query(collection(db, 'exercises'), orderBy('name'));
    const unsubExercises = onSnapshot(qExercises, (snapshot) => {
      setExercises(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubRoutines = onSnapshot(collection(db, 'routines'), (snapshot) => {
      setRoutines(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'general'), (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data());
      }
    });

    const qNotif = query(collection(db, 'trainerNotifications'), where('read', '==', false));
    const unsubNotif = onSnapshot(qNotif, (snapshot) => {
      setUnreadCount(snapshot.size);
    });

    return () => {
      unsubClients();
      unsubExercises();
      unsubRoutines();
      unsubSettings();
      unsubNotif();
    };
  }, [user, userRole]);

  // --- FUNCIONES DE NAVEGACIÓN Y AUTH ---
  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.history.pushState({}, document.title, window.location.pathname);
      setInviteId(null);
    } catch (error) { 
      console.error("Error logout:", error); 
    }
  };

  const navigateTo = (view, client = null) => {
    setActiveView(view);
    if (client) {
      setSelectedClient(client);
    }
    setIsMobileMenuOpen(false);
  };

  // --- FUNCIONES DE GESTIÓN (CRUD) ---
  const handleAddClient = async (data) => {
    try {
      await addDoc(collection(db, 'clients'), { 
        ...data, 
        createdAt: new Date(), 
        active: true, 
        trainerId: user.uid 
      });
    } catch (error) { 
      console.error(error); 
    }
  };

  const handleUpdateClientData = async (updatedData) => {
    try {
      const { id, ...rest } = updatedData;
      await updateDoc(doc(db, 'clients', id), rest);
    } catch (error) { 
      console.error(error); 
    }
  };

  const handleDeleteClient = async (clientId) => {
    if(window.confirm('¿Estás seguro de eliminar este cliente y todos sus registros?')) {
      try {
        await deleteDoc(doc(db, 'clients', clientId));
        if (selectedClient?.id === clientId) {
          setActiveView('clients');
          setSelectedClient(null);
        }
      } catch (error) { 
        console.error(error); 
      }
    }
  };

  const updateClientRoutine = async (clientId, newEx) => {
    try {
      const clientRef = doc(db, 'clients', clientId);
      const current = clients.find(c => c.id === clientId);
      const updated = [...(current.routine || []), newEx];
      
      await updateDoc(clientRef, { routine: updated });
      
      if (selectedClient?.id === clientId) {
        setSelectedClient(prev => ({ ...prev, routine: updated }));
      }
    } catch (error) { 
      console.error(error); 
    }
  };

  const handleAddExercise = async (data) => { 
    try { 
      await addDoc(collection(db, 'exercises'), { 
        name: data.name, 
        videoUrl: data.videoUrl || '' 
      }); 
    } catch (error) { 
      console.error(error); 
    }
  };

  const handleUpdateExercise = async (updatedData) => {
    try { 
      const { id, ...rest } = updatedData; 
      await updateDoc(doc(db, 'exercises', id), rest); 
    } catch (error) { 
      console.error(error); 
    }
  };
  
  const handleDeleteExercise = async (id) => { 
    if(window.confirm('¿Eliminar este ejercicio de la biblioteca global?')) {
      try { 
        await deleteDoc(doc(db, 'exercises', id)); 
      } catch (error) { 
        console.error(error); 
      }
    }
  };

  const handleAddRoutine = async (data) => {
    try { 
      await addDoc(collection(db, 'routines'), data); 
    } catch (error) { 
      console.error(error); 
    }
  };

  const handleUpdateRoutine = async (data) => {
    try { 
      const { id, ...rest } = data; 
      await updateDoc(doc(db, 'routines', id), rest); 
    } catch (error) { 
      console.error(error); 
    }
  };

  const handleDeleteRoutine = async (id) => {
    if(window.confirm('¿Eliminar esta rutina?')) {
      try { 
        await deleteDoc(doc(db, 'routines', id)); 
      } catch (error) { 
        console.error(error); 
      }
    }
  };

  const handleUpdateSettings = async (newSettings) => {
    try { 
      await setDoc(doc(db, 'settings', 'general'), newSettings, { merge: true }); 
    } catch (error) { 
      console.error(error); 
    }
  };

  // --- RENDERIZADOR DEL CONTENIDO DE LA APP ---
  const renderMainContent = () => {
    
    // 1. Registro de Alumno
    if (inviteId && (!user || (user && userRole !== 'student'))) {
      return (
        <StudentRegistration 
          inviteId={inviteId} 
          onRegisterSuccess={() => { 
            window.history.pushState({}, document.title, window.location.pathname); 
            setInviteId(null);
            // El alta y el vínculo se acaban de guardar: refrescar el rol sin recargar.
            if (auth.currentUser) void checkUserRole(auth.currentUser.uid);
          }} 
        />
      );
    }

    // 2. Vista de Alumno
    if (user && userRole === 'student' && studentProfileId) {
      return <StudentView clientId={studentProfileId} />;
    }

    // 3. Vista Login (Sin sesión)
    if (!user) {
      return <LoginView onLoginSuccess={() => {}} />;
    }

    if (userRole !== 'trainer') {
      return <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center text-center p-8 gap-5">
        <h1 className="text-yellow-400 text-2xl font-black uppercase">Acceso pendiente</h1>
        <p className="max-w-md text-zinc-400 text-sm">Esta cuenta todavía no tiene un rol de entrenador autorizado ni un perfil de alumno vinculado.</p>
        <button onClick={handleLogout} className="rounded-xl border border-zinc-700 px-5 py-3 font-bold">Cerrar sesión</button>
      </div>;
    }

    // 4. Vista de Entrenador (App Principal)
    return (
      <div className="flex h-screen bg-black text-zinc-100 font-sans overflow-hidden">
        
        {/* Sidebar Desktop */}
        <div className="hidden md:block">
          <Sidebar 
            activeView={activeView} 
            navigateTo={navigateTo} 
            notificationCount={unreadCount} 
          />
        </div>
        
        {/* Menú Móvil Desplegable */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 bg-black/95 md:hidden flex flex-col animate-in fade-in backdrop-blur-sm">
            
            <div className="p-4 flex justify-between items-center border-b border-zinc-800 shrink-0">
              <h2 className="text-white font-bold text-xl uppercase tracking-tighter">Menú</h2>
              <button 
                onClick={() => setIsMobileMenuOpen(false)} 
                className="text-zinc-400 p-2"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="p-4 flex flex-col gap-1 overflow-y-auto flex-1 custom-scrollbar">
              <button onClick={() => navigateTo('dashboard')} className="p-4 text-left text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl flex items-center gap-3 transition-colors">
                <BarChart3 size={20}/> Dashboard
              </button>
              
              <button onClick={() => navigateTo('notifications')} className="p-4 text-left text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl flex justify-between items-center transition-colors">
                 <span className="flex items-center gap-3"><Bell size={20}/> Notificaciones</span>
                 {unreadCount > 0 && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{unreadCount}</span>}
              </button>
              
              <button onClick={() => navigateTo('clients')} className="p-4 text-left text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl flex items-center gap-3 transition-colors">
                <Users size={20}/> Mis Atletas
              </button>
              
              <button onClick={() => navigateTo('exercises')} className="p-4 text-left text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl flex items-center gap-3 transition-colors">
                <List size={20}/> Ejercicios
              </button>
              
              <button onClick={() => navigateTo('routines')} className="p-4 text-left text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl flex items-center gap-3 transition-colors">
                <Layout size={20}/> Rutinas
              </button>
              
              <button onClick={() => navigateTo('calendar')} className="p-4 text-left text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl flex items-center gap-3 transition-colors">
                <Calendar size={20}/> Agenda
              </button>
              
              <button onClick={() => navigateTo('community')} className="p-4 text-left text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl flex items-center gap-3 transition-colors">
                <MessageSquare size={20}/> Comunidad
              </button>
              
              <button onClick={() => navigateTo('payments')} className="p-4 text-left text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl flex items-center gap-3 transition-colors">
                <CreditCard size={20}/> Pagos
              </button>
              
              <button onClick={() => navigateTo('settings')} className="p-4 text-left text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl flex items-center gap-3 transition-colors">
                <Settings size={20}/> Configuración
              </button>

              <div className="mt-auto pt-6 pb-4 shrink-0">
                <div className="h-px bg-zinc-800 mb-4"></div>
                <button 
                  onClick={handleLogout} 
                  className="w-full p-4 text-left text-red-500 hover:bg-red-500/10 rounded-xl font-bold flex items-center gap-3 transition-colors"
                >
                  <LogOut size={20} /> Cerrar Sesión
                </button>
              </div>
            </div>

          </div>
        )}

        {/* Área de Contenido Principal */}
        <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-black">
          
          {/* Header para Móviles */}
          <header className="md:hidden flex items-center justify-between p-4 bg-zinc-950 border-b border-zinc-800 shadow-xl">
            <div className="flex items-center gap-2">
               <img 
                 src="/logo.png" 
                 alt="Logo" 
                 className="w-8 h-8 object-contain" 
                 onError={(e) => e.target.style.display = 'none'}
               />
               <span className="font-black italic text-lg tracking-tighter">
                  <span className="text-yellow-400">RAGNAR</span><span className="text-white">-TRAINING</span>
               </span>
            </div>
            <div className="flex items-center gap-1">
               <button 
                 onClick={() => navigateTo('notifications')} 
                 className="relative p-2 text-zinc-400"
               >
                 <Bell size={24}/>
                 {unreadCount > 0 && (
                   <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-black"></span>
                 )}
               </button>
               <button 
                 onClick={() => setIsMobileMenuOpen(true)} 
                 className="p-2 text-zinc-400"
               >
                 <Menu size={24} />
               </button>
            </div>
          </header>

          {/* Inyección de Vistas Dinámicas */}
          <div className="flex-1 overflow-y-auto p-4 md:p-8 no-scrollbar">
            
            {activeView === 'dashboard' && (
              <DashboardView 
                clients={clients} 
                navigateTo={navigateTo} 
                onAddClient={handleAddClient} 
              />
            )}
            
            {activeView === 'notifications' && (
              <NotificationsView 
                navigateTo={navigateTo} 
                clients={clients} 
              />
            )}
            
            {activeView === 'clients' && (
              <ClientsView 
                clients={clients} 
                settings={settings} 
                routines={routines} 
                navigateTo={navigateTo} 
                onAddClient={handleAddClient} 
                onUpdateClient={handleUpdateClientData} 
                onDeleteClient={handleDeleteClient} 
              />
            )}
            
            {activeView === 'exercises' && (
              <ExercisesView 
                exercises={exercises} 
                exercisesLibrary={exercises} 
                onAddExercise={handleAddExercise} 
                onUpdateExercise={handleUpdateExercise} 
                onDeleteExercise={handleDeleteExercise} 
              />
            )}
            
            {activeView === 'routines' && (
              <RoutinesView 
                routines={routines} 
                exercisesLibrary={exercises} 
                onAddRoutine={handleAddRoutine} 
                onUpdateRoutine={handleUpdateRoutine} 
                onDeleteRoutine={handleDeleteRoutine} 
              />
            )}
            
            {activeView === 'client-detail' && selectedClient && (
              <ClientDetailView 
                client={selectedClient} 
                goBack={() => navigateTo('clients')} 
                exercisesLibrary={exercises} 
                routines={routines} 
                onUpdateClient={handleUpdateClientData} 
              />
            )}
            
            {activeView === 'calendar' && (
              <CalendarView clients={clients} />
            )}
            
            {activeView === 'settings' && (
              <div className="space-y-5">
                <PushPermissionButton />
              <SettingsView 
                settings={settings} 
                onUpdateSettings={handleUpdateSettings} 
              />
              </div>
            )}
            
            {activeView === 'community' && (
              <CommunityView 
                isCoach={true} 
                coachName="Coach Ragnar" 
              />
            )}
            
            {activeView === 'payments' && (
              <PaymentsView 
                clients={clients} 
                onUpdateClient={handleUpdateClientData} 
              />
            )}

          </div>
        </main>

        {/* Botón Flotante de Logout para Desktop */}
        <button 
          onClick={handleLogout} 
          className="hidden md:flex fixed bottom-6 left-6 w-52 items-center gap-3 text-zinc-500 hover:text-red-400 transition-all p-2 z-10 font-bold text-xs uppercase tracking-widest"
        >
          <LogOut size={18} /> Cerrar Sesión
        </button>

      </div>
    );
  };

  if (isPreviewMissingFirebase) return (
    <main className="min-h-screen bg-black text-zinc-100 flex flex-col justify-center items-center text-center gap-4 p-6">
      <h1 className="text-yellow-400 text-2xl font-black uppercase">Ragnar · Entorno de pruebas</h1>
      <p className="max-w-lg text-zinc-300 text-sm">Falta conectar el proyecto Firebase de prueba. Para proteger los datos reales, esta vista no permite iniciar sesión ni modificar alumnos.</p>
      <p className="text-zinc-500 text-xs">Configurá las variables VITE_FIREBASE_* en Netlify para Deploy Previews / Branch deploys.</p>
    </main>
  );

  return (
    <>
      {/* TELÓN DE CARGA (SPLASH SCREEN PREMIUM) */}
      {!isAppReady && (
        <div className={`fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center transition-opacity duration-700 ease-in-out ${splashFade ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <div className="relative flex flex-col items-center">
            
            {/* Brillo de fondo */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 md:w-64 md:h-64 bg-yellow-400/20 blur-[80px] rounded-full pointer-events-none"></div>
            
            <img 
              src="/logo.png" 
              alt="Logo" 
              className="w-24 h-24 md:w-32 md:h-32 object-contain animate-pulse relative z-10 drop-shadow-[0_0_20px_rgba(250,204,21,0.4)]" 
              onError={(e) => e.target.style.display = 'none'}
            />
            
            <h1 className="text-3xl md:text-4xl font-black uppercase italic tracking-tighter text-white mt-6 relative z-10">
              <span className="text-yellow-400">RAGNAR</span> TRAINING
            </h1>
            
            <p className="text-zinc-500 font-black text-[10px] md:text-xs tracking-[0.4em] uppercase mt-2 mb-8 relative z-10">
              Elite Coaching
            </p>
            
            {/* Puntos de carga animados */}
            <div className="flex gap-2 relative z-10">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>

          </div>
        </div>
      )}

      {/* APLICACIÓN REAL QUE CARGA POR DETRÁS */}
      {renderMainContent()}
    </>
  );
}
