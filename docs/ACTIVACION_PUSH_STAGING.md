# Ragnar — activar branch de prueba, Firebase y Push

## Qué quedó implementado

- Modalidad del alumno: `plan` (por defecto) o `presencial`.
- Bitácora compartida en `clients/{clientId}/trainingLogs`, disponible solo en presencial.
- Notas de sesión del alumno en `sessions/{fecha}.studentNote` para ambos modos.
- Notificaciones web para mensajes alumno↔coach, rutina asignada, rutina terminada, ausencia, notas y bitácora.
- Dispositivos autorizados en `pushDevices/{uid}`; deduplicación de eventos en `notificationDispatch`.
- Menos reconexiones a sesiones y sin pantalla de carga artificial.

## Aislamiento: obligatorio antes de usar el preview

La rama de GitHub NO separa Firestore. El deploy de prueba quedó BLOQUEADO hasta configurar Firebase de **staging**, para que no toque alumnos de producción.

1. Crear un nuevo proyecto Firebase separado (por ejemplo, `ragnar-training-test`).
2. Habilitar Authentication (Email/Password), Firestore y Cloud Messaging.
3. Registrar una app Web Firebase en staging y copiar sus seis valores de configuración a Netlify con contexto **Deploy Previews y Branch deploys**:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
4. En Firebase Console → Project settings → Cloud Messaging → Web Push certificates, generar una clave Web Push (VAPID). Pegar **solo la pública** como `VITE_FIREBASE_VAPID_PUBLIC_KEY` en Netlify.
5. Crear una cuenta de servicio de staging con acceso limitado a Firestore y FCM. Guardar su JSON **solo en variables secretas de Netlify** como `FIREBASE_SERVICE_ACCOUNT_JSON` (scope Functions). Nunca subir ese JSON a GitHub.
6. Configurar también `FIREBASE_PROJECT_ID` y `FIREBASE_WEB_API_KEY` (API key Web de staging, no privada) para Functions. Deben coincidir con el proyecto del frontend.
7. Habilitar la API **Firebase Cloud Messaging API (V1)** en Google Cloud si no estuviera habilitada. Volver a ejecutar el deploy después de cambiar variables.
8. En Firestore Rules, incorporar las reglas de `firebase/rules-additions.rules` dentro del bloque existente. NO reemplazar las reglas completas: Ragnar también usa `clients`, `sessions`, `messages`, `payments`, `settings`, `trainerNotifications`, `communityFeed`, `exercises` y `routines`.
9. En Firestore de staging, crear `trainers/{UID_DEL_COACH}` con `active: true`. El UID proviene de Firebase Authentication. Dar de alta un coach y un alumno de prueba; vincular mediante el link desde la app.
10. En Netlify → **Project configuration → Developer settings → Continuous deployment → Branches and deploy contexts**, habilitar Deploy Previews o Branch deploys para esta rama. Abrir el link de preview (no `main`).

## Validación funcional

- Coach: crear un alumno `Presencial`, ingresar en su ficha y abrir **Bitácora presencial**.
- Alumno: vincularse, entrar a **Perfil**, guardar ejercicio y observación y confirmar su aparición en la ficha del coach.
- Ambos: ingresar a Perfil/Configuración y activar notificaciones en el dispositivo (requiere permiso y HTTPS).
- Alumno: mandar un chat y terminar un entrenamiento; el coach debe recibir aviso con navegador fuera de foco.
- Coach: mandar un chat y asignar una sesión; el alumno debe recibir aviso.
- Nota del alumno: abrir una sesión, guardar nota, y verificar que el coach la vea.
- Repetir eventos, revisar que no haya duplicados y verificar funcionamiento sin permiso push.
- iOS: probar con la web instalada como app en la pantalla de inicio. La compatibilidad depende del navegador/SDK y debe verificarse en dispositivo real.

## Seguridad y límites

- El servicio de Netlify valida ID token de Firebase, pertenencia del alumno y existencia del evento antes de notificar.
- Los avisos no incluyen texto privado del mensaje en la pantalla de bloqueo.
- No hay envíos automáticos por cambios realizados **fuera** de la app: son eventos disparados por sus flujos implementados.
- Antes de aplicar reglas de producción, auditar especialmente la invitación/vinculación del alumno y las consultas de notificaciones existentes.
- El historial es inmutable y limitado a 50 registros recientes en la vista (los demás permanecen en Firestore).
- No desplegar `main` hasta revisar el preview y hacer las pruebas con ambos roles.
