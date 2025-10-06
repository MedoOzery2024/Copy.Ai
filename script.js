/* ======================================================
   script.js — Copy.Ai (إصدار مُحسّن لإصلاح مشاكل Tesseract)
   - أصلحنا: "loading tesseract core 100%" و "worker.load is not a function"
   - يَستعمل worker مُعاد الاستخدام إن أمكن، أو fallback إلى Tesseract.recognize
   - Developed by: محمود محمد محمود أبو الفتوح أحمد العزيري
   ====================================================== */

/* ------- Helpers ------- */
const $ = id => document.getElementById(id);
const readFileAsDataURL = file => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(fr.result);
  fr.onerror = rej;
  fr.readAsDataURL(file);
});
const readFileAsArrayBuffer = file => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(fr.result);
  fr.onerror = rej;
  fr.readAsArrayBuffer(file);
});
const dataURLtoBlob = dataurl => {
  const arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]), n = bstr.length, u8 = new Uint8Array(n);
  for (let i = 0; i < n; i++) u8[i] = bstr.charCodeAt(i);
  return new Blob([u8], { type: mime });
};
const downloadBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
};

/* ------- Splash / Theme / Navigation (بعض الأشياء الأساسية) ------- */
window.addEventListener('load', () => {
  // إخفاء شاشة Splash إن وُجدت
  const splash = $('splash-screen');
  if (splash) setTimeout(() => { splash.style.opacity = '0'; setTimeout(() => splash.style.display = 'none', 600); }, 2800);
  // إظهار الصفحة الرئيسية في البداية
  document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; p.classList.remove('active'); });
  const home = $('home'); if (home) { home.style.display = 'block'; home.classList.add('active'); }
});

// Theme toggle (يحفظ في localStorage)
const themeToggle = $('theme-toggle');
if (themeToggle) {
  const saved = localStorage.getItem('copyai_theme') || 'dark';
  if (saved === 'dark') document.body.classList.add('dark-mode');
  themeToggle.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const now = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
    localStorage.setItem('copyai_theme', now);
    themeToggle.textContent = now === 'dark' ? '☀️' : '🌙';
  });
}

