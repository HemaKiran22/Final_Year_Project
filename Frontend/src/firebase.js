// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
// 🔁 REPLACE THIS ENTIRE OBJECT WITH THE ONE FROM YOUR FIREBASE CONSOLE
const firebaseConfig = {
  apiKey: "AIzaSyAuIc-OPQuIwyXGTApb-tO8v8PEVovWgFo",
  authDomain: "colonycarpool.firebaseapp.com",
  projectId: "colonycarpool",
  storageBucket: "colonycarpool.firebasestorage.app",
  messagingSenderId: "289378792340",
  appId: "1:289378792340:web:9936cd805095a2155d9581",
  measurementId: "G-K44BBME7ED"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;