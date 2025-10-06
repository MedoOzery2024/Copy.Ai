/* ===========================================================
   script.js — النسخة الكاملة النهائية لموقع Copy.Ai
   - يدعم: OCR (صور + PDF), تلخيص, ترجمة (MyMemory أو Google API), images->PDF, compress PDF (تقريبي),
           تحويل نص -> docx/xlsx/pptx/txt, تغيير حجم الصور، TTS، splash, theme
   - تم إصلاح: worker.load is not a function, إخفاء رسائل 'loading tesseract core 100%'
   - Developed by: محمود محمد محمود أبو الفتوح أحمد العزيري
   =========================================================== */

/* -------------------------
   ملاحظات تشغيلية سريعة
   - تأكد من وجود هذه المكتبات في index.html (CDNs):
     * tesseract.js (v4/v5) -> createWorker API
     * pdf.js
     * jsPDF
     * pdf-lib
     * docx
     * xlsx (SheetJS)
     * PptxGenJS
   - إذا أردت استخدام Google Translate API ضع مفتاحك هنا في المتغير GOOGLE_TRANSLATE_API_KEY.
   -------------------------- */

/* ========== إعدادات اختياريّة ========== */
// لو أردت استخدام Google Translate (تحتاج API key صالحة)، ضعها هنا.
// مثال: const GOOGLE_TRANSLATE_API_KEY = 'AIza...';
const GOOGLE_TRANSLATE_API_KEY = null; // <-- ضع المفتاح هنا إن رغبت (أو اترك null لاستخدام MyMemory)

/* ========== Helpers ========== */
const $ = id => document.getElementById(id);
const readFileAsDataURL = file => new Promise((res,reject)=>{
  const fr = new FileReader();
  fr.onload = ()=>res(fr.result);
  fr.onerror = reject;
  fr.readAsDataURL(file);
});
const readFileAsArrayBuffer = file => new Promise((res,reject)=>{
  const fr = new FileReader();
  fr.onload = ()=>res(fr.result);
  fr.onerror = reject;
  fr.readAsArrayBuffer(file);
});
const dataURLtoBlob = dataurl => {
  const arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]); let n = bstr.length; const u8 = new Uint8Array(n);
  while(n--) u8[n] = bstr.charCodeAt(n);
  return new Blob([u8], { type: mime });
};
const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a);
  a.click(); a.remove(); URL.revokeObjectURL(url);
};

/* ========== Splash + Theme + Init UI ========== */
window.addEventListener('load', ()=>{
  // splash hide
  const splash = $('splash-screen');
  if (splash) {
    setTimeout(()=> {
      splash.style.opacity = '0';
      setTimeout(()=> splash.style.display='none', 600);
    }, 2800);
  }
  // Hide all panels initially (home visible)
  document.querySelectorAll('.panel, .section').forEach(p=>{ p.style.display='none'; p.classList.remove('active'); });
  const home = $('home') || document.querySelector('main');
  if (home) { home.style.display = 'grid'; home.classList.add('active'); }
  // clock (if موجود)
  setInterval(()=> {
    const clock = $('clock'); if (!clock) return;
    const now = new Date(); clock.textContent = now.toLocaleString('ar-EG', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
  }, 1000);
  // restore theme
  const saved = localStorage.getItem('copyai_theme') || 'dark';
  if (saved === 'dark') document.body.classList.add('dark-mode');
  const tt = $('theme-toggle'); if (tt) tt.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
  if (tt) tt.addEventListener('click', ()=> {
    document.body.classList.toggle('dark-mode');
    const now = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
    localStorage.setItem('copyai_theme', now);
    tt.textContent = now === 'dark' ? '☀️' : '🌙';
  });
});

/* ========== Navigation SPA (cards open sections) ========== */
document.addEventListener('DOMContentLoaded', ()=>{
  document.querySelectorAll('[data-section]').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-section');
      openSection(id);
    });
  });
});
function openSection(id) {
  // hide all panels and home
  document.querySelectorAll('.panel, .section').forEach(p => { p.style.display='none'; p.classList.remove('active'); });
  const home = $('home') || document.querySelector('main');
  if (home) { home.style.display='none'; home.classList.remove('active'); }
  const sec = $(id);
  if (sec) { sec.style.display = 'block'; sec.classList.add('active'); window.scrollTo({top:0, behavior:'smooth'}); }
}
function goHome() {
  document.querySelectorAll('.panel, .section').forEach(p => { p.style.display='none'; p.classList.remove('active'); });
  const home = $('home') || document.querySelector('main');
  if (home) { home.style.display = 'grid'; home.classList.add('active'); window.scrollTo({top:0, behavior:'smooth'}); }
}