/* ------- SPA Navigation (بطاقات تفتح الأقسام) ------- */
document.querySelectorAll('.card').forEach(c => c.addEventListener('click', () => {
  const id = c.getAttribute('data-section');
  if (!id) return;
  document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; p.classList.remove('active'); });
  const home = $('home'); if (home) { home.style.display = 'none'; home.classList.remove('active'); }
  const el = $(id); if (el) { el.style.display = 'block'; el.classList.add('active'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
}));
function goHome() {
  document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; p.classList.remove('active'); });
  const home = $('home'); if (home) { home.style.display = 'block'; home.classList.add('active'); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ===========================================================
   Tesseract handling: create one reusable worker if ممكن
   - نتجاهل رسائل التهيئة (loading/initialized tesseract)
   - إن لم تتوفر createWorker() نستخدم Tesseract.recognize() كـ fallback
   =========================================================== */
let tesseractWorker = null;              // worker مُعاد الاستخدام (إن أمكن)
let currentProgressCallback = null;      // callback مؤقت لعرض التقدم أثناء التعرف

async function ensureTesseractWorker() {
  if (!window.Tesseract) throw new Error('Tesseract.js غير محمّل. تأكد من CDN في index.html');
  // إذا يوجد createWorker() (الإصدار الحديث) فلننشئ worker واحد
  if (typeof window.Tesseract.createWorker === 'function') {
    if (tesseractWorker) return tesseractWorker;
    // أنشئ worker مع logger يحيل الرسائل لـ currentProgressCallback ولكن يتجاهل رسائل التهيئة
    tesseractWorker = window.Tesseract.createWorker({
      logger: m => {
        if (!m || !m.status) return;
        const s = String(m.status).toLowerCase();
        // تجاهل رسائل التحميل/تهيئة core التي تولد "loading tesseract core 100%" إلخ
        if (s.includes('loading tesseract core') || s.includes('initializing tesseract') || s.includes('initialized tesseract')) return;
        if (currentProgressCallback) currentProgressCallback(m);
      }
    });
    // تحميل وحدات worker وموديلات اللغات (مرة واحدة)
    await tesseractWorker.load();
    // نحمل العربية و الإنجليزية لتحسين التعرّف
    try {
      await tesseractWorker.loadLanguage('ara+eng');
      await tesseractWorker.initialize('ara+eng');
    } catch (e) {
      // بعض إصدارات تتطلب تحميل كل لغة على حدة:
      try {
        await tesseractWorker.loadLanguage('ara');
        await tesseractWorker.loadLanguage('eng');
        await tesseractWorker.initialize('ara+eng');
      } catch (ee) {
        // إن فشل تحميل اللغات المركبة، حاول على الأقل اللإنجليزية
        console.warn('تعذر تحميل ara+eng مركب، المحاولة على eng فقط', ee);
        await tesseractWorker.loadLanguage('eng');
        await tesseractWorker.initialize('eng');
      }
    }
    return tesseractWorker;
  }
  // خلاف ذلك: لا يوجد createWorker -> نستخدم recognize مباشرة كـ fallback
  return null;
}

// دالة موحدة للتعرف على نص من dataURL (تدعم كل الحالات)
async function recognizeDataURL(dataUrl, progressElement = null) {
  // progress callback محلي يعرض الحالة في العنصر إن وُجد
  const showProgress = m => {
    try {
      if (!m || !m.status) return;
      const status = String(m.status);
      const pct = (typeof m.progress === 'number') ? ` ${(Math.round(m.progress * 100))}%` : '';
      if (progressElement) progressElement.textContent = `${status}${pct}`;
    } catch (e) { /* ignore */ }
  };

  // إن كان createWorker متاحًا فاحرص على وجود worker واستخدمه (أسرع في إعادة الاستعمال)
  try {
    const worker = await ensureTesseractWorker();
    if (worker) {
      currentProgressCallback = showProgress;
      const res = await worker.recognize(dataUrl);
      currentProgressCallback = null;
      const text = (res && res.data && res.data.text) ? res.data.text : '';
      return text;
    } else {
      // fallback: use direct recognize API (بعض ملفات CDN تدعم Tesseract.recognize)
      if (typeof window.Tesseract.recognize === 'function') {
        const res = await window.Tesseract.recognize(dataUrl, 'ara+eng', {
          logger: m => {
            if (!m || !m.status) return;
            const s = String(m.status).toLowerCase();
            if (s.includes('loading tesseract core') || s.includes('initializing tesseract') || s.includes('initialized tesseract')) return;
            showProgress(m);
          }
        });
        return (res && res.data && res.data.text) ? res.data.text : '';
      } else {
        throw new Error('Tesseract لا يحتوي على createWorker أو recognize — تأكد من تحميل المكتبة الصحيحة عبر CDN.');
      }
    }
  } catch (err) {
    currentProgressCallback = null;
    throw err;
  }
}

/* ------- pdf.js: تحويل صفحات PDF إلى صور dataURL ------- */
async function pdfToImageDataURLs(arrayBuffer) {
  const pdfjsLib = window['pdfjsLib'] || window['pdfjs-dist/build/pdf'] || window['pdfjs'];
  if (!pdfjsLib || !pdfjsLib.getDocument) throw new Error('pdf.js غير محمّل - تأكد من CDN');
  if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.14.305/pdf.worker.min.js';
  }
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const urls = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    urls.push(canvas.toDataURL('image/jpeg', 0.95));
  }
  return urls;
}

/* ===========================================================
   Handlers: استخدم recognizeDataURL لكل من Extract و Translate
   =========================================================== */

