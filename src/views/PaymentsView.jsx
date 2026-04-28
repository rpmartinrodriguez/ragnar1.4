import React, { useState, useEffect } from 'react';
import { Search, CreditCard, CheckCircle, AlertTriangle, Clock, Calendar as CalendarIcon, User, RefreshCcw } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function PaymentsView({ clients }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentsData, setPaymentsData] = useState({});
  const [loading, setLoading] = useState(true);

  // --- EL CEREBRO DE LA FACTURACIÓN (CICLO RELATIVO) ---
  const getCycleData = (client) => {
    if (!client.startDate) return null;
    
    const today = new Date();
    // Extraemos el día exacto de cobro asignado (Ej: 15)
    const startDay = new Date(client.startDate + 'T12:00:00Z').getUTCDate();
    
    let cycleYear = today.getFullYear();
    let cycleMonth = today.getMonth() + 1; // 1 a 12

    // Si hoy es ANTES del día de cobro, significa que seguimos en el mes de facturación anterior
    if (today.getDate() < startDay) {
      cycleMonth -= 1;
      if (cycleMonth === 0) {
        cycleMonth = 12;
        cycleYear -= 1;
      }
    }

    const periodId = `${cycleYear}-${String(cycleMonth).padStart(2, '0')}`;
    
    // Calculamos la fecha límite real de ESTE ciclo sumándole los días de gracia
    const deadline = new Date(cycleYear, cycleMonth - 1, startDay);
    deadline.setDate(deadline.getDate() + parseInt(client.graceDays || 0));
    deadline.setHours(23, 59, 59, 999); // Hasta el último segundo del día

    const isExpired = today > deadline;
    const monthName = new Date(cycleYear, cycleMonth - 1).toLocaleString('es-ES', { month: 'long' });

    return { periodId, deadline, isExpired, monthName, startDay };
  };

  useEffect(() => {
    const fetchPayments = async () => {
      setLoading(true);
      const newPaymentsData = {};
      
      for (const client of clients) {
        if (!client.active) continue; // Ignoramos inactivos
        
        const cycle = getCycleData(client);
        if (cycle) {
          const payRef = doc(db, 'clients', client.id, 'payments', cycle.periodId);
          const paySnap = await getDoc(payRef);
          
          newPaymentsData[client.id] = {
            ...cycle,
            isPaid: paySnap.exists() && paySnap.data().status === 'paid',
            paidAt: paySnap.exists() ? paySnap.data().paidAt : null
          };
        }
      }
      setPaymentsData(newPaymentsData);
      setLoading(false);
    };
    
    if (clients && clients.length > 0) {
      fetchPayments();
    } else {
      setLoading(false);
    }
  }, [clients]);

  // --- MARCAR COMO PAGADO ---
  const handleMarkAsPaid = async (clientId, periodId) => {
    if (!window.confirm('¿Confirmas que has recibido el pago de este ciclo?')) return;
    try {
      await setDoc(doc(db, 'clients', clientId, 'payments', periodId), {
        status: 'paid',
        paidAt: new Date()
      });
      setPaymentsData(prev => ({
        ...prev,
        [clientId]: { ...prev[clientId], isPaid: true }
      }));
    } catch (error) { 
      console.error(error); 
      alert("Error al registrar el pago.");
    }
  };

  // --- REVERTIR PAGO (POR ERROR) ---
  const handleUndoPayment = async (clientId, periodId) => {
    if (!window.confirm('¿Deshacer este pago y volver a marcar al atleta como deudor?')) return;
    try {
      await setDoc(doc(db, 'clients', clientId, 'payments', periodId), {
        status: 'pending',
        paidAt: null
      });
      setPaymentsData(prev => ({
        ...prev,
        [clientId]: { ...prev[clientId], isPaid: false }
      }));
    } catch (error) { 
      console.error(error); 
    }
  };

  const filteredClients = clients.filter(c => 
    c.active !== false && 
    c.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in pb-12">
      
      {/* HEADER Y BUSCADOR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
           <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter flex items-center gap-3">
             <CreditCard className="text-yellow-400" size={28}/> Panel de Cobros
           </h2>
           <p className="text-zinc-500 text-sm font-medium mt-1">Supervisa las membresías y deudas de tus atletas.</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-4 top-3.5 text-zinc-500" size={18}/>
          <input 
            type="text" 
            placeholder="Buscar atleta..." 
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-12 pr-4 py-3 text-white outline-none focus:border-yellow-400 text-sm font-bold transition-colors" 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-yellow-400"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClients.map(client => {
            const data = paymentsData[client.id];
            
            // Si el atleta no tiene fecha de alta configurada
            if (!data) {
              return (
                <div key={client.id} className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 opacity-70">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-500"><User size={24}/></div>
                    <div>
                      <h3 className="font-black text-lg text-white uppercase leading-tight">{client.name}</h3>
                      <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Sin fecha de inicio</p>
                    </div>
                  </div>
                  <div className="bg-black/30 p-3 rounded-xl border border-zinc-800 text-center">
                    <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Ve a su perfil para configurar el alta.</p>
                  </div>
                </div>
              );
            }

            // Estados visuales según el pago y el vencimiento
            const isPaid = data.isPaid;
            const isExpired = !isPaid && data.isExpired;
            const isGrace = !isPaid && !data.isExpired;

            return (
              <div key={client.id} className={`bg-zinc-900 border rounded-3xl p-6 transition-all shadow-xl ${isExpired ? 'border-red-500/30 shadow-red-500/5' : isGrace ? 'border-orange-500/30' : 'border-zinc-800'}`}>
                
                {/* Cabecera Tarjeta */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isExpired ? 'bg-red-500/10 text-red-500' : isGrace ? 'bg-orange-500/10 text-orange-500' : 'bg-yellow-400/10 text-yellow-400'}`}>
                      <User size={24}/>
                    </div>
                    <div>
                      <h3 className="font-black text-lg text-white uppercase leading-tight truncate max-w-[150px]">{client.name}</h3>
                      <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Cobro los días {data.startDay}</p>
                    </div>
                  </div>
                  
                  {/* Badge de Estado */}
                  <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${isPaid ? 'bg-green-500/10 text-green-500 border-green-500/20' : isExpired ? 'bg-red-500/10 text-red-500 border-red-500/20 animate-pulse' : 'bg-orange-500/10 text-orange-500 border-orange-500/20'}`}>
                    {isPaid ? 'Al Día' : isExpired ? 'Vencido' : 'Pendiente'}
                  </span>
                </div>

                {/* Detalles del Ciclo */}
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between items-center bg-black/40 p-3 rounded-xl border border-zinc-800/50">
                    <div className="flex items-center gap-2 text-zinc-400"><CalendarIcon size={14}/><span className="text-[10px] font-black uppercase tracking-widest">Ciclo Activo</span></div>
                    <span className="text-white font-bold text-xs uppercase">{data.monthName}</span>
                  </div>
                  <div className="flex justify-between items-center bg-black/40 p-3 rounded-xl border border-zinc-800/50">
                    <div className="flex items-center gap-2 text-zinc-400"><Clock size={14}/><span className="text-[10px] font-black uppercase tracking-widest">Fecha Límite</span></div>
                    <span className={`text-xs font-bold ${isExpired ? 'text-red-500' : 'text-white'}`}>
                      {data.deadline.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                </div>

                {/* Botón de Acción */}
                {isPaid ? (
                  <button 
                    onClick={() => handleUndoPayment(client.id, data.periodId)}
                    className="w-full py-3 bg-zinc-950 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 border border-zinc-800 hover:border-red-500/30 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                  >
                    <RefreshCcw size={14}/> Deshacer Pago
                  </button>
                ) : (
                  <button 
                    onClick={() => handleMarkAsPaid(client.id, data.periodId)}
                    className={`w-full py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-transform active:scale-95 flex items-center justify-center gap-2 shadow-lg ${isExpired ? 'bg-red-500 hover:bg-red-400 text-white shadow-red-500/20' : 'bg-yellow-400 hover:bg-yellow-300 text-black shadow-yellow-400/20'}`}
                  >
                    <CheckCircle size={18}/> Marcar Recibido
                  </button>
                )}
                
              </div>
            );
          })}
          
          {filteredClients.length === 0 && (
             <div className="col-span-full py-20 text-center bg-zinc-900/30 border border-dashed border-zinc-800 rounded-3xl">
               <CreditCard size={48} className="mx-auto mb-4 text-zinc-600 opacity-50"/>
               <p className="text-zinc-500 font-bold uppercase tracking-widest text-sm">No hay atletas para mostrar</p>
             </div>
          )}
        </div>
      )}
    </div>
  );
}