/* ========== Tesseract OCR (worker reuse + filtering logs) ========== */
let tesseractWorker = null;
let tesseractInitialized = false;
let tesseractLang = 'ara+eng'; // اللغات المستخدمة (عربي + انجليزي)
async function ensureTesseractWorker(progressCb = null) {
  if (!window.Tesseract) throw new Error('Tesseract.js غير محمّل. تأكد من CDN في index.html');
  // if createWorker available:
  if (typeof window.Tesseract.createWorker === 'function') {
    if (tesseractWorker && tesseractInitialized) return tesseractWorker;
    tesseractWorker = window.Tesseract.createWorker({
      // logger will be used for progress; filter out 'loading tesseract core' / 'initialized tesseract' messages
      logger: m => {
        if (!m || !m.status) return;
        const s = String(m.status).toLowerCase();
        if (s.includes('loading tesseract core') || s.includes('initializing tesseract') || s.includes('initialized tesseract')) return;
        if (progressCb) progressCb(m);
      }
    });
    // load and init once
    await tesseractWorker.load();
    // try loading combined; fallback to separate loads if needed
    try {
      await tesseractWorker.loadLanguage(tesseractLang);
      await tesseractWorker.initialize(tesseractLang);
    } catch (e) {
      // fallback: try load individual languages
      try {
        await tesseractWorker.loadLanguage('ara');
        await tesseractWorker.loadLanguage('eng');
        await tesseractWorker.initialize('ara+eng');
      } catch (ee) {
        console.warn('تعذر تحميل ara+eng مجتمعين، محاولة استخدام eng فقط', ee);
        try { await tesseractWorker.initialize('eng'); } catch(ex) { console.error('Tesseract init failed', ex); }
      }
    }
    tesseractInitialized = true;
    return tesseractWorker;
  } else {
    // fallback: older tesseract might expose Tesseract.recognize directly
    tesseractWorker = null;
    tesseractInitialized = false;
    return null;
  }
}

// recognize helper that accepts dataURL or File
async function recognizeDataURL(dataUrlOrFile, progressElem = null) {
  const showProgress = m => {
    if (!m || !m.status) return;
    const pct = (typeof m.progress === 'number') ? ` ${(Math.round(m.progress*100))}%` : '';
    if (progressElem) progressElem.textContent = `${m.status}${pct}`;
  };
  // if createWorker is available, use worker
  const worker = await ensureTesseractWorker(showProgress).catch(err => { throw err; });
  if (worker) {
    // worker.recognize accepts URL/dataURL or file object
    const res = await worker.recognize(dataUrlOrFile);
    return (res && res.data && res.data.text) ? res.data.text : '';
  } else {
    // fallback to Tesseract.recognize style
    if (typeof window.Tesseract.recognize === 'function') {
      const res = await window.Tesseract.recognize(dataUrlOrFile, 'ara+eng', {
        logger: m => {
          // filter initialization messages
          if (!m || !m.status) return;
          const s = String(m.status).toLowerCase();
          if (s.includes('loading tesseract core') || s.includes('initializing tesseract') || s.includes('initialized tesseract')) return;
          showProgress(m);
        }
      });
      return (res && res.data && res.data.text) ? res.data.text : '';
    } else {
      throw new Error('Tesseract لا يدعم createWorker أو recognize في البيئة الحالية.');
    }
  }
}

/* ========== pdf.js: PDF -> image dataURLs (pages) ========== */
async function pdfToImageDataURLs(arrayBuffer, scale = 1.5) {
  const pdfjsLib = window['pdfjsLib'] || window['pdfjs-dist/build/pdf'] || window['pdfjs'];
  if (!pdfjsLib || !pdfjsLib.getDocument) throw new Error('pdf.js غير محمّل - تأكد من CDN');
  if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.14.305/pdf.worker.min.js';
  }
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const urls = [];
  for (let p=1; p<=pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    urls.push(canvas.toDataURL('image/jpeg', 0.95));
  }
  return urls;
}

