import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyCkJCb5jQSHI3uy0z034Hkihf_03E1c0nU",
  authDomain: "habits-845c1.firebaseapp.com",
  projectId: "habits-845c1",
  storageBucket: "habits-845c1.firebasestorage.app",
  messagingSenderId: "551765040095",
  appId: "1:551765040095:web:0cfdaf4b7bc0e606b5826a"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
