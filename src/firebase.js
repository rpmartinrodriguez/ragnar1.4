// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore'; // Importamos la base de datos

// Tu configuración (La que me pasaste)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAtzIf6JGLQuDVYc6poZAOMgmjEzbEaZk0',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'ragnar-training.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'ragnar-training',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'ragnar-training.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '727763697342',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:727763697342:web:094a55944d708a80f568ef',
};

// 1. Inicializar Firebase
export const isPreviewMissingFirebase = import.meta.env.VITE_RAGNAR_PREVIEW === 'true' &&
  (!import.meta.env.VITE_FIREBASE_API_KEY || !import.meta.env.VITE_FIREBASE_PROJECT_ID ||
  !import.meta.env.VITE_FIREBASE_APP_ID);

const app = initializeApp(firebaseConfig);
export { app };

// 2. Inicializar y exportar la Base de Datos (Firestore)
export const db = getFirestore(app);