/* ============================
   Section: Extract OCR (images + pdf)
   ============================ */
const extractFileInput = $('extract-file');
const btnExtract = $('btn-extract');
const extractStatus = $('extract-status');
const extractOutput = $('extract-output');

if (btnExtract && extractFileInput) {
  btnExtract.addEventListener('click', async () => {
    try {
      extractOutput.textContent = '';
      extractStatus.textContent = '';
      if (!extractFileInput.files.length) { extractStatus.textContent = 'اختر ملفًا أولاً.'; return; }
      const f = extractFileInput.files[0];
      extractStatus.textContent = '⏳ جاري المعالجة...';
      if (f.type === 'application/pdf') {
        // PDF -> pages -> OCR each
        const arr = await readFileAsArrayBuffer(f);
        extractStatus.textContent = '⏳ تحويل صفحات PDF إلى صور...';
        const pages = await pdfToImageDataURLs(arr, 1.5);
        let combined = '';
        for (let i=0;i<pages.length;i++) {
          extractStatus.textContent = `⏳ OCR صفحة ${i+1}/${pages.length}...`;
          const txt = await recognizeDataURL(pages[i], extractStatus);
          combined += `\n\n--- صفحة ${i+1} ---\n` + (txt||'');
        }
        extractOutput.textContent = combined.trim() || 'لم يتم العثور على نص.';
        // fill summary input if present
        const si = $('summary-input'); if (si) si.value = combined.trim();
        extractStatus.textContent = '✅ الاستخراج اكتمل';
      } else if (f.type.startsWith('image/')) {
        const dataUrl = await readFileAsDataURL(f);
        extractStatus.textContent = '⏳ جاري استخراج النص من الصورة...';
        const t = await recognizeDataURL(dataUrl, extractStatus);
        extractOutput.textContent = t || 'لم يتم العثور على نص.';
        const si = $('summary-input'); if (si) si.value = t || '';
        extractStatus.textContent = '✅ الاستخراج اكتمل';
      } else {
        extractStatus.textContent = 'نوع الملف غير مدعوم للاستخراج.';
      }
    } catch (err) {
      console.error(err);
      extractStatus.textContent = 'خطأ أثناء الاستخراج: ' + (err.message||err);
    }
  });
}

