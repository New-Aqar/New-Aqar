import React, { useState, useEffect } from "react";
// استبدل السطر القديم بهذا:
import { db, rtdb } from "../config/firebaseData";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp
} from "firebase/firestore";
import { ref, onValue } from "firebase/database";

const AdminDashboard = () => {
  const [employees, setEmployees] = useState([]);
  const [uploadLogs, setUploadLogs] = useState([]);
  const [loadingLogId, setLoadingLogId] = useState(null); 
  const [previewLog, setPreviewLog] = useState(null); 
  
  // حالات جديدة لعرض التفاصيل وإدارة الحجز
  const [selectedProperty, setSelectedProperty] = useState(null);

  // حالة اتصال الموظفين اللحظية (أونلاين / أوفلاين) القادمة من الـ Realtime Database
  const [presenceMap, setPresenceMap] = useState({});

  useEffect(() => {
    // 1. الاستماع لحسابات الموظفين
    const unsubscribeUsers = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const users = [];
        snapshot.forEach((item) => {
          const data = item.data();
          if (data.role === "employee") {
            users.push({
              uid: item.id,
              ...data,
            });
          }
        });
        setEmployees(users);
      }
    );

    // 2. الاستماع لسجل الملفات المرفوعة الحديث الموحد
    const unsubscribeLogs = onSnapshot(
      collection(db, "uploaded_files_log"),
      (snapshot) => {
        const logs = [];
        snapshot.forEach((item) => {
          logs.push({
            id: item.id,
            ...item.data(),
          });
        });

        logs.sort((a, b) => {
          const dateA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
          const dateB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
          return dateB - dateA;
        });

        setUploadLogs(logs);
      }
    );

    // 3. الاستماع اللحظي لحالة اتصال كل الموظفين (Realtime Database)
    const statusRef = ref(rtdb, "status");
    const unsubscribePresence = onValue(statusRef, (snapshot) => {
      setPresenceMap(snapshot.val() || {});
    });

    return () => {
      unsubscribeUsers();
      unsubscribeLogs();
      unsubscribePresence();
    };
  }, []);

  // دالة مساعدة: هل الموظف متصل الآن فعلياً (حسب الـ Realtime Database)؟
  const isEmployeeOnline = (uid) => presenceMap?.[uid]?.status === "online";

  // صلاحية حظر وتفعيل الموظف
  const toggleAccess = async (userId, currentStatus) => {
    const willBlock = currentStatus; // لو الحالة الحالية مفعّلة، يبقى الإجراء هيحوّلها لحظر
    const confirmMsg = willBlock
      ? "هل أنت متأكد من حظر هذا الموظف؟ سيتم تسجيل خروجه فوراً ولن يستطيع الدخول مرة أخرى حتى تفعيل حسابه."
      : "هل تريد إعادة تفعيل صلاحية هذا الموظف؟";

    if (!window.confirm(confirmMsg)) return;

    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        hasAccess: !currentStatus,
      });
      alert(willBlock ? "🚫 تم حظر الموظف بنجاح، وسيتم تسجيل خروجه فوراً." : "✅ تم تفعيل صلاحية الموظف بنجاح.");
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء تحديث الصلاحية");
    }
  };

  // دالة حذف عقار معين من داخل المعاينة قبل أو بعد النشر
  const handleDeletePropertyFromLog = async (logId, propertyIndex) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا العقار من هذا الملف؟")) return;

    try {
      const logRef = doc(db, "uploaded_files_log", logId);
      const updatedProperties = [...previewLog.propertiesData];
      updatedProperties.splice(propertyIndex, 1);

      await updateDoc(logRef, {
        propertiesData: updatedProperties,
        recordsCount: updatedProperties.length
      });

      setPreviewLog({
        ...previewLog,
        propertiesData: updatedProperties,
        recordsCount: updatedProperties.length
      });
      alert("🗑️ تم حذف العقار بنجاح من قائمة الملف.");
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء حذف العقار.");
    }
  };

  // دالة تحديث حالة الحجز لعقار معين داخل الملف المعاين
  const handleToggleBooking = async (logId, propertyIndex, currentBookingStatus) => {
    try {
      const logRef = doc(db, "uploaded_files_log", logId);
      const updatedProperties = [...previewLog.propertiesData];
      
      // تبديل حالة الحجز
      updatedProperties[propertyIndex].isBooked = !currentBookingStatus;

      await updateDoc(logRef, {
        propertiesData: updatedProperties
      });

      setPreviewLog({
        ...previewLog,
        propertiesData: updatedProperties
      });
      alert(updatedProperties[propertyIndex].isBooked ? "📌 تم حجز العقار بنجاح" : "🔓 تم إلغاء حجز العقار");
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء تحديث حالة الحجز.");
    }
  };

  // دالة اعتماد وتطبيق عقارات الملف على السيستم ونشرها في الـ properties
  const handleApplyProperties = async (logItem) => {
    if (!logItem.propertiesData || logItem.propertiesData.length === 0) {
      alert("❌ هذا الملف لا يحتوي على بيانات عقارات صالحة للتطبيق.");
      return;
    }

    if (!window.confirm(`هل أنت متأكد من اعتماد ونشر (${logItem.propertiesData.length}) عقار في السيستم؟`)) {
      return;
    }

    setLoadingLogId(logItem.id);

    try {
      const batch = writeBatch(db);
      const propertiesCollection = collection(db, "properties");

      logItem.propertiesData.forEach((prop) => {
        const uniqueId = `excel_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;
        const docRef = doc(propertiesCollection, uniqueId);
        
        // حماية الروابط المكسورة أو روابط البلوب المحلية
        const cleanImages = Array.isArray(prop.images) 
          ? prop.images.filter(img => img && !img.startsWith("blob:")) 
          : [];

        batch.set(docRef, {
          ...prop,
          images: cleanImages, 
          status: prop.isBooked ? "booked" : "available", 
          uploadedBy: logItem.uploadedBy,
          employeeName: logItem.employeeName,
          fromFileId: logItem.id, 
          timestamp: serverTimestamp()
        });
      });

      await batch.commit();

      const logRef = doc(db, "uploaded_files_log", logItem.id);
      await updateDoc(logRef, {
        status: "applied",
        appliedAt: serverTimestamp()
      });

      alert("🎉 تم اعتماد وتطبيق العقارات بنجاح ونشرها بالسيستم!");
    } catch (error) {
      console.error(error);
      alert("❌ حدث خطأ أثناء تطبيق العقارات، يرجى مراجعة قاعدة البيانات.");
    } finally {
      setLoadingLogId(null);
    }
  };

  const formatDateTime = (date) => {
    if (!date) return "-";
    const d = typeof date === "string" ? new Date(date) : date?.toDate?.() || new Date(date);
    return d.toLocaleString("ar-EG", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F8FAFC",
        padding: "35px",
        direction: "rtl",
        fontFamily: "system-ui,sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "#fff",
          borderRadius: "30px",
          padding: "28px 35px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "30px",
          boxShadow: "0 18px 45px rgba(0,0,0,.05)",
        }}
      >
        <div>
          <div style={{ color: "#88989E", fontSize: "15px" }}>لوحة الإدارة الرئيسية التحكم والاعتماد</div>
          <h1 style={{ marginTop: "8px", color: "#2A434D", fontSize: "32px", fontWeight: "800" }}>
            Admin Dashboard
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <img src="/Aqar House.jpg" alt="logo" style={{ width: "62px", height: "62px", borderRadius: "18px" }} onError={(e) => e.target.style.display = 'none'} />
          <div>
            <div style={{ fontWeight: "700", color: "#2A434D", fontSize: "22px" }}>Aqar House</div>
            <div style={{ color: "#88989E", fontSize: "14px" }}>Real Estate System</div>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: "25px",
          marginBottom: "30px",
        }}
      >
        <div style={{ background: "#fff", borderRadius: "25px", padding: "28px", boxShadow: "0 15px 35px rgba(0,0,0,.05)" }}>
          <div style={{ color: "#88989E", fontSize: "14px", marginBottom: "10px" }}>إجمالي الموظفين</div>
          <div style={{ color: "#2A434D", fontWeight: "800", fontSize: "38px" }}>{employees.length}</div>
        </div>
        <div style={{ background: "#fff", borderRadius: "25px", padding: "28px", boxShadow: "0 15px 35px rgba(0,0,0,.05)" }}>
          <div style={{ color: "#88989E", fontSize: "14px", marginBottom: "10px" }}>الموظفون المتصلون</div>
          <div style={{ color: "#3BB273", fontWeight: "800", fontSize: "38px" }}>
            {employees.filter((e) => isEmployeeOnline(e.uid)).length}
          </div>
        </div>
        <div style={{ background: "#fff", borderRadius: "25px", padding: "28px", boxShadow: "0 15px 35px rgba(0,0,0,.05)" }}>
          <div style={{ color: "#88989E", fontSize: "14px", marginBottom: "10px" }}>الملفات المحفوظة بالسجل</div>
          <div style={{ color: "#FF8C42", fontWeight: "800", fontSize: "38px" }}>{uploadLogs.length}</div>
        </div>
      </div>

      {/* Content */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.9fr", gap: "28px" }}>
        
        {/* جدول الموظفين */}
        <div style={{ background: "#FFFFFF", borderRadius: "28px", padding: "28px", boxShadow: "0 18px 45px rgba(0,0,0,.05)" }}>
          <h2 style={{ color: "#2A434D", marginBottom: "25px", fontSize: "24px", fontWeight: "700" }}>الموظفون</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F8FAFC", color: "#88989E" }}>
                <th style={{ padding: "18px", textAlign: "right" }}>الاسم</th>
                <th style={{ padding: "18px", textAlign: "center" }}>الحالة</th>
                <th style={{ padding: "18px", textAlign: "center" }}>الصلاحية</th>
                <th style={{ padding: "18px", textAlign: "center" }}>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const online = isEmployeeOnline(emp.uid);
                return (
                <tr key={emp.uid} style={{ borderBottom: "1px solid #EEF2F7" }}>
                  <td style={{ padding: "18px", fontWeight: "600", color: "#2A434D" }}>
                    <span
                      title={online ? "متصل الآن" : "غير متصل"}
                      style={{
                        display: "inline-block",
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        marginLeft: "8px",
                        background: online ? "#22C55E" : "#9CA3AF",
                        boxShadow: online ? "0 0 0 3px rgba(34,197,94,0.18)" : "none",
                      }}
                    />
                    {emp.name}
                  </td>
                  <td style={{ padding: "18px", textAlign: "center" }}>
                    <span style={{ padding: "8px 18px", borderRadius: "30px", background: online ? "#EAFBF2" : "#F2F4F7", color: online ? "#28A745" : "#88989E", fontWeight: "700", fontSize: "13px" }}>
                      {online ? "متصل" : "غير متصل"}
                    </span>
                  </td>
                  <td style={{ padding: "18px", textAlign: "center" }}>
                    <span style={{ color: emp.hasAccess ? "#28A745" : "#E53935", fontWeight: "700" }}>
                      {emp.hasAccess ? "مفعل" : "محظور"}
                    </span>
                  </td>
                  <td style={{ padding: "18px", textAlign: "center" }}>
                    <button
                      onClick={() => toggleAccess(emp.uid, emp.hasAccess)}
                      style={{ border: "none", borderRadius: "14px", padding: "10px 18px", cursor: "pointer", color: "#fff", fontWeight: "600", background: emp.hasAccess ? "#E53935" : "#3BB273" }}
                    >
                      {emp.hasAccess ? "حظر" : "تفعيل"}
                    </button>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>

        {/* سجل ملفات Excel المرفوعة */}
        <div style={{ background: "#FFFFFF", borderRadius: "28px", padding: "25px", boxShadow: "0 18px 45px rgba(0,0,0,.05)", maxHeight: "720px", overflowY: "auto" }}>
          <h2 style={{ color: "#2A434D", marginBottom: "22px", fontWeight: "700" }}>سجل ملفات Excel المرفوعة والمعلقة</h2>
          {uploadLogs.length === 0 ? (
            <div style={{ color: "#88989E", textAlign: "center", marginTop: "40px" }}>لا توجد ملفات مرفوعة في السجل حالياً.</div>
          ) : (
            uploadLogs.map((log) => (
              <div 
                key={log.id} 
                style={{ 
                  background: log.status === "pending" ? "#FFF9F2" : "#F4FBF7", 
                  border: log.status === "pending" ? "1px dashed #FF8C42" : "1px solid #3BB273",
                  borderRadius: "18px", 
                  padding: "18px", 
                  marginBottom: "18px" 
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                  <div>
                    <div style={{ color: "#2A434D", fontWeight: "700", fontSize: "16px", marginBottom: "4px" }}>الموظف: {log.employeeName}</div>
                    <div style={{ color: "#5A6E75", fontSize: "14px", fontWeight: "600" }}>📄 اسم الملف: {log.fileName}</div>
                    <div style={{ color: "#88989E", fontSize: "13px", marginTop: "4px" }}>⏰ تاريخ الرفع: {formatDateTime(log.timestamp)}</div>
                  </div>
                  
                  <span style={{ 
                    padding: "6px 14px", 
                    borderRadius: "30px", 
                    fontSize: "12px", 
                    fontWeight: "700", 
                    background: log.status === "pending" ? "#FFE8D6" : "#E2F7ED", 
                    color: log.status === "pending" ? "#FF8C42" : "#28A745" 
                  }}>
                    {log.status === "pending" ? "⏳ معلق بالسجل" : "✅ تم التطبيق للشقق"}
                  </span>
                </div>

                <div style={{ background: "#fff", borderRadius: "12px", padding: "10px 15px", marginBottom: "12px", border: "1px solid #EFEFEF" }}>
                  <span style={{ color: "#2A434D", fontWeight: "700" }}>🔢 يحتوي على: </span>
                  <span style={{ color: "#FF8C42", fontWeight: "800" }}>{log.recordsCount} وحدة عقارية جاهزة</span>
                </div>
                
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  
                  <button
                    onClick={() => setPreviewLog(log)}
                    style={{ background: "#E2E8F0", color: "#475569", border: "none", padding: "8px 14px", borderRadius: "10px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}
                  >
                    👁️ معاينة وإدارة العقارات
                  </button>

                  {log.status === "pending" ? (
                    <button
                      onClick={() => handleApplyProperties(log)}
                      disabled={loadingLogId === log.id}
                      style={{ 
                        background: "#3BB273", 
                        color: "#fff", 
                        border: "none", 
                        padding: "8px 16px", 
                        borderRadius: "10px", 
                        fontSize: "13px", 
                        fontWeight: "700", 
                        cursor: "pointer",
                        opacity: loadingLogId === log.id ? 0.6 : 1
                      }}
                    >
                      {loadingLogId === log.id ? "⏳ جاري نشر العقارات..." : "⚡ تطبيق واعتماد العقارات بالسيستم"}
                    </button>
                  ) : (
                    <div style={{ color: "#3BB273", fontSize: "13px", fontWeight: "700", display: "flex", alignItems: "center" }}>
                      🔒 تم اعتماده بنجاح ونشر عقاراته.
                    </div>
                  )}

                  {log.fileUrl && (
                    <a 
                      href={log.fileUrl} 
                      target="_blank" 
                      rel="noreferrer" 
                      download={log.fileName || "excel-file.xlsx"}
                      style={{ background: "#2A434D", color: "#fff", textDecoration: "none", padding: "8px 14px", borderRadius: "10px", fontSize: "13px", fontWeight: "700", marginRight: "auto" }}
                    >
                      📥 تحميل Excel
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* النافذة المنبثقة (Modal) لمعاينة وإدارة محتويات ملف الإكسيل */}
      {previewLog && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 999 }}>
          <div style={{ background: "#fff", padding: "30px", borderRadius: "24px", width: "95%", maxWidth: "900px", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ margin: 0, color: "#2A434D", fontWeight: "800" }}>إدارة ومعاينة ملف: {previewLog.fileName}</h3>
              <button onClick={() => setPreviewLog(null)} style={{ background: "#EF4444", color: "#fff", border: "none", padding: "6px 12px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}>إغلاق ✖</button>
            </div>
            
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", textAlign: "right" }}>
              <thead>
                <tr style={{ background: "#F1F5F9", color: "#475569" }}>
                  <th style={{ padding: "12px" }}>العنوان</th>
                  <th style={{ padding: "12px" }}>الموقع</th>
                  <th style={{ padding: "12px" }}>السعر</th>
                  <th style={{ padding: "12px" }}>المساحة</th>
                  <th style={{ padding: "12px", textAlign: "center" }}>الإجراءات والتحكم</th>
                </tr>
              </thead>
              <tbody>
                {previewLog.propertiesData?.map((item, index) => (
                  <tr key={index} style={{ borderBottom: "1px solid #E2E8F0" }}>
                    <td style={{ padding: "12px", fontWeight: "600" }}>{item.title}</td>
                    <td style={{ padding: "12px", color: "#64748B" }}>{item.location}</td>
                    <td style={{ padding: "12px", color: "#10B981", fontWeight: "700" }}>{item.price?.toLocaleString()} ج.م</td>
                    <td style={{ padding: "12px" }}>{item.area} م²</td>
                    <td style={{ padding: "12px", display: "flex", gap: "8px", justifyContent: "center" }}>
                      
                      {/* زر التفاصيل */}
                      <button 
                        onClick={() => setSelectedProperty(item)}
                        style={{ background: "#0284C7", color: "#fff", border: "none", padding: "6px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}
                      >
                        👁️ التفاصيل
                      </button>

                      {/* زر الحجز (Booking) */}
                      <button 
                        onClick={() => handleToggleBooking(previewLog.id, index, item.isBooked)}
                        style={{ background: item.isBooked ? "#EA580C" : "#16A34A", color: "#fff", border: "none", padding: "6px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}
                      >
                        {item.isBooked ? "🤝 ملغى الحجز" : "📌 حجز"}
                      </button>

                      {/* زر الحذف (Delete) */}
                      <button 
                        onClick={() => handleDeletePropertyFromLog(previewLog.id, index)}
                        style={{ background: "#DC2626", color: "#fff", border: "none", padding: "6px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}
                      >
                        🗑️ حذف
                      </button>

                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* نافذة منبثقة فرعية لعرض تفاصيل العقار بدقة */}
      {selectedProperty && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", padding: "30px", borderRadius: "20px", width: "90%", maxWidth: "500px" }}>
            <h3 style={{ color: "#2A434D", marginBottom: "20px", borderBottom: "2px solid #F1F5F9", paddingBottom: "10px" }}>🏠 تفاصيل العقار الكاملة</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "15px" }}>
              <div><strong>العنوان:</strong> {selectedProperty.title}</div>
              <div><strong>الموقع:</strong> {selectedProperty.location}</div>
              <div><strong>السعر:</strong> {selectedProperty.price?.toLocaleString()} ج.م</div>
              <div><strong>المساحة:</strong> {selectedProperty.area} م²</div>
              <div><strong>الطابق:</strong> {selectedProperty.floor || "غير محدد"}</div>
              <div><strong>عدد الغرف:</strong> {selectedProperty.rooms || "غير محدد"}</div>
              <div><strong>الوصف:</strong> {selectedProperty.description || "لا يوجد وصف إضافي"}</div>
              <div><strong>حالة الحجز الحالية:</strong> {selectedProperty.isBooked ? "🔴 محجوز" : "🟢 متاح"}</div>
            </div>
            <button 
              onClick={() => setSelectedProperty(null)} 
              style={{ marginTop: "25px", width: "100%", background: "#475569", color: "#fff", border: "none", padding: "10px", borderRadius: "10px", cursor: "pointer", fontWeight: "bold" }}
            >
              إغلاق النافذة
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminDashboard;