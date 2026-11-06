import { getAuth } from 'firebase/auth';

// Envía el aviso después de persistir el evento real en Firestore.
// Nunca pasa destinatarios, tokens ni texto arbitrario al servidor.
export async function notifyActivity({ clientId, type, resourceId }) {
  try {
    const user = getAuth().currentUser;
    if (!user || !clientId || !type || !resourceId) return false;
    const token = await user.getIdToken();
    const response = await fetch('/.netlify/functions/notify-activity', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ clientId, type, resourceId })
    });
    if (!response.ok) {
      console.warn('Aviso push no enviado:', response.status);
      return false;
    }
    return true;
  } catch (error) {
    // La actividad del atleta ya está guardada; el push es secundario.
    console.warn('Push temporalmente no disponible:', error);
    return false;
  }
}