/* ========== Translate (MyMemory by default, or Google if API key set) ========== */
const translateFile = $('translate-file'), btnTranslate = $('btn-translate'), translateOutput = $('translate-output'), translateTarget = $('translate-target');
async function translateViaMyMemory(text, target = 'ar') {
  // MyMemory has limits but is free for small use
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${target}`;
  const res = await fetch(url);
  const j = await res.json();
  return (j && j.responseData && j.responseData.translatedText) ? j.responseData.translatedText : '';
}
async function translateViaGoogle(text, target = 'ar') {
  if (!GOOGLE_TRANSLATE_API_KEY) throw new Error('Google Translate API key not set.');
  // Using v2 simple endpoint with key
  const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(GOOGLE_TRANSLATE_API_KEY)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ q: text, target })
  });
  const j = await res.json();
  if (j && j.data && j.data.translations && j.data.translations[0]) return j.data.translations[0].translatedText;
  return '';
}
if (btnTranslate && translateFile) {
  btnTranslate.addEventListener('click', async () => {
    translateOutput.textContent = '';
    try {
      if (!translateFile.files.length) { translateOutput.textContent = 'اختر ملفًا أولاً'; return; }
      const f = translateFile.files[0];
      translateOutput.textContent = '⏳ جاري المعالجة...';
      let extracted = '';
      if (f.type === 'application/pdf') {
        const arr = await readFileAsArrayBuffer(f);
        const imgs = await pdfToImageDataURLs(arr);
        for (let i=0;i<imgs.length;i++){
          translateOutput.textContent = `⏳ صفحة ${i+1}/${imgs.length} - استخراج...`;
          extracted += `\n\n--- صفحة ${i+1} ---\n` + (await recognizeDataURL(imgs[i], translateOutput));
        }
      } else if (f.type.startsWith('image/')) {
        const d = await readFileAsDataURL(f);
        extracted = await recognizeDataURL(d, translateOutput);
      } else { translateOutput.textContent = 'نوع ملف غير مدعوم.'; return; }

      translateOutput.textContent = '⏳ استخراج مكتمل — جاري الترجمة...';
      const targetLang = (translateTarget && translateTarget.value) ? translateTarget.value : 'ar';
      let translation = '';
      if (GOOGLE_TRANSLATE_API_KEY) {
        try { translation = await translateViaGoogle(extracted, targetLang); }
        catch(e) { console.warn('Google translate failed, falling back to MyMemory', e); translation = await translateViaMyMemory(extracted, targetLang); }
      } else {
        translation = await translateViaMyMemory(extracted, targetLang);
      }
      translateOutput.textContent = `=== النص المستخرج ===\n${extracted}\n\n=== الترجمة (${targetLang}) ===\n${translation}`;
    } catch (e) {
      console.error(e);
      translateOutput.textContent = 'خطأ أثناء الترجمة/الاستخراج: ' + (e.message||e);
    }
  });
}

/* ========== images -> PDF (jsPDF) ========== */
const img2pdfInput = $('img2pdf-input'), btnImg2Pdf = $('btn-img2pdf'), img2pdfStatus = $('img2pdf-status');
async function createPdfFromImages(files) {
  if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF غير محمّل');
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit:'px', format:'a4' });
  for (let i=0;i<files.length;i++) {
    const f = files[i];
    const dataUrl = await readFileAsDataURL(f);
    const img = new Image();
    await new Promise((res,rej)=>{ img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 20;
    const ratio = Math.min((pageW - margin*2)/img.width, (pageH - margin*2)/img.height, 1);
    const drawW = img.width * ratio; const drawH = img.height * ratio;
    const x = (pageW - drawW) / 2; const y = (pageH - drawH) / 2;
    const fmt = f.type && f.type.includes('png') ? 'PNG' : 'JPEG';
    pdf.addImage(dataUrl, fmt, x, y, drawW, drawH);
    if (i < files.length-1) pdf.addPage();
  }
  return pdf;
}
if (btnImg2Pdf && img2pdfInput) {
  btnImg2Pdf.addEventListener('click', async () => {
    try {
      img2pdfStatus.textContent = ''; if (!img2pdfInput.files.length) { img2pdfStatus.textContent = 'اختر صورًا'; return; }
      img2pdfStatus.textContent = '⏳ جاري إنشاء PDF...';
      const pdf = await createPdfFromImages(Array.from(img2pdfInput.files));
      const blob = pdf.output('blob');
      downloadBlob(blob, 'images-to-pdf.pdf');
      img2pdfStatus.textContent = '✅ تم الإنشاء';
    } catch (e) { img2pdfStatus.textContent = 'خطأ: ' + (e.message||e); console.error(e); }
  });
}

/* ========== compress / rebuild PDF (تقريبي) باستخدام pdf-lib ==========
   - الفكرة: تحويل صفحات إلى صور ثم تضمينها داخل pdf-lib كمرفقات JPG
   - ملاحظة: هذا يجعل PDF صورة بالكامل (لن يكون قابلاً للبحث كنص)
   ================================================================ */
const resizepdfInput = $('resizepdf-input'), btnResizePdf = $('btn-resizepdf'), resizepdfStatus = $('resizepdf-status');
async function compressPdfArrayBuffer(arrayBuffer, quality = 0.6) {
  const imgs = await pdfToImageDataURLs(arrayBuffer, 1.2);
  if (!window.PDFLib) throw new Error('pdf-lib غير محمّل');
  const newDoc = await PDFLib.PDFDocument.create();
  for (let i=0;i<imgs.length;i++){
    resizepdfStatus.textContent = `⏳ ضغط صفحة ${i+1}/${imgs.length}...`;
    // ضغط الصورة عبر canvas
    const blob = dataURLtoBlob(imgs[i]);
    const imgURL = URL.createObjectURL(blob);
    const imgEl = await new Promise((res,rej)=>{ const im = new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=imgURL; });
    const canvas = document.createElement('canvas'); canvas.width = imgEl.width; canvas.height = imgEl.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(imgEl,0,0);
    const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
    const compressedArr = await (await fetch(compressedDataUrl)).arrayBuffer();
    const jpg = await newDoc.embedJpg(compressedArr);
    const page = newDoc.addPage([jpg.width, jpg.height]);
    page.drawImage(jpg, { x:0, y:0, width: jpg.width, height: jpg.height });
    URL.revokeObjectURL(imgURL);
  }
  const out = await newDoc.save();
  return new Blob([out], { type:'application/pdf' });
}
if (btnResizePdf && resizepdfInput) {
  btnResizePdf.addEventListener('click', async () => {
    try {
      resizepdfStatus.textContent = ''; if (!resizepdfInput.files.length) { resizepdfStatus.textContent = 'اختر ملف PDF'; return; }
      resizepdfStatus.textContent = '⏳ قراءة الملف...';
      const arr = await readFileAsArrayBuffer(resizepdfInput.files[0]);
      resizepdfStatus.textContent = '⏳ ضغط وإعادة إنشاء PDF (قد يستغرق وقتًا)...';
      const q = parseFloat($('resizepdf-quality') ? $('resizepdf-quality').value : 0.6) || 0.6;
      const blob = await compressPdfArrayBuffer(arr, q);
      downloadBlob(blob, 'compressed.pdf');
      resizepdfStatus.textContent = '✅ تم الإنشاء';
    } catch (e) { resizepdfStatus.textContent = 'خطأ: ' + (e.message||e); console.error(e); }
  });
}

/* ========== تحويل النص إلى ملفات (.txt/.docx/.xlsx/.pptx) ========== */
const btnConvertFile = $('btn-convertfile'), convertInput = $('convert-input'), convertStatus = $('convert-status');
if (btnConvertFile && convertInput) {
  btnConvertFile.addEventListener('click', async () => {
    convertStatus.textContent = '';
    const text = (convertInput.value || '').trim();
    if (!text) { convertStatus.textContent = 'أدخل نصًا للتحويل.'; return; }
    const type = $('convert-type') ? $('convert-type').value : 'txt';
    try {
      convertStatus.textContent = '⏳ جاري التحويل...';
      if (type === 'txt') {
        downloadBlob(new Blob([text], { type:'text/plain;charset=utf-8' }), 'document.txt');
      } else if (type === 'docx') {
        if (!window.docx) throw new Error('مكتبة docx غير محمّلة');
        const { Document, Packer, Paragraph, TextRun } = window.docx;
        const doc = new Document({ sections: [{ children: [ new Paragraph({ children: [ new TextRun(text) ] }) ] }] });
        const packer = new Packer();
        const buffer = await packer.toBuffer(doc);
        downloadBlob(new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'document.docx');
      } else if (type === 'xlsx') {
        if (!window.XLSX) throw new Error('مكتبة XLSX غير محمّلة');
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([[text]]);
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        const out = XLSX.write(wb, { bookType:'xlsx', type:'array' });
        downloadBlob(new Blob([out], { type:'application/octet-stream' }), 'document.xlsx');
      } else if (type === 'pptx') {
        if (!window.PptxGenJS) throw new Error('مكتبة PptxGenJS غير محمّلة');
        const pptx = new PptxGenJS();
        const slide = pptx.addSlide();
        slide.addText(text, { x:0.5, y:0.5, w:'90%', h:2, fontSize:14 });
        await pptx.writeFile({ fileName:'presentation.pptx' });
      } else {
        throw new Error('نوع غير مدعوم');
      }
      convertStatus.textContent = '✅ تم التحويل';
    } catch (e) {
      convertStatus.textContent = 'خطأ: ' + (e.message || e);
      console.error(e);
    }
  });
}

/* ========== تغيير حجم صورة وتغيير نوعها (Canvas) ========== */
const resizeImgInput = $('resizeimg-input'), resizeImgWidth = $('resizeimg-width'), resizeImgHeight = $('resizeimg-height'), resizeImgFormat = $('resizeimg-format'), btnResizeImg = $('btn-resizeimg'), resizeImgCanvas = $('resizeimg-canvas'), resizeImgDownload = $('resizeimg-download'), resizeImgStatus = $('resizeimg-status');
if (btnResizeImg && resizeImgInput) {
  btnResizeImg.addEventListener('click', async ()=>{
    resizeImgStatus.textContent = '';
    try {
      if (!resizeImgInput.files.length) { resizeImgStatus.textContent = 'اختر صورة أولاً'; return; }
      const f = resizeImgInput.files[0];
      const dataUrl = await readFileAsDataURL(f);
      const img = new Image(); await new Promise((res,rej)=>{ img.onload=res; img.onerror=rej; img.src=dataUrl; });
      let w = parseInt(resizeImgWidth.value) || img.width;
      let h = parseInt(resizeImgHeight.value) || img.height;
      if (!resizeImgWidth.value && resizeImgHeight.value) w = Math.round(img.width * (h / img.height));
      if (resizeImgWidth.value && !resizeImgHeight.value) h = Math.round(img.height * (w / img.width));
      resizeImgCanvas.width = w; resizeImgCanvas.height = h;
      const ctx = resizeImgCanvas.getContext('2d'); ctx.clearRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
      const fmt = resizeImgFormat.value || 'jpeg';
      const mime = fmt === 'png' ? 'image/png' : (fmt === 'webp' ? 'image/webp' : 'image/jpeg');
      const outData = resizeImgCanvas.toDataURL(mime, 0.92);
      const blob = dataURLtoBlob(outData);
      downloadBlob(blob, `image_converted.${fmt === 'jpeg' ? 'jpg' : fmt}`);
      const url = URL.createObjectURL(blob);
      if (resizeImgDownload) { resizeImgDownload.href = url; resizeImgDownload.download = `image_converted.${fmt === 'jpeg' ? 'jpg' : fmt}`; resizeImgDownload.style.display='inline-block'; resizeImgDownload.textContent='⬇️ تحميل الصورة'; }
      resizeImgStatus.textContent = '✅ تم التغيير';
    } catch (e) { resizeImgStatus.textContent = 'خطأ: ' + (e.message || e); console.error(e); }
  });
}

/* ========== Text-to-Speech (TTS) ========== */
const btnTts = $('btn-tts');
if (btnTts) {
  btnTts.addEventListener('click', () => {
    const text = ($('tts-input') && $('tts-input').value) || '';
    if (!text.trim()) { alert('أدخل نصًا لتشغيله'); return; }
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ar-SA';
    utter.rate = 1;
    utter.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  });
}

/* ========== Cleanup: terminate worker on unload ========== */
window.addEventListener('beforeunload', async () => {
  try {
    if (tesseractWorker && typeof tesseractWorker.terminate === 'function') {
      await tesseractWorker.terminate();
      tesseractWorker = null;
      tesseractInitialized = false;
    }
  } catch (e) { /* ignore */ }
});

/* ========== Utilities: optional functions (summarize helper) ========== */
/* يمكنك استخدام summarizeBasic(text, n) إذا رغبت باستدعائها من أماكن أخرى */
function summarizeBasic(text, maxSentences = 3) {
  if (!text) return '';
  const sentences = text.match(/[^.!؟\n]+[.!؟]?/g) || [text];
  const stop = new Set(['و','في','من','على','إلى','عن','أن','كان','ما','لم','لا','هو','هي','هذا','هذه','ذلك','مع','كل','قد','كما','إن','أو','حتى','أي','عن','كانت','the','and','is','in','to','of']);
  const words = text.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu,' ').split(/\s+/).filter(Boolean);
  const freq = {}; words.forEach(w=>{ if(!stop.has(w)) freq[w] = (freq[w]||0) + 1; });
  const scores = sentences.map(s=>{
    const ws = s.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu,' ').split(/\s+/).filter(Boolean);
    return ws.reduce((acc,w)=> acc + (freq[w]||0), 0);
  });
  const idx = scores.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v).slice(0, Math.min(maxSentences,sentences.length)).map(x=>x.i).sort((a,b)=>a-b);
  return idx.map(i=>sentences[i].trim()).join(' ').trim();
}

/* ========== نهاية الملف ========== */
/* إذا رغبت أن أعدل أي وظيفة (مثلاً: تحسين سرعة OCR، أو تغيير طريقة ضغط PDF، أو ربط Google Translate بمفتاحك)، قل لي وسأحدث الملف فورًا. */
