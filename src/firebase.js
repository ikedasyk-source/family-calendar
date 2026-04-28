import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage"; 

const firebaseConfig = {
  apiKey: "AIzaSyBLsyk5hMnnJ3Ivz4Fxx5_0zHjrF1c0hKc",
  authDomain: "family-calendar-436c6.firebaseapp.com",
  projectId: "family-calendar-436c6",
  storageBucket: "family-calendar-436c6.firebasestorage.app",
  messagingSenderId: "796709848684",
  appId: "1:796709848684:web:e9382daf7983ad9d0afa49"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app); 