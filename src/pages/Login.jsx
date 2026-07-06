import React, { useState } from "react";
// تم استيراد auth من ملف الـ Auth، و db من ملف البيانات
import { auth } from "../config/firebaseAuth";
import { db } from "../config/firebaseData";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
} from "lucide-react";

const Login = ({ onLoginSuccess, blockedMessage }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // استخدام auth الخاص بملف تسجيل الدخول
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      // استخدام db الخاص بملف البيانات
      const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));

      if (!userDoc.exists()) {
        setError("هذا الحساب غير موجود داخل قاعدة البيانات.");
        await auth.signOut();
        setLoading(false);
        return;
      }

      const userData = userDoc.data();
      if (userData.hasAccess === false) {
        setError("تم إيقاف صلاحية هذا الحساب.");
        await auth.signOut();
        setLoading(false);
        return;
      }

      onLoginSuccess({
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        ...userData
      });
    } catch (err) {
      console.log(err);
      setError("البريد الإلكتروني أو كلمة المرور غير صحيحة.");
    }
    setLoading(false);
  };

  return (
    // ... بقية الـ UI كما هو تماماً (لم يتم تعديله)
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "linear-gradient(135deg, #F7FAFC 0%, #FFF6EF 100%)",
        fontFamily: "system-ui, sans-serif",
        overflow: "hidden",
        position: "fixed",
        top: 0,
        left: 0
      }}
    >
      {/* ... باقي الكود (CSS و Form) كما هو ... */}
      <div className="loginCard" style={{ width: "100%", maxWidth: "450px", padding: "40px", background: "white", borderRadius: "40px", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.15)", border: "1px solid rgba(255,255,255,0.3)", margin: "20px" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <img
            src="/Aqar House.jpg"
            alt="Aqar House"
            onError={(e) => { e.target.style.display = "none"; }}
            style={{ width: "72px", height: "72px", borderRadius: "20px", objectFit: "cover", marginBottom: "14px" }}
          />
          <h1 style={{ color: "#2A434D", fontSize: "28px", fontWeight: "800", margin: "0" }}>Aqar House</h1>
        </div>
        {blockedMessage && (
          <div style={{ background: "#FFF2F2", color: "#D93C3C", padding: "12px", borderRadius: "15px", marginBottom: "20px", textAlign: "center", fontWeight: "700", fontSize: "14px", border: "1px solid #FFD3D3" }}>
            {blockedMessage}
          </div>
        )}
        {error && <div style={{ background: "#FFF2F2", color: "#D93C3C", padding: "12px", borderRadius: "15px", marginBottom: "20px", textAlign: "center", fontWeight: "600", fontSize: "14px" }}>{error}</div>}
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: "25px", position: "relative" }}>
            <Mail size={20} color="#FF8C42" style={{ position: "absolute", right: "16px", top: "18px" }} />
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="البريد الإلكتروني" style={{ width: "100%", padding: "16px 45px 16px 16px", borderRadius: "18px", border: "1px solid #E6EDF3", background: "#F8FAFC", fontSize: "15px", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: "35px", position: "relative" }}>
            <Lock size={20} color="#FF8C42" style={{ position: "absolute", right: "16px", top: "18px" }} />
            <input type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="كلمة المرور" style={{ width: "100%", padding: "16px 45px 16px 45px", borderRadius: "18px", border: "1px solid #E6EDF3", background: "#F8FAFC", fontSize: "15px", boxSizing: "border-box" }} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: "absolute", left: "16px", top: "15px", background: "none", border: "none", cursor: "pointer", color: "#88989E" }}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button>
          </div>
          <button type="submit" disabled={loading} style={{ width: "100%", padding: "16px", border: "none", borderRadius: "18px", background: loading ? "#CFCFCF" : "linear-gradient(135deg,#FF8C42,#FFA45E)", color: "white", fontSize: "16px", fontWeight: "700", cursor: loading ? "not-allowed" : "pointer", transition: "0.3s" }}>
            {loading ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;