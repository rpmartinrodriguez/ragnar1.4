import React, { useState, useEffect } from 'react';
import { 
  DollarSign, Search, Calendar, CheckCircle2, 
  Clock, ChevronRight, CreditCard, Banknote, History, X, Save
} from 'lucide-react';
import { collection, onSnapshot, doc, setDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { notifyActivity } from '../services/notifyActivity';

export default function PaymentsView() {
  const [clients, setClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [paymentType, setPaymentType] = useState('MP');
  const [paymentAmount, setPaymentAmount] = useState('');

  const today = new Date();

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'clients'), (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  const getPaymentStatus = (startDate) => {
    if (!startDate) return { label: 'Sin Fecha', color: 'text-zinc-500', bg: 'bg-zinc-500/10', border: 'border-zinc-800' };
    
    const start = new Date(startDate);
    const day = start.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    const expirationDate = new Date(currentYear, currentMonth, day);
    const diffTime = expirationDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
      return { label: 'Vencido', color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/50', alert: true };
    } else if (diffDays <= 10) {
      return { label: `Vence en ${diffDays} días`, color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/50', alert: true };
    } else {
      return { label: 'Al día', color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-zinc-800', alert: false };
    }
  };

  const openHistory = (client) => {
    setSelectedClient(client);
    setIsModalOpen(true);
    const unsub = onSnapshot(collection(db, 'clients', client.id, 'payments'), (snap) => {
      setPaymentHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => b.date - a.date));
    });
  };

  const handleRegisterPayment = async () => {
    if (!paymentAmount) return;
    const monthId = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    try {
      await setDoc(doc(db, 'clients', selectedClient.id, 'payments', monthId), {
        status: 'paid',
        method: paymentType,
        amount: paymentAmount,
        date: new Date(),
        month: monthId
      });
      void notifyActivity({ clientId: selectedClient.id, type: 'payment_recorded', resourceId: monthId });
      alert("Pago registrado.");
      setPaymentAmount('');
    } catch (e) { console.error(e); }
  };

  const filtered = clients.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">Cobros</h2>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
          <input 
            type="text" placeholder="Buscar alumno..." 
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2.5 pl-10 text-white focus:border-yellow-400 outline-none"
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(client => {
          const status = getPaymentStatus(client.startDate);
          return (
            <div key={client.id} onClick={() => openHistory(client)} className={`bg-zinc-900 border ${status.border} rounded-2xl p-5 cursor-pointer hover:bg-zinc-800/50 transition-all relative`}>
              {status.alert && <div className={`absolute top-4 right-4 w-2 h-2 rounded-full animate-ping ${status.label === 'Vencido' ? 'bg-red-500' : 'bg-yellow-400'}`}></div>}
              <div className="flex justify-between mb-4">
                <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center font-bold text-zinc-500">{client.name.charAt(0)}</div>
                <span className={`text-[10px] font-black px-2 py-1 rounded uppercase ${status.bg} ${status.color}`}>{status.label}</span>
              </div>
              <h3 className="text-lg font-bold text-white uppercase">{client.name}</h3>
              <p className="text-yellow-400 text-xs font-bold mt-1 uppercase">{client.plan || 'Plan Base'}</p>
            </div>
          );
        })}
      </div>

      {isModalOpen && selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
          <div className="bg-zinc-950 w-full max-w-xl rounded-[2rem] border border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-zinc-800 flex justify-between bg-zinc-900/50">
              <h2 className="text-xl font-black text-white uppercase italic">{selectedClient.name}</h2>
              <button onClick={() => setIsModalOpen(false)}><X size={24}/></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 space-y-4">
                <h3 className="text-white font-bold text-sm uppercase">Registrar Pago</h3>
                <div className="flex gap-2">
                  <button onClick={() => setPaymentType('MP')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${paymentType === 'MP' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-500'}`}>MP</button>
                  <button onClick={() => setPaymentType('Efectivo')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${paymentType === 'Efectivo' ? 'bg-green-600 text-white' : 'bg-zinc-800 text-zinc-500'}`}>Efectivo</button>
                </div>
                <input type="number" placeholder="Monto $" className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-white" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)}/>
                <button onClick={handleRegisterPayment} className="w-full bg-yellow-400 text-black font-black py-3 rounded-xl uppercase text-xs">Guardar Pago</button>
              </div>
              <div className="space-y-2">
                <p className="text-zinc-500 font-bold uppercase text-[10px]">Historial</p>
                {paymentHistory.map(pay => (
                  <div key={pay.id} className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl flex justify-between items-center">
                    <span className="text-white font-bold">{pay.month}</span>
                    <span className="text-yellow-400 font-black">${pay.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
