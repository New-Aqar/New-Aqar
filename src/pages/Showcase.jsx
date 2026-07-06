import React, { useState, useEffect } from 'react';
import { db } from "../config/firebaseData";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import {
  Home, MapPin, Ruler, LogOut, Upload, Settings, User, Globe, PlusCircle,
  FileText, DollarSign, Layers, AlignLeft, Image, X, Trash2, Pencil,
  MoreVertical, CalendarCheck, CalendarX, Loader2, CheckCircle2, XCircle,
  ChevronLeft, ChevronRight, FileSpreadsheet, LayoutGrid,
} from 'lucide-react';

const ACCENT = '#FF8C42';
const ACCENT_DARK = '#E8752E';
const DARK = '#2A434D';

// ------------------ حماية من الشاشة البيضاء: لو حصل أي كراش في الرندر، بيظهر رسالة بدل ما الصفحة تفضل فاضية ------------------
class DashboardErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('EmployeeDashboard crashed:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: '16px', fontFamily: 'system-ui, sans-serif', padding: '20px', textAlign: 'center',
          direction: 'rtl',
        }}>
          <h2 style={{ color: DARK, margin: 0 }}>حصلت مشكلة غير متوقعة 😕</h2>
          <p style={{ color: '#64748B', maxWidth: '420px', margin: 0 }}>
            جرب تعمل تحديث للصفحة. لو المشكلة استمرت، قوللي بالظبط إيه اللي كنت بتعمله قبل ما تظهر الرسالة دي.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: '12px 26px', backgroundColor: ACCENT, color: 'white', border: 'none', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', fontSize: '15px' }}
          >
            تحديث الصفحة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const EmployeeDashboardInner = ({ currentUser, onLogout }) => {
  const [properties, setProperties] = useState([]);
  const [excelLogs, setExcelLogs] = useState([]);
  const [userAvatar, setUserAvatar] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [language, setLanguage] = useState('ar');

  // ملفات الصور الحقيقية الجاهزة للرفع + معاينتها المحلية
  const [rawImages, setRawImages] = useState([]);
  const [previewImages, setPreviewImages] = useState([]);
  // صور موجودة بالفعل على عقار يتم تعديله حالياً
  const [existingImages, setExistingImages] = useState([]);

  const [newProp, setNewProp] = useState({
    title: '',
    type: 'housing',
    location: '',
    area: '',
    floor: '',
    price: '',
    description: '',
  });

  const [editingId, setEditingId] = useState(null);
  const [savingProperty, setSavingProperty] = useState(false);
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);

  const [openMenuId, setOpenMenuId] = useState(null);
  const [openExcelMenuId, setOpenExcelMenuId] = useState(null);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [activeImageIdx, setActiveImageIdx] = useState(0);

  // ------------------ بحث وفلترة العقارات ------------------
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // all | housing | business
  const [filterLocation, setFilterLocation] = useState('');
  const [filterMinArea, setFilterMinArea] = useState('');
  const [filterMaxArea, setFilterMaxArea] = useState('');

  const t = (ar, en) => (language === 'ar' ? ar : en);

  // ------------------ عرض العقارات من Firestore (تحديث لحظي) ------------------
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'properties'), (snapshot) => {
      const propsArray = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setProperties(propsArray);
    });
    return () => unsubscribe();
  }, []);

  // ------------------ سجل ملفات الإكسل المرفوعة (نفس السجل اللي بيشوفه الأدمن بالظبط) ------------------
  useEffect(() => {
    const q = query(collection(db, 'uploaded_files_log'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const ts = data.timestamp?.toDate ? data.timestamp.toDate() : new Date();
        return {
          id: docSnap.id,
          name: data.fileName,
          url: data.fileUrl,
          status: data.status || 'pending',
          recordsCount: data.recordsCount || 0,
          time: ts.toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US', {
            hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', year: 'numeric',
          }),
        };
      });
      setExcelLogs(logs);
    }, (error) => {
      console.error('Error loading uploaded_files_log:', error?.code || error?.message || error);
    });
    return () => unsubscribe();
  }, [language]);

  // ------------------ تحميل صورة اليوزر المحفوظة من Firestore عند فتح الصفحة ------------------
  // ملحوظة: بنخزن صورة البروفايل كـ Base64 جوه Firestore (مستند واحد لكل يوزر) عشان تفضل
  // ثابتة بعد الريفريش، بدل ما كانت بتترسم بـ URL.createObjectURL اللي بيروح لما الصفحة تتحدث.
  useEffect(() => {
    const uid = currentUser?.uid;
    if (!uid) return;
    const loadAvatar = async () => {
      try {
        const snap = await getDoc(doc(db, 'userAvatars', uid));
        if (snap.exists()) {
          setUserAvatar(snap.data().avatarUrl || null);
        }
      } catch (error) {
        // لو الصورة بتختفي بعد الريفريش، الغالب إن سبب المشكلة قواعد أمان Firestore
        // (Security Rules) مش سامحة بقراءة كولكشن userAvatars. لازم تتأكد إن فيه Rule بالشكل:
        // match /userAvatars/{userId} { allow read, write: if request.auth.uid == userId; }
        console.error('Error loading avatar (تأكد من قواعد أمان Firestore الخاصة بـ userAvatars):', error?.code || error?.message || error);
      }
    };
    loadAvatar();
  }, [currentUser?.uid]);

  // ------------------ رفع ملفات الإكسيل: تخزين كـ Base64 داخل Firestore مباشرة ------------------
  // ملحوظة: ده حل بديل عن Firebase Storage (اللي محتاج خطة Blaze). العيب إن Firestore بيحدد
  // حجم الداتا في المستند الواحد بحوالي 1MB، فحاطين حد أقصى آمن لحجم ملف الإكسيل قبل الرفع.
  const MAX_EXCEL_FILE_SIZE = 500 * 1024; // ~500KB (هيبقى حوالي 666KB بعد Base64 + مساحة كافية لبيانات العقارات المحلّلة، عشان نفضل تحت حد الـ 1MB لكل مستند في Firestore)
  const MAX_AVATAR_FILE_SIZE = 400 * 1024; // ~400KB لنفس السبب (تخزين داخل Firestore)

  const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('FILE_READ_ERROR'));
    reader.readAsDataURL(file);
  });

  // ------------------ زر رفع الإكسيل: تحليل الملف فوراً وإرساله لسجل الأدمن بانتظار الاعتماد ------------------
  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > MAX_EXCEL_FILE_SIZE) {
      alert(
        t(
          `الملف ده حجمه ${(file.size / 1024).toFixed(0)} كيلوبايت، وده أكبر من الحد المسموح (500 كيلوبايت) لأننا بنخزن الملف مباشرة جوه قاعدة البيانات من غير Firebase Storage. جرب تصغّر الملف أو تقسّمه لملفين.`,
          `This file is ${(file.size / 1024).toFixed(0)} KB, which is over the allowed limit (500 KB) since files are stored directly in the database without Firebase Storage. Try compressing it or splitting it into smaller files.`
        )
      );
      e.target.value = '';
      return;
    }

    setUploadingExcel(true);
    try {
      // 1. تحويل الملف لصيغة Base64 عشان نقدر نخزنه ونحمّله لاحقاً من غير Firebase Storage
      const dataUrl = await readFileAsDataUrl(file);

      // 2. تحليل الملف فوراً وتحويل صفوفه لعقارات مبدئية (نفس منطق "تطبيق على العقارات" لكن بدري)
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      const propertiesData = rows
        .map((row) => {
          const title = findExcelValue(row, EXCEL_FIELD_ALIASES.title);
          if (!title || !title.toString().trim()) return null;

          const rawType = findExcelValue(row, EXCEL_FIELD_ALIASES.type).toString().trim().toLowerCase();
          const type = ['business', 'تجاري', 'commercial'].includes(rawType) ? 'business' : 'housing';
          const rawImages = findExcelValue(row, EXCEL_FIELD_ALIASES.images);
          const images = rawImages
            ? rawImages.toString().split(',').map((i) => i.trim()).filter((i) => i && !i.startsWith('blob:'))
            : [];

          return {
            title: title.toString().trim(),
            type,
            location: findExcelValue(row, EXCEL_FIELD_ALIASES.location).toString().trim(),
            area: findExcelValue(row, EXCEL_FIELD_ALIASES.area).toString().trim(),
            floor: findExcelValue(row, EXCEL_FIELD_ALIASES.floor).toString().trim(),
            price: Number(findExcelValue(row, EXCEL_FIELD_ALIASES.price)) || 0,
            description: findExcelValue(row, EXCEL_FIELD_ALIASES.description).toString().trim(),
            images,
            isBooked: false,
          };
        })
        .filter(Boolean);

      if (propertiesData.length === 0) {
        alert(t('⚠️ الملف لا يحتوي على أي بيانات صالحة (تأكد من وجود عمود العنوان).', '⚠️ The file has no valid data (make sure a title column exists).'));
        return;
      }

      // 3. تسجيل الملف في سجل uploaded_files_log عشان يظهر فوراً عند الأدمن بانتظار الاعتماد
      await addDoc(collection(db, 'uploaded_files_log'), {
        fileName: file.name,
        fileUrl: dataUrl,
        employeeName: currentUser?.name || currentUser?.displayName || t('موظف', 'Employee'),
        uploadedBy: currentUser?.uid || '',
        propertiesData,
        recordsCount: propertiesData.length,
        status: 'pending',
        timestamp: serverTimestamp(),
      });

      alert(
        t(
          `✅ تم رفع الملف بنجاح، وتم رصد (${propertiesData.length}) عقار بانتظار اعتماد الأدمن.`,
          `✅ File uploaded successfully. (${propertiesData.length}) properties detected, pending admin approval.`
        )
      );
    } catch (error) {
      console.error('Error saving excel file:', error?.code || error?.message || error, error);
      alert(t('حدث خطأ أثناء حفظ الملف، حاول مرة أخرى.', 'An error occurred while saving the file. Please try again.'));
    } finally {
      setUploadingExcel(false);
      e.target.value = '';
    }
  };

  // ------------------ حذف ملف إكسيل من السجل ------------------
  const handleDeleteExcel = async (log) => {
    const confirmMsg = t(
      `هل أنت متأكد من حذف الملف "${log.name}" من السجل؟ لا يمكن التراجع عن هذا الإجراء.`,
      `Are you sure you want to delete "${log.name}" from the log? This cannot be undone.`
    );
    if (!window.confirm(confirmMsg)) return;
    try {
      await deleteDoc(doc(db, 'uploaded_files_log', log.id));
    } catch (error) {
      console.error('Error deleting excel file:', error);
      alert(t('حدث خطأ أثناء حذف الملف.', 'An error occurred while deleting the file.'));
    } finally {
      setOpenExcelMenuId(null);
    }
  };

  // ------------------ تحويل بيانات ملف الإكسيل إلى عقارات فعلية في Firestore ------------------
  // بيدور على أعمدة بأسماء عربي أو إنجليزي (عنوان/title، موقع/location...الخ)، وأي صف من غير
  // عنوان بيتجاهله. كل صف بيتحول لعقار مستقل بنفس منطق إضافة العقار اليدوي.
  const EXCEL_FIELD_ALIASES = {
    title: ['title', 'عنوان', 'العنوان', 'اسم العقار'],
    type: ['type', 'نوع', 'النوع', 'التصنيف'],
    location: ['location', 'موقع', 'الموقع'],
    area: ['area', 'مساحة', 'المساحة'],
    floor: ['floor', 'دور', 'الدور', 'الطابق'],
    price: ['price', 'سعر', 'السعر'],
    description: ['description', 'وصف', 'الوصف', 'التفاصيل'],
    images: ['images', 'صور', 'الصور'],
  };

  const findExcelValue = (row, aliases) => {
    const normalize = (key) => key.toString().trim().toLowerCase();
    const rowKeys = Object.keys(row);
    for (const key of rowKeys) {
      if (aliases.includes(normalize(key))) {
        return row[key];
      }
    }
    return '';
  };

  // ملحوظة: إنشاء العقارات الفعلية بقى مسؤولية الأدمن فقط بعد المراجعة (من لوحة الإدارة)،
  // فالموظف بيرفع الملف بس وبيستنى الاعتماد، بدل ما ينشر العقارات مباشرة.



  // ------------------ رفع صور العقار: تخزين كـ Base64 (بدون Firebase Storage) ------------------
  // بنضغط الصورة أولاً (resize + ضغط JPEG) عشان حجمها يفضل صغير كفاية إنها تتسجل في
  // مستند العقار في Firestore (اللي محدود بحوالي 1MB)، من غير أي حاجة لترقية Blaze.
  const compressImageToDataUrl = (file, maxDimension = 1000, quality = 0.6) => new Promise((resolve, reject) => {
    const img = document.createElement('img');
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDimension) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else if (height > maxDimension) {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('IMAGE_LOAD_ERROR'));
    };
    img.src = objectUrl;
  });

  // ------------------ تحديث صورة البروفايل: حفظ دائم في Firestore (بدل ما كانت بتتمسح بالريفريش) ------------------
  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > MAX_AVATAR_FILE_SIZE) {
      alert(
        t(
          `الصورة دي حجمها ${(file.size / 1024).toFixed(0)} كيلوبايت، وده أكبر من الحد المسموح (400 كيلوبايت). جرب صورة أصغر.`,
          `This image is ${(file.size / 1024).toFixed(0)} KB, which is over the allowed limit (400 KB). Try a smaller image.`
        )
      );
      e.target.value = '';
      return;
    }

    const uid = currentUser?.uid;
    setSavingAvatar(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setUserAvatar(dataUrl);
      setShowSettings(false);
      if (uid) {
        await setDoc(doc(db, 'userAvatars', uid), {
          avatarUrl: dataUrl,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error('Error saving avatar:', error);
      alert(t('حدث خطأ أثناء حفظ الصورة الشخصية، حاول مرة أخرى.', 'An error occurred while saving the profile photo. Please try again.'));
    } finally {
      setSavingAvatar(false);
      e.target.value = '';
    }
  };

  // ------------------ اختيار صور العقار ------------------
  const handlePropImages = (e) => {
    const files = Array.from(e.target.files);
    const totalCount = files.length + rawImages.length + existingImages.length;
    if (totalCount > 10) {
      alert(t('يمكنك رفع 10 صور كحد أقصى للعقار', 'You can upload up to 10 images maximum'));
      e.target.value = '';
      return;
    }
    setRawImages((prev) => [...prev, ...files]);
    const imageUrls = files.map((file) => URL.createObjectURL(file));
    setPreviewImages((prev) => [...prev, ...imageUrls]);
    e.target.value = '';
  };

  const removeExistingImage = (idx) => {
    setExistingImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const removeNewImage = (idx) => {
    setRawImages((prev) => prev.filter((_, i) => i !== idx));
    setPreviewImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const resetForm = () => {
    setNewProp({ title: '', type: 'housing', location: '', area: '', floor: '', price: '', description: '' });
    setRawImages([]);
    setPreviewImages([]);
    setExistingImages([]);
    setEditingId(null);
  };

  // ------------------ إضافة عقار جديد أو حفظ تعديل على عقار موجود ------------------
  const MAX_TOTAL_IMAGES_SIZE = 900 * 1024; // ~900KB إجمالي لكل صور العقار (تحت حد الـ 1MB لمستند Firestore)

  const handleAddPropertySubmit = async (e) => {
    e.preventDefault();
    setSavingProperty(true);
    try {
      let compressedNewImages = [];
      if (rawImages.length > 0) {
        compressedNewImages = await Promise.all(
          rawImages.map((file) => compressImageToDataUrl(file))
        );
      }
      const finalImages = [...existingImages, ...compressedNewImages];

      // فحص الحجم الإجمالي قبل الحفظ عشان نتجنب تخطي حد Firestore للمستند الواحد
      const totalSize = finalImages.reduce((sum, img) => sum + (img?.length || 0), 0);
      if (totalSize > MAX_TOTAL_IMAGES_SIZE) {
        alert(
          t(
            'إجمالي حجم صور العقار كبير أوي وممكن الحفظ يفشل. احذف صورة أو اتنين وجرب تاني.',
            'The total size of the property images is too large and saving might fail. Remove one or two images and try again.'
          )
        );
        setSavingProperty(false);
        return;
      }

      const finalPropData = { ...newProp, images: finalImages };

      if (editingId) {
        await updateDoc(doc(db, 'properties', editingId), finalPropData);
        resetForm();
        alert(t('تم تحديث بيانات العقار بنجاح!', 'Property updated successfully!'));
      } else {
        finalPropData.booked = false;
        finalPropData.createdAt = serverTimestamp();
        await addDoc(collection(db, 'properties'), finalPropData);
        resetForm();
        alert(t('تم إضافة العقار بنجاح!', 'Property added successfully!'));
      }
    } catch (error) {
      console.error('Error saving property: ', error?.code || error?.message || error, error);
      alert(t('حدث خطأ أثناء الحفظ، حاول مرة أخرى.', 'An error occurred while saving. Please try again.'));
    } finally {
      setSavingProperty(false);
    }
  };

  // ------------------ تعديل / حذف / حجز ------------------
  const handleEditProperty = (prop) => {
    setNewProp({
      title: prop.title || '',
      type: prop.type || 'housing',
      location: prop.location || '',
      area: prop.area || '',
      floor: prop.floor || '',
      price: prop.price || '',
      description: prop.description || '',
    });
    setExistingImages(prop.images || []);
    setPreviewImages([]);
    setRawImages([]);
    setEditingId(prop.id);
    setOpenMenuId(null);
    setSelectedProperty(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteProperty = async (id) => {
    const confirmMsg = t('هل أنت متأكد من حذف هذا العقار؟ لا يمكن التراجع عن هذا الإجراء.', 'Are you sure you want to delete this property? This cannot be undone.');
    if (!window.confirm(confirmMsg)) return;
    try {
      await deleteDoc(doc(db, 'properties', id));
      setOpenMenuId(null);
      setSelectedProperty((prev) => (prev?.id === id ? null : prev));
      if (editingId === id) resetForm();
    } catch (error) {
      console.error('Error deleting property: ', error);
      alert(t('حدث خطأ أثناء الحذف.', 'An error occurred while deleting.'));
    }
  };

  const toggleBooking = async (prop) => {
    try {
      const newStatus = !prop.booked;
      await updateDoc(doc(db, 'properties', prop.id), { booked: newStatus });
      setSelectedProperty((prev) => (prev && prev.id === prop.id ? { ...prev, booked: newStatus } : prev));
    } catch (error) {
      console.error('Error updating booking status: ', error);
    }
  };

  const openPropertyModal = (prop) => {
    setSelectedProperty(prop);
    setActiveImageIdx(0);
    setOpenMenuId(null);
  };

  const showNextImage = () => {
    setActiveImageIdx((prev) => {
      const total = selectedProperty?.images?.length || 1;
      return (prev + 1) % total;
    });
  };

  const showPrevImage = () => {
    setActiveImageIdx((prev) => {
      const total = selectedProperty?.images?.length || 1;
      return (prev - 1 + total) % total;
    });
  };

  // التنقل بين صور العقار باستخدام أسهم الكيبورد لما المودال يكون مفتوح
  useEffect(() => {
    if (!selectedProperty) return;
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') showNextImage();
      if (e.key === 'ArrowLeft') showPrevImage();
      if (e.key === 'Escape') setSelectedProperty(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedProperty]);

  // قفل قوائم الـ (⋮) تلقائياً لو ضغطت في أي حتة تانية بالصفحة
  useEffect(() => {
    if (!openMenuId && !openExcelMenuId) return;
    const closeMenus = () => {
      setOpenMenuId(null);
      setOpenExcelMenuId(null);
    };
    // بنأجل الإضافة تيك واحد عشان الضغطة اللي فتحت المنيو نفسها متقفلوش القائمة فوراً
    const timer = setTimeout(() => document.addEventListener('click', closeMenus), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', closeMenus);
    };
  }, [openMenuId, openExcelMenuId]);

  const typeLabel = (type) => (type === 'business' ? t('تجاري', 'Business') : t('سكني', 'Housing'));

  // ------------------ زر "عرض العقارات للعميل": ينزل لمعرض العقارات والفلاتر مباشرة ------------------
  const scrollToGallery = () => {
    const el = document.getElementById('properties-gallery-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ------------------ تطبيق البحث والفلاتر على قائمة العقارات ------------------
  const filteredProperties = properties.filter((prop) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = !q
      || (prop.title || '').toLowerCase().includes(q)
      || (prop.location || '').toLowerCase().includes(q)
      || (prop.description || '').toLowerCase().includes(q);

    const matchesType = filterType === 'all' || prop.type === filterType;

    const matchesLocation = !filterLocation.trim()
      || (prop.location || '').toLowerCase().includes(filterLocation.trim().toLowerCase());

    const areaNum = Number(prop.area) || 0;
    const matchesMinArea = !filterMinArea || areaNum >= Number(filterMinArea);
    const matchesMaxArea = !filterMaxArea || areaNum <= Number(filterMaxArea);

    return matchesSearch && matchesType && matchesLocation && matchesMinArea && matchesMaxArea;
  });

  const hasActiveFilters = Boolean(searchQuery.trim() || filterType !== 'all' || filterLocation.trim() || filterMinArea || filterMaxArea);

  const clearFilters = () => {
    setSearchQuery('');
    setFilterType('all');
    setFilterLocation('');
    setFilterMinArea('');
    setFilterMaxArea('');
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #F8FAFC 0%, #F3F6FA 100%)',
      padding: '40px 30px',
      direction: language === 'ar' ? 'rtl' : 'ltr',
      fontFamily: 'system-ui, sans-serif',
    }}>

      {/* ================= HEADER SECTION ================= */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '40px',
        backgroundColor: '#FFFFFF',
        padding: '20px 35px',
        borderRadius: '24px',
        boxShadow: '0 10px 35px rgba(42,67,77,0.06)',
        border: '1px solid #E2E8F0',
        position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {userAvatar ? (
            <img src={userAvatar} alt="User Avatar" style={{ width: '55px', height: '55px', borderRadius: '50%', objectFit: 'cover', border: `2px solid ${ACCENT}` }} />
          ) : (
            <div style={{ width: '55px', height: '55px', borderRadius: '50%', background: 'linear-gradient(135deg,#FFF1E8,#FFE4D1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <User size={24} color={ACCENT} />
            </div>
          )}
          <div>
            <h2 style={{ fontSize: '14px', color: '#88989E', margin: 0, fontWeight: '500' }}>
              {t('مرحباً بك،', 'Welcome,')}
            </h2>
            <h1 style={{ fontSize: '22px', color: DARK, margin: 0, fontWeight: '700' }}>
              <span style={{ color: '#88989E' }}>{t('أهلاً', 'Hello')}</span> <span style={{ color: ACCENT }}>{currentUser?.displayName || t('مستخدمنا', 'User')}</span>
            </h1>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <img src="/Aqar House.jpg" alt="Logo" style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '14px' }} />
          <span style={{ fontSize: '24px', fontWeight: '800', color: DARK, letterSpacing: '0.5px' }}>Aqar House</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', position: 'relative' }}>
          <button
            type="button"
            onClick={scrollToGallery}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DARK})`, color: '#FFFFFF', border: 'none', borderRadius: '14px',
              cursor: 'pointer', fontWeight: '700', fontSize: '14px', transition: '0.3s', boxShadow: '0 8px 20px rgba(255,140,66,0.28)',
            }}
          >
            <LayoutGrid size={18} />
            {t('عرض العقارات للعميل', 'Show Properties to Client')}
          </button>

          <button
            type="button"
            onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px',
              backgroundColor: '#F1F5F9', color: '#475569', border: 'none', borderRadius: '14px',
              cursor: 'pointer', fontWeight: '600', fontSize: '13px', transition: '0.2s',
            }}
          >
            <Globe size={16} />
            {t('English', 'عربي')}
          </button>

          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              background: `linear-gradient(135deg, ${DARK}, #33505C)`, color: '#FFFFFF', border: 'none', borderRadius: '14px',
              cursor: 'pointer', fontWeight: '600', fontSize: '14px', transition: '0.3s',
            }}
          >
            <Settings size={18} />
            {t('الإعدادات', 'Settings')}
          </button>

          {showSettings && (
            <div style={{
              position: 'absolute', top: '55px', [language === 'ar' ? 'left' : 'right']: 0,
              backgroundColor: '#FFFFFF', minWidth: '220px', borderRadius: '16px',
              boxShadow: '0 15px 35px rgba(0,0,0,0.12)', border: '1px solid #E2E8F0',
              zIndex: 100, padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px',
            }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '12px',
                color: '#475569', borderRadius: '10px', cursor: savingAvatar ? 'default' : 'pointer', fontSize: '14px', transition: '0.2s',
              }} onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')} onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}>
                {savingAvatar ? <Loader2 size={16} color={ACCENT} style={{ animation: 'spin 1s linear infinite' }} /> : <User size={16} color={ACCENT} />}
                <span>{savingAvatar ? t('جارِ الحفظ...', 'Saving...') : t('تحديث الصورة الشخصية', 'Update Profile Photo')}</span>
                <input type="file" style={{ display: 'none' }} accept="image/*" onChange={handleAvatarChange} disabled={savingAvatar} />
              </label>

              <hr style={{ border: 'none', borderTop: '1px solid #F1F5F9', margin: '4px 0' }} />

              <button
                type="button"
                onClick={onLogout}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '12px',
                  color: '#EF4444', backgroundColor: 'transparent', border: 'none', borderRadius: '10px',
                  cursor: 'pointer', fontSize: '14px', width: '100%', textAlign: language === 'ar' ? 'right' : 'left', transition: '0.2s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#FEF2F2')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <LogOut size={16} />
                <span>{t('تسجيل الخروج', 'Logout')}</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ================= CONTROL & MANAGEMENT ZONE ================= */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr', gap: '30px', marginBottom: '40px' }}>
        <div style={{ backgroundColor: 'white', padding: '35px', borderRadius: '24px', border: '1px solid #E2E8F0', boxShadow: '0 10px 30px rgba(42,67,77,0.04)' }}>
        // ابحث عن هذا الجزء في الكود (حوالي السطر 717) وقم باستبدال الـ map كالتالي:

<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '25px' }}>
  {filteredProperties.map((prop) => (
    <div
      // تأكد أن الـ key هو معرف فريد فعلاً ولا يتكرر
      key={prop.id || Math.random()} 
      onClick={() => openPropertyModal(prop)}
      style={{
        backgroundColor: 'white', padding: '20px', borderRadius: '24px',
        border: '1px solid #E2E8F0', boxShadow: '0 10px 25px rgba(42,67,77,0.04)',
        transition: 'all 0.3s ease-in-out', cursor: 'pointer', position: 'relative',
      }}
      // ... باقي الكود الخاص بالـ div الخاص بالعقار
    >
      {/* تأكد أنك لا تضع أي عناصر غير ضرورية هنا قد تسبب تداخل في الـ DOM */}
      
      {/* زر القائمة */}
      <div style={{ position: 'absolute', top: '30px', [language === 'ar' ? 'left' : 'right']: '30px' }} onClick={(e) => e.stopPropagation()}>
         {/* ... */}
      </div>
      
      {/* باقي محتوى الكارد */}
      
    </div>
  ))}
</div>

          <form onSubmit={handleAddPropertySubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>{t('عنوان العقار', 'Property Title')}</label>
              <input required type="text" value={newProp.title} onChange={(e) => setNewProp({ ...newProp, title: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #CBD5E1', boxSizing: 'border-box' }} />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>{t('نوع التصنيف', 'Classification Type')}</label>
              <select value={newProp.type} onChange={(e) => setNewProp({ ...newProp, type: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #CBD5E1', background: 'white', boxSizing: 'border-box' }}>
                <option value="housing">{t('سكني (Housing)', 'Housing')}</option>
                <option value="business">{t('تجاري (Business)', 'Business')}</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#475569', fontWeight: '500' }}><MapPin size={14} /> {t('الموقع', 'Location')}</label>
              <input required type="text" value={newProp.location} onChange={(e) => setNewProp({ ...newProp, location: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #CBD5E1', boxSizing: 'border-box' }} />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#475569', fontWeight: '500' }}><Ruler size={14} /> {t('المساحة (م²)', 'Area (m²)')}</label>
              <input required type="number" value={newProp.area} onChange={(e) => setNewProp({ ...newProp, area: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #CBD5E1', boxSizing: 'border-box' }} />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#475569', fontWeight: '500' }}><Layers size={14} /> {t('الدور / الطابق', 'Floor')}</label>
              <input required type="text" value={newProp.floor} onChange={(e) => setNewProp({ ...newProp, floor: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #CBD5E1', boxSizing: 'border-box' }} />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#475569', fontWeight: '500' }}><DollarSign size={14} /> {t('السعر', 'Price')}</label>
              <input required type="text" value={newProp.price} onChange={(e) => setNewProp({ ...newProp, price: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #CBD5E1', boxSizing: 'border-box' }} />
            </div>

            <div style={{ gridColumn: '1 / span 2' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#475569', fontWeight: '500' }}><AlignLeft size={14} /> {t('الوصف والتفاصيل', 'Description & Details')}</label>
              <textarea rows="3" value={newProp.description} onChange={(e) => setNewProp({ ...newProp, description: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #CBD5E1', fontFamily: 'inherit', boxSizing: 'border-box' }}></textarea>
            </div>

            <div style={{ gridColumn: '1 / span 2' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', backgroundColor: '#FFF1E8', color: ACCENT, borderRadius: '12px', cursor: 'pointer', border: `1px dashed ${ACCENT}`, justifyContent: 'center', fontWeight: '600' }}>
                <Image size={18} /> {t('إضافة صور للعقار (بحد أقصى 10)', 'Upload Property Images (Max 10)')}
                <input type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={handlePropImages} />
              </label>

              {(existingImages.length > 0 || previewImages.length > 0) && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                  {existingImages.map((img, i) => (
                    <div key={`existing-${i}`} style={{ position: 'relative' }}>
                      <img src={img} alt="existing" style={{ width: '54px', height: '54px', borderRadius: '10px', objectFit: 'cover' }} />
                      <button type="button" onClick={() => removeExistingImage(i)} style={{
                        position: 'absolute', top: '-6px', right: '-6px', width: '20px', height: '20px', borderRadius: '50%',
                        backgroundColor: '#EF4444', color: 'white', border: '2px solid white', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                      }}>
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                  {previewImages.map((img, i) => (
                    <div key={`new-${i}`} style={{ position: 'relative' }}>
                      <img src={img} alt="preview" style={{ width: '54px', height: '54px', borderRadius: '10px', objectFit: 'cover', border: `2px solid ${ACCENT}` }} />
                      <button type="button" onClick={() => removeNewImage(i)} style={{
                        position: 'absolute', top: '-6px', right: '-6px', width: '20px', height: '20px', borderRadius: '50%',
                        backgroundColor: '#EF4444', color: 'white', border: '2px solid white', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                      }}>
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button type="submit" disabled={savingProperty} style={{
              gridColumn: '1 / span 2', padding: '14px',
              background: savingProperty ? '#FFC79A' : `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DARK})`,
              color: 'white', border: 'none', borderRadius: '14px', cursor: savingProperty ? 'default' : 'pointer',
              fontWeight: '700', fontSize: '16px', marginTop: '10px', boxShadow: '0 8px 20px rgba(255,140,66,0.28)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}>
              {savingProperty && <Loader2 size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} />}
              {savingProperty
                ? t('جارِ الحفظ...', 'Saving...')
                : editingId ? t('حفظ التعديلات', 'Save Changes') : t('حفظ العقار ونشره', 'Save & Publish Property')}
            </button>
          </form>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '24px', border: '1px solid #E2E8F0', textAlign: 'center', boxShadow: '0 10px 30px rgba(42,67,77,0.04)' }}>
            <h3 style={{ fontSize: '16px', color: DARK, marginBottom: '15px', fontWeight: '700' }}>{t('استيراد البيانات الذكية', 'Smart Data Import')}</h3>
            <label style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '30px 20px',
              backgroundColor: uploadingExcel ? '#FFF1E8' : '#F8FAFC', color: DARK, borderRadius: '18px',
              cursor: uploadingExcel ? 'default' : 'pointer',
              border: `2px dashed ${uploadingExcel ? ACCENT : '#E2E8F0'}`, transition: '0.3s',
            }}>
              {uploadingExcel ? (
                <>
                  <Loader2 size={32} color={ACCENT} style={{ animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontWeight: '600', fontSize: '15px' }}>{t('جارِ رفع الملف...', 'Uploading file...')}</span>
                </>
              ) : (
                <>
                  <Upload size={32} color={ACCENT} />
                  <span style={{ fontWeight: '600', fontSize: '15px' }}>{t('رفع ملف Excel جديد', 'Upload New Excel File')}</span>
                  <span style={{ fontSize: '12px', color: '#88989E' }}>{t('أو اسحب الملف مباشرة هنا', 'or drop the file here')}</span>
                </>
              )}
              <input type="file" style={{ display: 'none' }} accept=".xlsx, .xls" onChange={handleExcelUpload} disabled={uploadingExcel} />
            </label>
          </div>

          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '24px', border: '1px solid #E2E8F0', flex: 1, boxShadow: '0 10px 30px rgba(42,67,77,0.04)' }}>
            <h3 style={{ fontSize: '16px', color: DARK, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '700' }}>
              <FileText size={18} color={ACCENT} /> {t('سجل الملفات المرفوعة', 'Uploaded Files Log')}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '280px', overflowY: 'auto' }}>
              {excelLogs.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#88989E', padding: '20px', fontSize: '14px' }}>
                  {t('لا يوجد ملفات مرفوعة حالياً', 'No files uploaded yet')}
                </div>
              ) : (
                excelLogs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px solid #F1F5F9',
                      display: 'flex', alignItems: 'stretch', gap: '6px', padding: '6px',
                    }}
                  >
                    <a
                      href={log.url}
                      download={log.name}
                      style={{
                        flex: 1, minWidth: 0, padding: '6px 10px', borderRadius: '10px', display: 'flex',
                        flexDirection: 'column', gap: '2px', textDecoration: 'none',
                      }}
                    >
                      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '500', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{log.name}</span>
                        <span style={{ fontSize: '12px', color: '#88989E', flexShrink: 0 }}>{log.time}</span>
                      </span>
                      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                        <span
                          style={{
                            fontSize: '11px', fontWeight: '700', padding: '2px 10px', borderRadius: '20px', width: 'fit-content',
                            backgroundColor: log.status === 'applied' ? '#E2F7ED' : '#FFE8D6',
                            color: log.status === 'applied' ? '#28A745' : '#FF8C42',
                          }}
                        >
                          {log.status === 'applied'
                            ? t('✅ تم الاعتماد', '✅ Approved')
                            : t('⏳ بانتظار مراجعة الأدمن', '⏳ Pending admin review')}
                        </span>
                        <span style={{ fontSize: '11px', color: '#88989E', flexShrink: 0 }}>
                          {t(`${log.recordsCount} وحدة`, `${log.recordsCount} units`)}
                        </span>
                      </span>
                    </a>

                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => setOpenExcelMenuId(openExcelMenuId === log.id ? null : log.id)}
                        style={{
                          width: '32px', height: '32px', borderRadius: '10px', border: 'none',
                          backgroundColor: 'white', boxShadow: '0 2px 8px rgba(42,67,77,0.12)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', color: DARK, flexShrink: 0,
                        }}
                      >
                        <MoreVertical size={17} />
                      </button>

                      {openExcelMenuId === log.id && (
                        <div style={{
                          position: 'absolute', top: '38px', [language === 'ar' ? 'left' : 'right']: 0,
                          backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
                          border: '1px solid #E2E8F0', overflow: 'hidden', minWidth: '210px', zIndex: 30,
                        }}>
                          <button
                            type="button"
                            onClick={() => handleDeleteExcel(log)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '11px 14px',
                              border: 'none', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '13px', color: '#EF4444',
                              fontWeight: '600', textAlign: language === 'ar' ? 'right' : 'left',
                            }}
                          >
                            <Trash2 size={14} /> {t('حذف الملف', 'Delete File')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ================= PROPERTIES SHOWER (GRID VIEW) ================= */}
      <div id="properties-gallery-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px', scrollMarginTop: '20px' }}>
        <h2 style={{ fontSize: '20px', color: DARK, fontWeight: '700', margin: 0 }}>
          {t('معرض العقارات الحالي', 'Current Properties Gallery')}
          <span style={{ color: '#94A3B8', fontWeight: '600', fontSize: '15px' }}> ({filteredProperties.length})</span>
        </h2>
      </div>

      {/* ================= شريط البحث والفلاتر ================= */}
      <div style={{
        backgroundColor: 'white', borderRadius: '20px', border: '1px solid #E2E8F0', padding: '18px 22px',
        marginBottom: '25px', boxShadow: '0 8px 22px rgba(42,67,77,0.03)',
        display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end',
      }}>
        <div style={{ flex: '2 1 220px', minWidth: '200px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#475569', fontWeight: '600' }}>{t('بحث', 'Search')}</label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('ابحث بالاسم أو الموقع أو الوصف...', 'Search by title, location, or description...')}
            style={{ width: '100%', padding: '11px 14px', borderRadius: '12px', border: '1px solid #CBD5E1', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ flex: '1 1 150px', minWidth: '140px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#475569', fontWeight: '600' }}>{t('النوع', 'Type')}</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{ width: '100%', padding: '11px 14px', borderRadius: '12px', border: '1px solid #CBD5E1', background: 'white', boxSizing: 'border-box' }}
          >
            <option value="all">{t('الكل', 'All')}</option>
            <option value="housing">{t('سكني', 'Housing')}</option>
            <option value="business">{t('تجاري', 'Business')}</option>
          </select>
        </div>

        <div style={{ flex: '1 1 170px', minWidth: '150px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#475569', fontWeight: '600' }}>{t('المنطقة / الموقع', 'Area / Location')}</label>
          <input
            type="text"
            value={filterLocation}
            onChange={(e) => setFilterLocation(e.target.value)}
            placeholder={t('مثال: مدينة نصر', 'e.g. Nasr City')}
            style={{ width: '100%', padding: '11px 14px', borderRadius: '12px', border: '1px solid #CBD5E1', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ flex: '1 1 100px', minWidth: '90px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#475569', fontWeight: '600' }}>{t('من (م²)', 'Min (m²)')}</label>
          <input
            type="number"
            value={filterMinArea}
            onChange={(e) => setFilterMinArea(e.target.value)}
            style={{ width: '100%', padding: '11px 14px', borderRadius: '12px', border: '1px solid #CBD5E1', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ flex: '1 1 100px', minWidth: '90px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#475569', fontWeight: '600' }}>{t('إلى (م²)', 'Max (m²)')}</label>
          <input
            type="number"
            value={filterMaxArea}
            onChange={(e) => setFilterMaxArea(e.target.value)}
            style={{ width: '100%', padding: '11px 14px', borderRadius: '12px', border: '1px solid #CBD5E1', boxSizing: 'border-box' }}
          />
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            style={{
              padding: '11px 18px', backgroundColor: '#F1F5F9', color: '#475569', border: 'none',
              borderRadius: '12px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <X size={14} /> {t('مسح الفلاتر', 'Clear Filters')}
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '25px' }}>
        {filteredProperties.map((prop) => (
          <div
            key={prop.id}
            onClick={() => openPropertyModal(prop)}
            style={{
              backgroundColor: 'white', padding: '20px', borderRadius: '24px',
              border: '1px solid #E2E8F0', boxShadow: '0 10px 25px rgba(42,67,77,0.04)',
              transition: 'all 0.3s ease-in-out', cursor: 'pointer', position: 'relative',
            }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 18px 35px rgba(42,67,77,0.10)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 10px 25px rgba(42,67,77,0.04)'; }}
          >
            <div style={{ width: '100%', height: '170px', backgroundColor: '#F8FAFC', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px', overflow: 'hidden', position: 'relative' }}>
              {prop.images && prop.images.length > 0 ? (
                <img src={prop.images[0]} alt="Prop Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <Home size={42} color={ACCENT} />
              )}
              <span style={{ position: 'absolute', top: '12px', [language === 'ar' ? 'left' : 'right']: '12px', backgroundColor: prop.type === 'business' ? '#E0F2FE' : '#FEF3C7', color: prop.type === 'business' ? '#0369A1' : '#B45309', padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '700' }}>
                {typeLabel(prop.type)}
              </span>
              {prop.booked && (
                <span style={{ position: 'absolute', bottom: '12px', [language === 'ar' ? 'left' : 'right']: '12px', backgroundColor: '#DCFCE7', color: '#15803D', padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CalendarCheck size={12} /> {t('محجوز', 'Booked')}
                </span>
              )}
            </div>

            {/* زر القائمة (تعديل / حذف) */}
            <div style={{ position: 'absolute', top: '30px', [language === 'ar' ? 'left' : 'right']: '30px' }} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setOpenMenuId(openMenuId === prop.id ? null : prop.id)}
                style={{
                  width: '32px', height: '32px', borderRadius: '10px', border: 'none',
                  backgroundColor: 'rgba(255,255,255,0.9)', boxShadow: '0 4px 10px rgba(0,0,0,0.12)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: DARK,
                }}
              >
                <MoreVertical size={16} />
              </button>
              {openMenuId === prop.id && (
                <div style={{
                  position: 'absolute', top: '38px', [language === 'ar' ? 'left' : 'right']: 0,
                  backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 12px 30px rgba(0,0,0,0.15)',
                  border: '1px solid #E2E8F0', overflow: 'hidden', minWidth: '140px', zIndex: 20,
                }}>
                  <button type="button" onClick={() => handleEditProperty(prop)} style={{
                    display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '10px 14px',
                    border: 'none', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '13px', color: '#334155', fontWeight: '600',
                  }}>
                    <Pencil size={14} color={ACCENT} /> {t('تعديل', 'Edit')}
                  </button>
                  <button type="button" onClick={() => handleDeleteProperty(prop.id)} style={{
                    display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '10px 14px',
                    border: 'none', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '13px', color: '#EF4444', fontWeight: '600',
                    borderTop: '1px solid #F1F5F9',
                  }}>
                    <Trash2 size={14} /> {t('حذف', 'Delete')}
                  </button>
                </div>
              )}
            </div>

            <h3 style={{ fontSize: '18px', color: DARK, marginBottom: '8px', fontWeight: '700' }}>{prop.title}</h3>
            {prop.price && <div style={{ fontSize: '16px', color: ACCENT, fontWeight: '700', marginBottom: '12px' }}>{prop.price}</div>}

            <div style={{ display: 'flex', gap: '15px', color: '#88989E', fontSize: '14px', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><MapPin size={16} color={ACCENT} /> {prop.location}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Ruler size={16} color={ACCENT} /> {prop.area} م²</span>
              {prop.floor && <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Layers size={16} color={ACCENT} /> {t('الدور', 'Floor')} {prop.floor}</span>}
            </div>

            {prop.description && (
              <p style={{ fontSize: '13px', color: '#64748B', marginTop: '12px', borderTop: '1px solid #F1F5F9', paddingTop: '10px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {prop.description}
              </p>
            )}
          </div>
        ))}

        {filteredProperties.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px', color: '#94A3B8' }}>
            <Home size={40} color="#CBD5E1" />
            <p style={{ marginTop: '10px', fontSize: '15px' }}>
              {properties.length === 0
                ? t('لا يوجد عقارات مضافة حتى الآن', 'No properties added yet')
                : t('لا يوجد عقارات مطابقة لبحثك أو الفلاتر المختارة', 'No properties match your search or selected filters')}
            </p>
            {properties.length > 0 && hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                style={{ marginTop: '14px', padding: '10px 20px', backgroundColor: '#F1F5F9', color: '#475569', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}
              >
                {t('مسح الفلاتر', 'Clear Filters')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ================= PROPERTY DETAILS MODAL ================= */}
      {selectedProperty && (
        <div
          onClick={() => setSelectedProperty(null)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white', borderRadius: '28px', maxWidth: '880px', width: '100%',
              maxHeight: '90vh', overflowY: 'auto', position: 'relative', boxShadow: '0 30px 70px rgba(0,0,0,0.35)',
              direction: language === 'ar' ? 'rtl' : 'ltr',
            }}
          >
            <button
              type="button"
              onClick={() => setSelectedProperty(null)}
              style={{
                position: 'absolute', top: '20px', [language === 'ar' ? 'left' : 'right']: '20px', zIndex: 5,
                width: '38px', height: '38px', borderRadius: '50%', border: 'none',
                backgroundColor: 'rgba(255,255,255,0.95)', boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: DARK,
              }}
            >
              <X size={20} />
            </button>

            {/* Gallery - صورة كبيرة (تقريباً نص الشاشة) مع أسهم تنقل وأنيميشن */}
            <div style={{
              width: '100%', height: 'min(56vh, 560px)', minHeight: '320px',
              backgroundColor: '#0F172A', borderRadius: '28px 28px 0 0', overflow: 'hidden', position: 'relative',
            }}>
              {selectedProperty.images && selectedProperty.images.length > 0 ? (
                <img
                  key={activeImageIdx}
                  src={selectedProperty.images[activeImageIdx]}
                  alt={selectedProperty.title}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', animation: 'fadeIn 0.35s ease' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Home size={64} color="#475569" />
                </div>
              )}

              <span style={{
                position: 'absolute', top: '20px', [language === 'ar' ? 'right' : 'left']: '20px',
                backgroundColor: selectedProperty.type === 'business' ? '#0369A1' : '#B45309', color: 'white',
                padding: '6px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: '700', zIndex: 2,
              }}>
                {typeLabel(selectedProperty.type)}
              </span>

              {selectedProperty.images && selectedProperty.images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); showPrevImage(); }}
                    style={{
                      position: 'absolute', top: '50%', left: '18px', transform: 'translateY(-50%)', zIndex: 3,
                      width: '46px', height: '46px', borderRadius: '50%', border: 'none',
                      backgroundColor: 'rgba(255,255,255,0.9)', boxShadow: '0 4px 15px rgba(0,0,0,0.25)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: DARK,
                    }}
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); showNextImage(); }}
                    style={{
                      position: 'absolute', top: '50%', right: '18px', transform: 'translateY(-50%)', zIndex: 3,
                      width: '46px', height: '46px', borderRadius: '50%', border: 'none',
                      backgroundColor: 'rgba(255,255,255,0.9)', boxShadow: '0 4px 15px rgba(0,0,0,0.25)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: DARK,
                    }}
                  >
                    <ChevronRight size={24} />
                  </button>

                  <span style={{
                    position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 3,
                    backgroundColor: 'rgba(15,23,42,0.7)', color: 'white', padding: '5px 14px',
                    borderRadius: '20px', fontSize: '12px', fontWeight: '700',
                  }}>
                    {activeImageIdx + 1} / {selectedProperty.images.length}
                  </span>
                </>
              )}
            </div>

            {selectedProperty.images && selectedProperty.images.length > 1 && (
              <div style={{ display: 'flex', gap: '8px', padding: '14px 30px 0', flexWrap: 'wrap' }}>
                {selectedProperty.images.map((img, i) => (
                  <img
                    key={i}
                    src={img}
                    alt=""
                    onClick={() => setActiveImageIdx(i)}
                    style={{
                      width: '56px', height: '56px', borderRadius: '10px', objectFit: 'cover', cursor: 'pointer',
                      border: i === activeImageIdx ? `3px solid ${ACCENT}` : '3px solid transparent', opacity: i === activeImageIdx ? 1 : 0.7,
                      transition: '0.2s',
                    }}
                  />
                ))}
              </div>
            )}

            <div style={{ padding: '25px 30px 30px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '15px', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ fontSize: '24px', color: DARK, margin: 0, fontWeight: '800' }}>{selectedProperty.title}</h2>
                  {selectedProperty.price && <div style={{ fontSize: '20px', color: ACCENT, fontWeight: '800', marginTop: '6px' }}>{selectedProperty.price}</div>}
                </div>

                <button
                  type="button"
                  onClick={() => toggleBooking(selectedProperty)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 22px', borderRadius: '14px',
                    border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '14px',
                    backgroundColor: selectedProperty.booked ? '#FEF2F2' : '#DCFCE7',
                    color: selectedProperty.booked ? '#DC2626' : '#15803D',
                  }}
                >
                  {selectedProperty.booked ? <CalendarX size={18} /> : <CalendarCheck size={18} />}
                  {selectedProperty.booked ? t('إلغاء الحجز', 'Cancel Booking') : t('تحديد كمحجوز', 'Mark as Booked')}
                </button>
              </div>

              {selectedProperty.booked && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '12px', backgroundColor: '#DCFCE7', color: '#15803D', padding: '5px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: '700' }}>
                  <CheckCircle2 size={14} /> {t('هذا العقار محجوز حالياً', 'This property is currently booked')}
                </div>
              )}

              <div style={{ display: 'flex', gap: '20px', color: '#475569', fontSize: '15px', flexWrap: 'wrap', marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #F1F5F9' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><MapPin size={17} color={ACCENT} /> {selectedProperty.location}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Ruler size={17} color={ACCENT} /> {selectedProperty.area} م²</span>
                {selectedProperty.floor && <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Layers size={17} color={ACCENT} /> {t('الدور', 'Floor')} {selectedProperty.floor}</span>}
              </div>

              {selectedProperty.description && (
                <div style={{ marginTop: '20px' }}>
                  <h4 style={{ fontSize: '14px', color: '#94A3B8', fontWeight: '700', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('الوصف والتفاصيل', 'Description & Details')}</h4>
                  <p style={{ fontSize: '15px', color: '#334155', lineHeight: '1.8', margin: 0 }}>{selectedProperty.description}</p>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '30px', paddingTop: '20px', borderTop: '1px solid #F1F5F9' }}>
                <button
                  type="button"
                  onClick={() => handleEditProperty(selectedProperty)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '13px',
                    backgroundColor: '#F1F5F9', color: DARK, border: 'none', borderRadius: '14px', cursor: 'pointer', fontWeight: '700', fontSize: '14px',
                  }}
                >
                  <Pencil size={16} /> {t('تعديل العقار', 'Edit Property')}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteProperty(selectedProperty.id)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '13px',
                    backgroundColor: '#FEF2F2', color: '#DC2626', border: 'none', borderRadius: '14px', cursor: 'pointer', fontWeight: '700', fontSize: '14px',
                  }}
                >
                  <Trash2 size={16} /> {t('حذف العقار', 'Delete Property')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
};

const EmployeeDashboard = (props) => (
  <DashboardErrorBoundary>
    <EmployeeDashboardInner {...props} />
  </DashboardErrorBoundary>
);

export default EmployeeDashboard;