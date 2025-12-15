// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCCDCZz07zJAi-qhqsf4nQzyePNoynh8zY",
  authDomain: "colonycarpool-3d543.firebaseapp.com",
  projectId: "colonycarpool-3d543",
  storageBucket: "colonycarpool-3d543.firebasestorage.app",
  messagingSenderId: "96179573561",
  appId: "1:96179573561:web:87eb1de9825800b0a4cee8",
  measurementId: "G-YRLHSLTWX7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;