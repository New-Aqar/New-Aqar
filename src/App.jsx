import React, { useState, useEffect } from 'react';
// تم تعديل مسارات الاستيراد للعمل مع التقسيم الجديد للملفات
import { auth } from './config/firebaseAuth';
import { db, rtdb } from './config/firebaseData';
import { ref, set, onValue, onDisconnect } from 'firebase/database';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

import Login from './pages/Login';
import Showcase from './pages/Showcase';
import EmployeeDashboard from './pages/EmployeeDashboard';
import AdminDashboard from './pages/AdminDashboard';

function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('showcase');
  const [loading, setLoading] = useState(true); 

  const fallbackLogo = "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=100";

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const userData = { uid: firebaseUser.uid, ...userDoc.data() };
            setUser(userData);
            
            if (userData.role === 'admin') {
              setView('admin');
            } else {
              setView('showcase');
            }
          } else {
            setUser({
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || 'مستعمل عقارات',
              role: 'employee' 
            });
          }
        } catch (error) {
          console.error("Error fetching user role on refresh:", error);
        }
      } else {
        setUser(null);
      }
      setLoading(false); 
    });

    return () => unsubscribeAuth();
  }, []);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    if (userData.role === 'admin') {
      setView('admin');
    } else {
      setView('showcase');
    }
  };

  useEffect(() => {
    if (!user || user.role !== 'employee') return;

    const connectedRef = ref(rtdb, '.info/connected');
    const myStatusRef = ref(rtdb, `status/${user.uid}`);

    const unsubscribe = onValue(connectedRef, (snapshot) => {
      if (snapshot.val() === true) {
        onDisconnect(myStatusRef)
          .set({
            name: user.name,
            status: 'offline',
            lastChanged: new Date().toISOString(),
          })
          .then(() => {
            set(myStatusRef, {
              name: user.name,
              status: 'online',
              lastChanged: new Date().toISOString(),
            });
          });
      }
    });

    return () => unsubscribe();
  }, [user]);

  const handleLogout = async () => {
    if (user && user.role === 'employee') {
      const myStatusRef = ref(rtdb, `status/${user.uid}`);
      await set(myStatusRef, {
        name: user.name,
        status: 'offline',
        lastChanged: new Date().toISOString(),
      });
    }

    await auth.signOut();
    setUser(null);
    setView('showcase');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif', color: '#2A434D', background: '#F8FAFC' }}>
        <h3 style={{ direction: 'rtl' }}>جاري التحقق من الحساب وتأمين الاتصال...</h3>
      </div>
    );
  }

  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  if (user.role === 'admin') {
    return (
      <div>
        <div
          style={{
            background: '#2A434D',
            color: '#fff',
            padding: '18px 30px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
          dir="rtl"
        >
          <span style={{ fontWeight: '700', fontSize: '20px' }}>لوحة الإدارة</span>
          <button
            onClick={handleLogout}
            style={{
              background: 'linear-gradient(135deg,#FF8C42,#FFA45E)',
              border: 'none',
              color: '#fff',
              padding: '10px 20px',
              borderRadius: '50px',
              cursor: 'pointer',
              fontWeight: '600',
            }}
          >
            تسجيل الخروج
          </button>
        </div>
        <AdminDashboard currentUser={user} />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: "#F8FAFC",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <nav
        dir="rtl"
        style={{
          background: "#ffffff",
          padding: "18px 35px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "0 12px 35px rgba(0,0,0,.05)",
          borderBottom: "1px solid #EEF2F7",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <img
            src="/aqar-logo.jpg"
            alt="Aqar House"
            onError={(e) => {
              e.target.onerror = null; 
              e.target.src = fallbackLogo;
            }}
            style={{ width: "52px", height: "52px", borderRadius: "14px", objectFit: "cover" }}
          />
          <span style={{ fontWeight: "700", color: "#2A434D", fontSize: "22px" }}>Aqar House</span>
          
          <button
            onClick={() => setView("showcase")}
            style={{
              border: "none", cursor: "pointer", padding: "12px 22px", borderRadius: "50px",
              background: view === "showcase" ? "linear-gradient(135deg,#FF8C42,#FFA45E)" : "#FFF6EF",
              color: view === "showcase" ? "#fff" : "#2A434D", fontWeight: "600",
            }}
          >
            🏠 واجهة العرض
          </button>

          <button
            onClick={() => setView("upload")}
            style={{
              border: "none", cursor: "pointer", padding: "12px 22px", borderRadius: "50px",
              background: view === "upload" ? "linear-gradient(135deg,#FF8C42,#FFA45E)" : "#FFF6EF",
              color: view === "upload" ? "#fff" : "#2A434D", fontWeight: "600",
            }}
          >
            📊 رفع ملف Excel
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <div style={{ background: "#FFF6EF", padding: "10px 18px", borderRadius: "50px", color: "#2A434D", fontWeight: "600" }}>
            👤 {user.name}
          </div>
          <button
            onClick={handleLogout}
            style={{
              background: "linear-gradient(135deg,#FF8C42,#FFA45E)",
              color: "#fff", border: "none", padding: "12px 22px", borderRadius: "50px",
              cursor: "pointer", fontWeight: "600", boxShadow: "0 10px 25px rgba(255,140,66,.25)",
            }}
          >
            تسجيل الخروج
          </button>
        </div>
      </nav>

      {view === "showcase" ? (
        <Showcase currentUser={user} onLogout={handleLogout} />
      ) : (
        <EmployeeDashboard currentUser={user} onLogout={handleLogout} />
      )}
    </div>
  );
}

export default App;