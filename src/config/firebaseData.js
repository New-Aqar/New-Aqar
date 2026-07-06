import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage"; // 1. استيراد خدمة الـ Storage من الفايربيز
import app from "./firebaseAuth"; 

// 2. تهيئة وتصدير الخدمات بشكل مستقل
export const db = getFirestore(app);           // قاعدة بيانات Firestore
export const rtdb = getDatabase(app);          // قاعدة بيانات Realtime Database
export const storage = getStorage(app);        // خدمة الـ Storage لرفع الملفات والصور