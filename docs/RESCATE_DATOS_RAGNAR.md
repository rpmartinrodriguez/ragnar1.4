# Ragnar — recuperar datos sin acceso al panel anterior

Rama independiente: rescue/ragnar-data-export-2026-11. No modificar ni fusionar main hasta verificar el respaldo.

## 1. Qué permite

La app usa Firebase Authentication con correo y contraseña (independiente del acceso a Gmail/Workspace). La configuración pública del proyecto Firestore original está en src/firebase.js.

En una sesión válida de entrenador, ir a **Configuración → Rescate de datos → Descargar respaldo**. Se obtiene un archivo JSON con documentos y rutas completas, preservando fechas y tipos de Firestore.

La exportación recorre:
- Los documentos de clients asignados al UID del entrenador autenticado.
- Subcolecciones clients/{id}/sessions, messages, payments y, cuando es accesible, trainingLogs.
- exercises, routines, trainerNotifications, communityFeed y settings/general.
- Reporte de errores, advertencias y conteos.

Este es un respaldo de la información conocida por el código y accesible con las reglas de Firebase. La API Web no puede enumerar colecciones desconocidas ni suplantar permisos de administrador. Un respaldo sin errores tampoco garantiza que no existan colecciones no contempladas.

NO exporta: Firebase Authentication (usuarios/contraseñas), archivos Cloud Storage, claves privadas, reglas de seguridad, índices ni funciones de Netlify. Los datos de sesión del usuario permanecen sujetos a las reglas existentes.

## 2. Usarlo SIN Netlify

En un equipo con Node.js y Git:

1. Abrir la carpeta de trabajo.
2. Ejecutar:

    git clone https://github.com/rpmartinrodriguez/ragnar1.4.git
    cd ragnar1.4
    git checkout rescue/ragnar-data-export-2026-11
    npm ci
    npm run dev

3. Abrir la dirección localhost que indica Vite (generalmente http://localhost:5173).
4. Ingresar con las credenciales de Firebase Authentication del entrenador original. **No** es necesariamente la contraseña actual del correo empresarial: se trata de credenciales de Ragnar.
5. Ir a Configuración, descargar el JSON y verificar conteos y errores.

Si Firebase deniega lecturas o la cuenta no puede autenticarse, no hay forma de forzar la exportación desde la app. Solicitar acceso legítimo al propietario/administrador del proyecto original o un respaldo administrativo.

No escribir el respaldo ni credenciales en GitHub. Guardar el archivo en almacenamiento seguro y, si se traslada fuera del equipo, cifrarlo.

## 3. Migración a Firebase propio (después del respaldo)

1. Crear Firebase bajo el correo personal.
2. Crear Authentication, Firestore y reglas correspondientes a la versión del proyecto.
3. Crear primero un entrenador en Authentication y registrar su UID nuevo.
4. Preparar una importación que conserve los ID de los documentos y convierta correctamente fechas/tipos Firestore.
5. Reemplazar los trainerId del entrenador anterior por el UID nuevo; desvincular o reconciliar los studentUserId antiguos según las nuevas cuentas. NO limitarse a cargar el JSON: sin reconciliar los UID, los entrenadores y alumnos pueden perder acceso a sus perfiles.
6. Validar conteos por colección, subcolecciones y relaciones, y pruebas de inicio de sesión antes de cambiar la app.
7. Desplegar en un nuevo Netlify conectado al repositorio, apuntando solo al proyecto propio.

**Importante**: este commit implementa solo la extracción de lectura y descarga local, NO la importación al nuevo Firebase. No se ha comprobado el acceso real a la base antigua porque no tenemos credenciales de entrenador ni acceso al proyecto.
