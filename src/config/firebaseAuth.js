import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyASD71U-VBfdGLYMSblG9bp1SWnf8tO3_I",
  authDomain: "new-capital-project-c3e66.firebaseapp.com",
  databaseURL: "https://new-capital-project-c3e66-default-rtdb.firebaseio.com",
  projectId: "new-capital-project-c3e66",
  storageBucket: "new-capital-project-c3e66.firebasestorage.app",
  messagingSenderId: "1091034936436",
  appId: "1:1091034936436:web:055c6c38997e61d789cd21",
  measurementId: "G-BKM2P342HZ"
};

// استخدام الطريقة الاحترافية لتجنب تكرار الـ App عند إعادة التحميل
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// تصدير الـ auth لاستخدامه في تسجيل الدخول (Named Export)
export const auth = getAuth(app);

// تصدير الـ analytics
export const analytics = getAnalytics(app);

// تصدير افتراضي للـ app
export default app;