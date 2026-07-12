import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCh70QAV0s_GbcXcWOmfHxvML4DNyVyQC8",
  authDomain: "ascendmaxx-2075b.firebaseapp.com",
  projectId: "ascendmaxx-2075b",
  storageBucket: "ascendmaxx-2075b.firebasestorage.app",
  messagingSenderId: "472245540299",
  appId: "1:472245540299:web:e6a218339e8011f48e124e",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);