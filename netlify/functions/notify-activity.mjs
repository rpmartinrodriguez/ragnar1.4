import { verifyFirebaseUser, getFirestoreDoc, createFirestoreDoc, sendFcmToken } from '../lib/firebaseRest.mjs';

const allowedTypes = new Set([
  'message', 'workout_completed', 'missed_workout',
  'session_assigned', 'session_note', 'training_note', 'training_log',
  'student_linked', 'payment_recorded'
]);
const response = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  body: JSON.stringify(body)
});

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Método no permitido' });
  try {
    // Impedir avisos desde previews que utilicen la base de producción.
    if (process.env.CONTEXT && process.env.CONTEXT !== 'production' &&
        (!process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID === 'ragnar-training')) {
      return response(503, { error: 'Se requiere un proyecto Firebase de pruebas.' });
    }
    const match = /^Bearer (.+)$/.exec(event.headers.authorization || event.headers.Authorization || '');
    const uid = await verifyFirebaseUser(match?.[1]);
    if (!uid) return response(401, { error: 'Sesión inválida' });

    const { clientId, type, resourceId } = JSON.parse(event.body || '{}');
    const safeId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
    if (!safeId(clientId) || !safeId(resourceId) || !allowedTypes.has(type)) {
      return response(400, { error: 'Evento inválido' });
    }
    const client = await getFirestoreDoc('clients/' + clientId);
    if (!client) return response(404, { error: 'Alumno inexistente' });
    const isStudent = client.studentUserId === uid;
    const isTrainer = client.trainerId === uid;
    if (!isStudent && !isTrainer) return response(403, { error: 'Sin acceso a este alumno' });

    let recipientId = '';
    let title = 'Ragnar Training';
    let body = '';
    const byStudent = isStudent && !isTrainer;
    const studentName = String(client.name || 'Un atleta').slice(0, 60);
    let source = null;

    if (type === 'student_linked' && byStudent && resourceId === clientId) {
      recipientId = client.trainerId;
      title = 'Atleta vinculado';
      body = studentName + ' activó su cuenta Ragnar.';
    } else if (type === 'payment_recorded' && isTrainer) {
      source = await getFirestoreDoc('clients/' + clientId + '/payments/' + resourceId);
      if (source?.status !== 'paid') return response(409, { error: 'Pago sin registrar' });
      recipientId = client.studentUserId;
      title = 'Pago registrado';
      body = 'Tu coach registró tu pago en Ragnar.';
    } else if (type === 'message') {
      source = await getFirestoreDoc('clients/' + clientId + '/messages/' + resourceId);
      if (!source || (byStudent ? source.sender !== 'student' : source.sender !== 'trainer')) return response(403, { error: 'Mensaje no autorizado' });
      recipientId = byStudent ? client.trainerId : client.studentUserId;
      title = byStudent ? 'Mensaje de ' + studentName : 'Nuevo mensaje de tu coach';
      body = 'Tenés un mensaje nuevo en Ragnar.';
    } else if (type === 'workout_completed' && byStudent) {
      source = await getFirestoreDoc('clients/' + clientId + '/sessions/' + resourceId);
      if (!source?.isFinalized) return response(409, { error: 'Sesión sin finalizar' });
      recipientId = client.trainerId;
      title = 'Entrenamiento completado';
      body = studentName + ' finalizó su rutina.';
    } else if (type === 'missed_workout' && byStudent) {
      source = await getFirestoreDoc('clients/' + clientId + '/sessions/' + resourceId);
      if (!source?.missedReason) return response(409, { error: 'Sin motivo registrado' });
      recipientId = client.trainerId;
      title = 'Inasistencia registrada';
      body = studentName + ' dejó una observación sobre su entrenamiento.';
    } else if (type === 'session_note' && byStudent) {
      source = await getFirestoreDoc('clients/' + clientId + '/sessions/' + resourceId);
      if (!String(source?.studentNote || '').trim()) return response(409, { error: 'Nota vacía' });
      recipientId = client.trainerId;
      title = 'Nueva nota de entrenamiento';
      body = studentName + ' dejó una observación.';
    } else if (type === 'session_assigned' && isTrainer) {
      source = await getFirestoreDoc('clients/' + clientId + '/sessions/' + resourceId);
      if (!Array.isArray(source?.exercises) || !source.exercises.length) return response(409, { error: 'Rutina vacía' });
      recipientId = client.studentUserId;
      title = 'Tu coach actualizó una rutina';
      body = 'Ingresá a Ragnar para ver tu planificación.';
    } else if ((type === 'training_note' || type === 'training_log') && client.serviceMode === 'presencial') {
      source = await getFirestoreDoc('clients/' + clientId + '/trainingLogs/' + resourceId);
      if (!source || source.authorUid !== uid || (type === 'training_note' && !String(source.notes || '').trim())) {
        return response(403, { error: 'Bitácora no autorizada' });
      }
      recipientId = byStudent ? client.trainerId : client.studentUserId;
      title = byStudent ? 'Registro de ' + studentName : 'Nuevo registro de tu coach';
      body = type === 'training_note' ? 'Se agregó una nota a la bitácora.' : 'Se registró un ejercicio presencial.';
    } else {
      return response(403, { error: 'Evento no autorizado para este perfil' });
    }

    if (!recipientId) return response(200, { ok: true, delivered: 0, reason: 'Destinatario sin vincular' });

    // Dedupe determinista: evita una repetición por reintentos o doble clic.
    const eventKey = clientId + '_' + type + '_' + resourceId;
    const created = await createFirestoreDoc('notificationDispatch', eventKey, {
      actorUid: uid, recipientId, type, clientId, resourceId
    });
    if (!created) return response(200, { ok: true, duplicate: true, delivered: 0 });

    if (byStudent && (type === 'session_note' || type === 'training_note' || type === 'training_log' || type === 'student_linked')) {
      await createFirestoreDoc('trainerNotifications', 'evt_' + eventKey, {
        type: type === 'student_linked' ? 'student_linked' : type === 'training_log' ? 'training_log' : 'training_note',
        clientId, clientName: studentName, trainerId: client.trainerId,
        title, body, read: false,
        // Para consultas existentes, la fecha se completa desde el servidor en la siguiente versión.
        createdAt: new Date().toISOString()
      });
    }

    const devices = await getFirestoreDoc('pushDevices/' + recipientId);
    const tokens = [...new Set((devices?.tokens || []).filter((v) => typeof v === 'string'))].slice(0, 10);
    const attempts = await Promise.allSettled(tokens.map(token => sendFcmToken(token, title, body, eventKey)));
    const delivered = attempts.filter((attempt) => attempt.status === 'fulfilled').length;
    for (const failure of attempts.filter((attempt) => attempt.status === 'rejected')) {
      console.error('Entrega FCM fallida:', failure.reason?.message || failure.reason);
    }
    return response(200, { ok: true, delivered });
  } catch (error) {
    console.error('notify-activity:', error);
    return response(500, { error: 'No se pudo procesar la notificación' });
  }
};
