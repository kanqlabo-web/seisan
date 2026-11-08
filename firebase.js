// ========================================
// Firebase
// ========================================

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
  getFirestore
} from
  "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";


const firebaseConfig = {
  apiKey: "AIzaSyBKbP74L4MwAOhwFXFNZbd1DFFv9M68Awo",
  authDomain: "k-sha-kun.firebaseapp.com",
  projectId: "k-sha-kun",
  storageBucket: "k-sha-kun.firebasestorage.app",
  messagingSenderId: "573497625446",
  appId: "1:573497625446:web:e056913eecdb00cac7d6a7"
};


const app = initializeApp(firebaseConfig);

const db = getFirestore(app);


export { db };