import React, { useState, useEffect } from "react";
// تم التعديل للاستيراد من المسار الصحيح للبيانات
import { db, storage } from "../config/firebaseData";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import * as XLSX from "xlsx";

const EmployeePropertyDashboard = ({ currentUser }) => {
  const [properties, setProperties] = useState([]); 
  
  // حالات التحكم بالمنبثقات
  const [selectedProperty, setSelectedProperty] = useState(null); 
  const [currentImageIndex, setCurrentImageIndex] = useState(0); 
  const [editProperty, setEditProperty] = useState(null); 

  // حالات رفع ومعالجة ملف الإكسيل
  const [excelFile, setExcelFile] = useState(null);
  const [isUploadingExcel, setIsUploadingExcel] = useState(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState("");

  // رابط صورة افتراضية آمنة في حال فشل تحميل أو تدمير رابط أي صورة
  const fallbackImage = "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600";

  // دالة فحص وتطهير الروابط لمنع استدعاء blob المكسورة
  const cleanImagesArray = (imagesArray) => {
    if (!imagesArray || !Array.isArray(imagesArray) || imagesArray.length === 0) {
      return [fallbackImage];
    }
    const filtered = imagesArray.filter(img => img && typeof img === "string" && !img.startsWith("blob:") && !img.includes("localhost"));
    return filtered.length > 0 ? filtered : [fallbackImage];
  };

  useEffect(() => {
    // جلب العقارات الحالية بالسيستم مباشرة
    const unsubscribeProperties = onSnapshot(collection(db, "properties"), (snapshot) => {
      const props = [];
      snapshot.forEach((item) => {
        props.push({ id: item.id, ...item.data() });
      });
      setProperties(props);
    });

    return () => unsubscribeProperties();
  }, []);

  // دالة حذف العقار الفورية بالسلة (Trash)
  const handleDeleteProperty = async (propertyId) => {
    if (window.confirm("🗑️ هل أنت متأكد من حذف هذا العقار نهائياً من السيستم؟")) {
      try {
        await deleteDoc(doc(db, "properties", propertyId));
        alert("تـم حذف العقار بنجاح!");
      } catch (error) {
        console.error(error);
        alert("حدث خطأ أثناء الحذف.");
      }
    }
  };

  // دالة تبديل حالة الحجز (Booking)
  const togglePropertyStatus = async (propertyId, currentStatus) => {
    try {
      const propRef = doc(db, "properties", propertyId);
      await updateDoc(propRef, {
        status: currentStatus === "available" ? "booked" : "available"
      });
      alert(currentStatus === "available" ? "🔒 تم حجز العقار بنجاح" : "🟢 العقار متاح الآن");
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء تحديث حالة الحجز.");
    }
  };

  // دالة تقرأ قيمة عمود من صف الإكسيل بغض النظر عن اسم العمود (عربي أو إنجليزي)
  const getExcelField = (row, keys) => {
    for (const key of Object.keys(row)) {
      const normalized = key.toString().trim().toLowerCase();
      if (keys.some((k) => normalized === k.toLowerCase())) {
        return row[key];
      }
    }
    return "";
  };

  // دالة رفع ومعالجة ملف الإكسيل: تحلل الملف، ترفعه على التخزين، وتسجله في سجل الملفات بانتظار اعتماد الأدمن
  const handleExcelUpload = async () => {
    if (!excelFile) {
      alert("من فضلك اختر ملف Excel أولاً.");
      return;
    }

    setIsUploadingExcel(true);
    setUploadStatusMsg("⏳ جاري قراءة الملف...");

    try {
      // 1. قراءة وتحليل ملف الإكسيل
      const arrayBuffer = await excelFile.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (!rows || rows.length === 0) {
        alert("⚠️ الملف لا يحتوي على أي بيانات صالحة.");
        setIsUploadingExcel(false);
        setUploadStatusMsg("");
        return;
      }

      // 2. تحويل صفوف الإكسيل إلى بيانات عقارات مفهومة للسيستم
      const propertiesData = rows
        .map((row) => {
          const title = getExcelField(row, ["title", "العنوان", "اسم العقار", "الاسم"]);
          const location = getExcelField(row, ["location", "الموقع", "المكان"]);
          const priceRaw = getExcelField(row, ["price", "السعر"]);
          const areaRaw = getExcelField(row, ["area", "المساحة"]);
          const floor = getExcelField(row, ["floor", "الطابق", "الدور"]);
          const rooms = getExcelField(row, ["rooms", "الغرف", "عدد الغرف"]);
          const description = getExcelField(row, ["description", "الوصف", "تفاصيل"]);
          const imagesRaw = getExcelField(row, ["images", "الصور", "صور"]);

          const images = imagesRaw
            ? imagesRaw.toString().split(",").map((i) => i.trim()).filter((i) => i && !i.startsWith("blob:"))
            : [];

          return {
            title: title ? title.toString().trim() : "",
            location: location ? location.toString().trim() : "",
            price: priceRaw ? Number(priceRaw) || 0 : 0,
            area: areaRaw ? areaRaw.toString().trim() : "",
            floor: floor ? floor.toString().trim() : "",
            rooms: rooms ? rooms.toString().trim() : "",
            description: description ? description.toString().trim() : "",
            images,
            isBooked: false,
          };
        })
        // استبعاد أي صف بدون عنوان (صف فاضي أو غير صالح)
        .filter((p) => p.title);

      if (propertiesData.length === 0) {
        alert("⚠️ لم يتم العثور على أي عقارات صالحة بالملف. تأكد من وجود عمود العنوان (title / العنوان).");
        setIsUploadingExcel(false);
        setUploadStatusMsg("");
        return;
      }

      // 3. رفع نسخة من ملف الإكسيل الأصلي على Firebase Storage
      setUploadStatusMsg("⏳ جاري رفع الملف على السيرفر...");
      const fileRef = storageRef(storage, `excel_uploads/${Date.now()}_${excelFile.name}`);
      await uploadBytes(fileRef, excelFile);
      const fileUrl = await getDownloadURL(fileRef);

      // 4. تسجيل الملف في سجل "uploaded_files_log" ليظهر فوراً عند الأدمن بانتظار الاعتماد
      setUploadStatusMsg("⏳ جاري تسجيل الملف بالسجل...");
      await addDoc(collection(db, "uploaded_files_log"), {
        employeeName: currentUser?.name || "موظف غير معروف",
        uploadedBy: currentUser?.uid || "",
        fileName: excelFile.name,
        fileUrl,
        propertiesData,
        recordsCount: propertiesData.length,
        status: "pending",
        timestamp: serverTimestamp(),
      });

      alert(`✅ تم رفع الملف بنجاح! تم تسجيل (${propertiesData.length}) عقار بانتظار اعتماد الأدمن.`);
      setExcelFile(null);
      setUploadStatusMsg("");
      // تفريغ حقل اختيار الملف بصرياً
      const fileInput = document.getElementById("excelFileInput");
      if (fileInput) fileInput.value = "";
    } catch (error) {
      console.error(error);
      alert("❌ حدث خطأ أثناء معالجة أو رفع ملف الإكسيل. تأكد من صيغة الملف وحاول مرة أخرى.");
      setUploadStatusMsg("");
    } finally {
      setIsUploadingExcel(false);
    }
  };


  const handleUpdateProperty = async (e) => {
    e.preventDefault();
    try {
      const propRef = doc(db, "properties", editProperty.id);
      await updateDoc(propRef, {
        title: editProperty.title,
        price: Number(editProperty.price),
        area: editProperty.area,
        location: editProperty.location,
        floor: editProperty.floor || ""
      });
      alert("✅ تم تحديث البيانات بنجاح!");
      setEditProperty(null);
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء التعديل.");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", padding: "35px", direction: "rtl", fontFamily: "system-ui,sans-serif" }}>
      
      {/* Header */}
      <div style={{ background: "#fff", borderRadius: "30px", padding: "28px 35px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px", boxShadow: "0 18px 45px rgba(0,0,0,.05)" }}>
        <div>
          <div style={{ color: "#88989E", fontSize: "15px" }}>لوحة التحكم وإدارة العقارات المنشورة</div>
          <h1 style={{ marginTop: "8px", color: "#2A434D", fontSize: "32px", fontWeight: "800" }}>Property Dashboard</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <div>
            <div style={{ fontWeight: "700", color: "#2A434D", fontSize: "22px" }}>Aqar House</div>
            <div style={{ color: "#88989E", fontSize: "14px" }}>Real Estate System</div>
          </div>
        </div>
      </div>

      {/* بطاقة رفع ملف Excel جديد */}
      <div style={{ background: "#FFFFFF", borderRadius: "28px", padding: "28px", boxShadow: "0 18px 45px rgba(0,0,0,.05)", marginBottom: "30px" }}>
        <h2 style={{ color: "#2A434D", marginBottom: "10px", fontSize: "22px", fontWeight: "700" }}>📊 رفع ملف Excel جديد</h2>
        <div style={{ color: "#88989E", fontSize: "14px", marginBottom: "20px" }}>
          ارفع ملف Excel يحتوي على أعمدة مثل: العنوان (title)، الموقع (location)، السعر (price)، المساحة (area)، الطابق (floor)، عدد الغرف (rooms)، الوصف (description)، الصور (images - روابط مفصولة بفاصلة). سيتم إرسال الملف للأدمن بانتظار الاعتماد.
        </div>
        <div style={{ display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap" }}>
          <input
            id="excelFileInput"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
            style={{ padding: "10px", borderRadius: "12px", border: "1px solid #E6EDF3", background: "#F8FAFC" }}
          />
          <button
            onClick={handleExcelUpload}
            disabled={isUploadingExcel || !excelFile}
            style={{
              background: isUploadingExcel || !excelFile ? "#CFCFCF" : "linear-gradient(135deg,#FF8C42,#FFA45E)",
              color: "#fff",
              border: "none",
              padding: "12px 24px",
              borderRadius: "14px",
              cursor: isUploadingExcel || !excelFile ? "not-allowed" : "pointer",
              fontWeight: "700",
            }}
          >
            {isUploadingExcel ? "⏳ جاري الرفع..." : "⬆️ رفع الملف"}
          </button>
          {uploadStatusMsg && <span style={{ color: "#FF8C42", fontWeight: "600", fontSize: "14px" }}>{uploadStatusMsg}</span>}
        </div>
      </div>

      {/* جدول العقارات الحالي */}
      <div style={{ background: "#FFFFFF", borderRadius: "28px", padding: "30px", boxShadow: "0 18px 45px rgba(0,0,0,.05)" }}>
        <h2 style={{ color: "#2A434D", marginBottom: "25px", fontSize: "24px", fontWeight: "700" }}>🏠 العقارات الحالية بالسيستم</h2>
        
        {properties.length === 0 ? (
          <div style={{ color: "#88989E", textAlign: "center", padding: "40px" }}>لا توجد عقارات منشورة حالياً بالسيستم.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F1F5F9", color: "#475569" }}>
                <th style={{ padding: "15px", textAlign: "right" }}>اسم العقار / الشقة</th>
                <th style={{ padding: "15px", textAlign: "center" }}>الموقع</th>
                <th style={{ padding: "15px", textAlign: "center" }}>السعر</th>
                <th style={{ padding: "15px", textAlign: "center" }}>حالة الحجز</th>
                <th style={{ padding: "15px", textAlign: "center" }}>إجراءات الإدارة</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((prop) => (
                <tr key={prop.id} style={{ borderBottom: "1px solid #E2E8F0" }}>
                  <td style={{ padding: "15px", fontWeight: "600", color: "#1E293B" }}>🏢 {prop.title}</td>
                  <td style={{ padding: "15px", textAlign: "center", color: "#64748B" }}>{prop.location}</td>
                  <td style={{ padding: "15px", textAlign: "center", fontWeight: "700", color: "#10B981" }}>{prop.price?.toLocaleString()} ج.م</td>
                  
                  {/* شارة حالة الحجز */}
                  <td style={{ padding: "15px", textAlign: "center" }}>
                    <span style={{ 
                      padding: "5px 14px", borderRadius: "20px", fontSize: "12px", fontWeight: "700", 
                      background: prop.status === "available" ? "#EAFBF2" : "#FEE2E2", 
                      color: prop.status === "available" ? "#28A745" : "#EF4444" 
                    }}>
                      {prop.status === "available" ? "🟢 متاح" : "🔒 محجوز Booked"}
                    </span>
                  </td>

                  {/* أزرار الإجراءات */}
                  <td style={{ padding: "15px", textAlign: "center" }}>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                      
                      <button 
                        onClick={() => { setSelectedProperty(prop); setCurrentImageIndex(0); }}
                        style={{ background: "#0284C7", color: "#fff", border: "none", padding: "6px 12px", borderRadius: "8px", cursor: "pointer", fontWeight: "600", fontSize: "12px" }}
                      >
                        👁️ التفاصيل والصور
                      </button>

                      <button 
                        onClick={() => togglePropertyStatus(prop.id, prop.status)} 
                        style={{ background: prop.status === "available" ? "#F59E0B" : "#10B981", color: "#fff", border: "none", padding: "6px 12px", borderRadius: "8px", cursor: "pointer", fontWeight: "600", fontSize: "12px" }}
                      >
                        {prop.status === "available" ? "🔖 حجز" : "🔓 إتاحة"}
                      </button>

                      <button 
                        onClick={() => setEditProperty(prop)} 
                        style={{ background: "#3B82F6", color: "#fff", border: "none", padding: "6px 12px", borderRadius: "8px", cursor: "pointer", fontWeight: "600", fontSize: "12px" }}
                      >
                        ✏️ تعديل
                      </button>

                      <button 
                        onClick={() => handleDeleteProperty(prop.id)} 
                        style={{ background: "#EF4444", color: "#fff", border: "none", padding: "6px 14px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}
                      >
                        🗑️ حذف
                      </button>

                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ==================== نافذة المعاينة المنبثقة ==================== */}
      {selectedProperty && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 99999, padding: "20px" }}>
          <div style={{ background: "#fff", padding: "30px", borderRadius: "24px", width: "100%", maxWidth: "600px", position: "relative", maxHeight: "90vh", overflowY: "auto" }}>
            
            <button onClick={() => setSelectedProperty(null)} style={{ position: "absolute", top: "20px", left: "20px", background: "#EF4444", color: "#fff", border: "none", padding: "6px 12px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}>إغلاق ✖</button>
            <h3 style={{ color: "#2A434D", marginBottom: "20px", fontWeight: "800" }}>📋 تفاصيل وصور العقار</h3>

            {/* عرض وتقليب ألبوم الصور */}
            <div style={{ position: "relative", width: "100%", height: "300px", borderRadius: "16px", overflow: "hidden", marginBottom: "20px", background: "#000", display: "flex", justifyContent: "center", alignItems: "center" }}>
              <img 
                src={cleanImagesArray(selectedProperty.images)[currentImageIndex]} 
                alt="Gallery" 
                onError={(e) => { e.target.src = fallbackImage; }}
                style={{ width: "100%", height: "100%", objectFit: "contain" }} 
              />
              {selectedProperty.images && selectedProperty.images.length > 1 && (
                <>
                  <button onClick={() => setCurrentImageIndex((prev) => (prev === 0 ? selectedProperty.images.length - 1 : prev - 1))} style={{ position: "absolute", right: "10px", background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", width: "35px", height: "35px", borderRadius: "50%", cursor: "pointer" }}>▶</button>
                  <button onClick={() => setCurrentImageIndex((prev) => (prev === selectedProperty.images.length - 1 ? 0 : prev + 1))} style={{ position: "absolute", left: "10px", background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", width: "35px", height: "35px", borderRadius: "50%", cursor: "pointer" }}>◀</button>
                </>
              )}
            </div>

            <div style={{ background: "#F8FAFC", padding: "20px", borderRadius: "12px", fontSize: "15px", lineHeight: "1.6" }}>
              <div><strong>📌 العنوان:</strong> {selectedProperty?.title}</div>
              <div><strong>📍 الموقع:</strong> {selectedProperty?.location}</div>
              <div><strong>💰 السعر:</strong> {selectedProperty?.price?.toLocaleString()} ج.م</div>
              <div><strong>📐 المساحة:</strong> {selectedProperty?.area} م²</div>
              <div><strong>🏢 الطابق:</strong> {selectedProperty?.floor || "غير محدد"}</div>
              <div><strong>🔒 حالة الحجز:</strong> {selectedProperty?.status === "available" ? "🟢 متاح" : "🔒 محجوز"}</div>
            </div>

          </div>
        </div>
      )}

      {/* ==================== نافذة التعديل المنبثقة ==================== */}
      {editProperty && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 99999 }}>
          <div style={{ background: "#fff", padding: "30px", borderRadius: "24px", width: "90%", maxWidth: "500px" }}>
            <h3 style={{ color: "#2A434D", marginBottom: "20px", fontWeight: "700" }}>✏️ تحديث بيانات العقار</h3>
            <form onSubmit={handleUpdateProperty} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "5px", fontWeight: "600" }}>
                اسم العقار / العنوان:
                <input type="text" value={editProperty.title} onChange={(e) => setEditProperty({...editProperty, title: e.target.value})} style={{ padding: "10px", borderRadius: "8px", border: "1px solid #CBD5E1" }} required />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "5px", fontWeight: "600" }}>
                الموقع:
                <input type="text" value={editProperty.location} onChange={(e) => setEditProperty({...editProperty, location: e.target.value})} style={{ padding: "10px", borderRadius: "8px", border: "1px solid #CBD5E1" }} required />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: "5px", fontWeight: "600" }}>
                  السعر:
                  <input type="number" value={editProperty.price} onChange={(e) => setEditProperty({...editProperty, price: e.target.value})} style={{ padding: "10px", borderRadius: "8px", border: "1px solid #CBD5E1" }} required />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "5px", fontWeight: "600" }}>
                  المساحة:
                  <input type="text" value={editProperty.area} onChange={(e) => setEditProperty({...editProperty, area: e.target.value})} style={{ padding: "10px", borderRadius: "8px", border: "1px solid #CBD5E1" }} required />
                </label>
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button type="submit" style={{ flex: 1, background: "#10B981", color: "#fff", border: "none", padding: "12px", borderRadius: "10px", cursor: "pointer", fontWeight: "700" }}>حفظ</button>
                <button type="button" onClick={() => setEditProperty(null)} style={{ background: "#EF4444", color: "#fff", border: "none", padding: "12px", borderRadius: "10px", cursor: "pointer", fontWeight: "700" }}>إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default EmployeePropertyDashboard;