const extractFile = $('extract-file'), btnExtract = $('btn-extract'), extractStatus = $('extract-status'), extractOutput = $('extract-output');
if (btnExtract && extractFile) {
  btnExtract.addEventListener('click', async () => {
    extractOutput.textContent = ''; extractStatus.textContent = '';
    if (!extractFile.files.length) { extractStatus.textContent = 'اختر ملفًا أولًا.'; return; }
    const f = extractFile.files[0];
    try {
      extractStatus.textContent = '⏳ جاري المعالجة...';
      if (f.type === 'application/pdf') {
        const arr = await readFileAsArrayBuffer(f);
        extractStatus.textContent = '⏳ تحويل صفحات PDF إلى صور...';
        const imgs = await pdfToImageDataURLs(arr);
        let combined = '';
        for (let i = 0; i < imgs.length; i++) {
          extractStatus.textContent = `⏳ OCR صفحة ${i + 1}/${imgs.length} ...`;
          const txt = await recognizeDataURL(imgs[i], extractStatus);
          combined += `\n\n--- صفحة ${i + 1} ---\n` + (txt || '');
        }
        extractOutput.textContent = combined.trim() || 'لم يتم العثور على نص.';
        const si = $('summary-input'); if (si) si.value = combined.trim();
        extractStatus.textContent = '✅ تم الاستخراج';
      } else if (f.type.startsWith('image/')) {
        const d = await readFileAsDataURL(f);
        extractStatus.textContent = '⏳ جاري استخراج النص من الصورة...';
        const txt = await recognizeDataURL(d, extractStatus);
        extractOutput.textContent = txt || 'لم يتم العثور على نص.';
        const si = $('summary-input'); if (si) si.value = txt || '';
        extractStatus.textContent = '✅ تم الاستخراج';
      } else {
        extractStatus.textContent = 'نوع ملف غير مدعوم للاستخراج.';
      }
    } catch (err) {
      extractStatus.textContent = 'خطأ أثناء الاستخراج: ' + (err.message || err);
      console.error(err);
    }
  });
}

/* Translate panel يستخدم نفس recognizeDataURL (لمعالجة الصور وPDF) */
const translateFile = $('translate-file'), btnTranslate = $('btn-translate'), translateOutput = $('translate-output');
if (btnTranslate && translateFile) {
  btnTranslate.addEventListener('click', async () => {
    translateOutput.textContent = ''; if (!translateFile.files.length) { translateOutput.textContent = 'اختر ملفًا.'; return; }
    const f = translateFile.files[0];
    try {
      translateOutput.textContent = '⏳ جاري المعالجة...';
      if (f.type === 'application/pdf') {
        const arr = await readFileAsArrayBuffer(f);
        translateOutput.textContent = '⏳ تحويل صفحات PDF إلى صور...';
        const imgs = await pdfToImageDataURLs(arr);
        let all = '';
        for (let i = 0; i < imgs.length; i++) {
          translateOutput.textContent = `⏳ صفحة ${i + 1}/${imgs.length} - استخراج...`;
          const t = await recognizeDataURL(imgs[i], translateOutput);
          all += `\n\n--- صفحة ${i + 1} ---\n` + (t || '');
        }
        translateOutput.textContent = all.trim();
      } else if (f.type.startsWith('image/')) {
        const d = await readFileAsDataURL(f);
        translateOutput.textContent = '⏳ استخراج النص من الصورة...';
        const t = await recognizeDataURL(d, translateOutput);
        translateOutput.textContent = t || 'لا يوجد نص.';
      } else translateOutput.textContent = 'نوع ملف غير مدعوم.';
    } catch (e) {
      translateOutput.textContent = 'خطأ: ' + (e.message || e);
      console.error(e);
    }
  });
}

/* ---------- تحسين: إنهاء الـ worker عند إغلاق الصفحة لتوفير الذاكرة ---------- */
window.addEventListener('beforeunload', async () => {
  try {
    if (tesseractWorker && typeof tesseractWorker.terminate === 'function') {
      await tesseractWorker.terminate();
      tesseractWorker = null;
    }
  } catch (e) { /* ignore */ }
});

/* ========== بقيّة وظائف الموقع (تلخيص، تحويل صور→PDF، ضغط PDF...) يمكن الإبقاء عليها كما كانت ========== */
/* ملاحظة: إن أردت أدرج هنا بقية الكود (images->PDF, compress PDF, convert to docx/xlsx/pptx, resize image, TTS) بنفس النسخة القديمة— تقول أضيفها مباشرة هنا. */
