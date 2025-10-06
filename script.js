/* script.js — Copy.Ai (Dark luxury edition)
   - كل الخصائص في ملف واحد: OCR (صور+PDF), تلخيص, صور->PDF, ضغط PDF تقريبي, تحويل إلى docx/xlsx/pptx/txt, تعديل الصور, TTS, splash
   - Developed by: محمود محمد محمود أبو الفتوح أحمد العزيري
*/

/* ---------- عناصر مساعدة ---------- */
const $ = id => document.getElementById(id);
const readFileAsDataURL = file => new Promise((res,rej)=>{
  const fr = new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(file);
});
const readFileAsArrayBuffer = file => new Promise((res,rej)=>{
  const fr = new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsArrayBuffer(file);
});
const dataURLtoBlob = dataurl => {
  const arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1], bstr = atob(arr[1]), n=bstr.length, u8=new Uint8Array(n);
  while(n--) u8[n]=bstr.charCodeAt(n);
  return new Blob([u8], {type:mime});
};
const downloadBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
};

/* ---------- Splash screen + صوت ترحيبي ---------- */
window.addEventListener('load', () => {
  const splash = $('splash-screen');
  // محاولة تشغيل صوت (قد يُمنع آليًا إن لم يضغط المستخدم)
  const audio = $('splash-audio');
  if (audio) {
    try { audio.play().catch(()=>{}); } catch(e){}
  }
  setTimeout(()=> {
    if (splash) { splash.style.opacity = '0'; setTimeout(()=> splash.style.display='none', 600); }
  }, 2800);
});

/* ---------- Theme toggle (يحفظ في localStorage) ---------- */
const themeToggle = $('theme-toggle');
const savedTheme = localStorage.getItem('copyai_theme') || 'dark';
if (savedTheme === 'dark') document.body.classList.add('dark-mode');
themeToggle.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  const now = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
  localStorage.setItem('copyai_theme', now);
  themeToggle.textContent = now === 'dark' ? '☀️' : '🌙';
});

/* ---------- Navigation: عرض الأقسام داخل SPA ---------- */
document.querySelectorAll('.card').forEach(c => {
  c.addEventListener('click', () => {
    const id = c.getAttribute('data-section');
    openSection(id);
  });
});
function openSection(id){
  document.querySelectorAll('.panel').forEach(p => { p.classList.remove('active'); p.style.display='none'; });
  $('home').classList.remove('active'); $('home').style.display='none';
  const el = $(id);
  if(el){ el.classList.add('active'); el.style.display='block'; window.scrollTo({top:0,behavior:'smooth'}); }
}
function goHome(){
  document.querySelectorAll('.panel').forEach(p => { p.classList.remove('active'); p.style.display='none'; });
  const home = $('home'); if(home){ home.style.display='block'; home.classList.add('active'); }
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ---------- OCR: دعم PDF (pdf.js) وصور (Tesseract.js) ---------- */
const extractFile = $('extract-file'), btnExtract = $('btn-extract'), extractStatus = $('extract-status'), extractOutput = $('extract-output');

// دالة لتحويل PDF إلى dataURLs صور عبر pdf.js
async function pdfToImageDataURLs(arrayBuffer){
  const pdfjsLib = window['pdfjsLib'] || window['pdfjs-dist/build/pdf'] || window['pdfjs'];
  if(!pdfjsLib || !pdfjsLib.getDocument) throw new Error('pdf.js غير محمَّل');
  if(pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc){
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.14.305/pdf.worker.min.js';
  }
  const loading = pdfjsLib.getDocument({data: arrayBuffer});
  const pdf = await loading.promise;
  const urls = [];
  for(let p=1;p<=pdf.numPages;p++){
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({scale:1.5});
    const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({canvasContext:ctx, viewport}).promise;
    urls.push(canvas.toDataURL('image/jpeg', 0.95));
  }
  return urls;
}

// دالة OCR على dataURL (بتصفية الlog لإخفاء 'initialized tesseract')
async function ocrFromDataURL(dataUrl, lang='ara+eng', onProgress){
  if(!window.Tesseract) throw new Error('Tesseract.js غير محمّل');
  const worker = window.Tesseract.createWorker({
    logger: m => {
      // تجاهل رسائل التهيئة التي تسبب ظهور "initialized tesseract 100%"
      if (m && typeof m.status === 'string') {
        const s = m.status.toLowerCase();
        if (s.includes('initializing tesseract') || s.includes('initialized tesseract')) return;
      }
      if (onProgress) onProgress(m);
    }
  });
  await worker.load();
  await worker.loadLanguage(lang);
  await worker.initialize(lang);
  const { data: { text } } = await worker.recognize(dataUrl);
  await worker.terminate();
  return text;
}

btnExtract && btnExtract.addEventListener('click', async ()=>{
  extractOutput.textContent = ''; extractStatus.textContent = '';
  if(!extractFile.files.length){ extractStatus.textContent = 'اختر ملفًا أولاً'; return; }
  const f = extractFile.files[0];
  try{
    extractStatus.textContent = '⏳ جاري المعالجة...';
    if(f.type === 'application/pdf'){
      const arr = await readFileAsArrayBuffer(f);
      extractStatus.textContent = '⏳ تحويل صفحات PDF إلى صور...';
      const images = await pdfToImageDataURLs(arr);
      let combined = '';
      for(let i=0;i<images.length;i++){
        extractStatus.textContent = `⏳ OCR صفحة ${i+1}/${images.length}...`;
        const txt = await ocrFromDataURL(images[i], 'ara+eng', m=>{ /* optional progress */ });
        combined += `\n\n--- صفحة ${i+1} ---\n` + (txt || '');
      }
      extractOutput.textContent = combined.trim() || 'لم يتم العثور على نص.';
      $('summary-input').value = combined.trim();
      extractStatus.textContent = '✅ تم الاستخراج';
    } else if (f.type.startsWith('image/')) {
      const d = await readFileAsDataURL(f);
      extractStatus.textContent = '⏳ جاري استخراج النص من الصورة...';
      const txt = await ocrFromDataURL(d, 'ara+eng', m=>{ if(m && m.status) extractStatus.textContent = `${m.status} ${(m.progress||0)*100|0}%`; });
      extractOutput.textContent = txt || 'لم يتم العثور على نص.';
      $('summary-input').value = txt || '';
      extractStatus.textContent = '✅ تم الاستخراج';
    } else {
      extractStatus.textContent = 'نوع ملف غير مدعوم للاستخراج.';
    }
  }catch(err){
    extractStatus.textContent = 'خطأ: ' + (err.message || err);
    console.error(err);
  }
});

/* ---------- تلخيص نص بسيط محليًا ---------- */
const btnSummarize = $('btn-summarize'), summaryInput = $('summary-input'), summaryOutput = $('summary-output'), summarySentences = $('summary-sentences');
function summarizeBasic(text, n=2){
  if(!text) return '';
  const sentences = text.match(/[^.!؟\n]+[.!؟]?/g) || [text];
  const stop = new Set(['و','في','من','على','إلى','عن','أن','كان','ما','لم','لا','هو','هي','هذا','هذه','ذلك','مع','كل','قد','كما','إن','أو','حتى','أي','عن','كانت','the','and','is','in','to','of']);
  const words = text.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu,' ').split(/\s+/).filter(Boolean);
  const freq = {}; words.forEach(w => { if(!stop.has(w)) freq[w] = (freq[w]||0)+1; });
  const scores = sentences.map(s => {
    const ws = s.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu,' ').split(/\s+/).filter(Boolean);
    return ws.reduce((a,w)=> a + (freq[w]||0), 0);
  });
  const idx = scores.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v).slice(0, Math.min(n,sentences.length)).map(x=>x.i).sort((a,b)=>a-b);
  return idx.map(i=>sentences[i].trim()).join(' ').trim();
}
btnSummarize && btnSummarize.addEventListener('click', ()=>{
  const t = (summaryInput.value||'').trim();
  if(!t){ alert('أدخل نصًا أولًا'); return; }
  const n = parseInt(summarySentences.value) || 2;
  summaryOutput.textContent = '⏳ جاري التلخيص...';
  setTimeout(()=> {
    try{ summaryOutput.textContent = summarizeBasic(t, n) || 'لم يتم إنتاج ملخص.'; } catch(e){ summaryOutput.textContent='خطأ أثناء التلخيص'; }
  }, 200);
});

/* ---------- Translate: استخراج وعرض (يمكن ربط خدمة ترجمة لاحقًا) ---------- */
const translateFile = $('translate-file'), btnTranslate = $('btn-translate'), translateOutput = $('translate-output');
btnTranslate && btnTranslate.addEventListener('click', async ()=>{
  translateOutput.textContent=''; if(!translateFile.files.length){ translateOutput.textContent='اختر ملفًا أولاً'; return; }
  const f = translateFile.files[0];
  try {
    if(f.type === 'application/pdf'){
      const arr = await readFileAsArrayBuffer(f);
      translateOutput.textContent = '⏳ تحويل صفحات PDF إلى صور واستخراج النص...';
      const imgs = await pdfToImageDataURLs(arr);
      let txt=''; for(let i=0;i<imgs.length;i++){ translateOutput.textContent=`⏳ صفحة ${i+1}/${imgs.length}`; txt += `\n\n--- صفحة ${i+1} ---\n` + (await ocrFromDataURL(imgs[i], 'ara+eng')); }
      translateOutput.textContent = txt.trim();
    } else if (f.type.startsWith('image/')) {
      translateOutput.textContent = '⏳ استخراج النص من الصورة...';
      const d = await readFileAsDataURL(f);
      translateOutput.textContent = await ocrFromDataURL(d, 'ara+eng');
    } else translateOutput.textContent='نوع ملف غير مدعوم.';
  } catch(e){ translateOutput.textContent='خطأ: '+(e.message||e); console.error(e); }
});

/* ---------- images -> PDF (jsPDF) ---------- */
const img2pdfInput = $('img2pdf-input'), btnImg2Pdf = $('btn-img2pdf'), img2pdfDownload = $('img2pdf-download'), img2pdfStatus = $('img2pdf-status');
async function createPdfFromImages(files){
  if(!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF غير محمّل');
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit:'px', format:'a4' });
  for(let i=0;i<files.length;i++){
    const dataUrl = await readFileAsDataURL(files[i]);
    const img = new Image(); await new Promise((res,rej)=>{ img.onload=res; img.onerror=rej; img.src=dataUrl; });
    const pageW = pdf.internal.pageSize.getWidth(), pageH = pdf.internal.pageSize.getHeight(), margin=20;
    const ratio = Math.min((pageW-margin*2)/img.width, (pageH-margin*2)/img.height, 1);
    const drawW = img.width*ratio, drawH = img.height*ratio, x=(pageW-drawW)/2, y=(pageH-drawH)/2;
    const fmt = files[i].type && files[i].type.includes('png') ? 'PNG' : 'JPEG';
    pdf.addImage(dataUrl, fmt, x, y, drawW, drawH);
    if(i<files.length-1) pdf.addPage();
  }
  return pdf;
}
btnImg2Pdf && btnImg2Pdf.addEventListener('click', async ()=>{
  img2pdfStatus.textContent=''; if(!img2pdfInput.files.length){ alert('اختر صورًا'); return; }
  try{
    img2pdfStatus.textContent='⏳ جاري إنشاء PDF...';
    const pdf = await createPdfFromImages(Array.from(img2pdfInput.files));
    const blob = pdf.output('blob');
    downloadBlob(blob, 'images-to-pdf.pdf'); img2pdfStatus.textContent='✅ تم الإنشاء';
  }catch(err){ img2pdfStatus.textContent='خطأ: '+(err.message||err); console.error(err); }
});

/* ---------- ضغط / إعادة بناء PDF (تقريبي) باستخدام pdf-lib ---------- */
const resizepdfInput = $('resizepdf-input'), btnResizePdf = $('btn-resizepdf'), resizepdfQuality = $('resizepdf-quality'), resizepdfStatus = $('resizepdf-status');
async function compressPdf(arrayBuffer, quality=0.6){
  const images = await pdfToImageDataURLs(arrayBuffer);
  const PDFLib = window.PDFLib;
  if(!PDFLib) throw new Error('pdf-lib غير محمّل');
  const newDoc = await PDFLib.PDFDocument.create();
  for(let i=0;i<images.length;i++){
    resizepdfStatus.textContent=`⏳ ضغط صفحة ${i+1}/${images.length}...`;
    const compressedData = await (await fetch(images[i])).arrayBuffer();
    const jpgImage = await newDoc.embedJpg(compressedData);
    const page = newDoc.addPage([jpgImage.width, jpgImage.height]);
    page.drawImage(jpgImage, { x:0, y:0, width: jpgImage.width, height: jpgImage.height });
  }
  const out = await newDoc.save();
  return new Blob([out], { type:'application/pdf' });
}
btnResizePdf && btnResizePdf.addEventListener('click', async ()=>{
  resizepdfStatus.textContent=''; if(!resizepdfInput.files.length){ alert('اختر PDF'); return; }
  try{
    resizepdfStatus.textContent='⏳ قراءة الملف...';
    const arr = await readFileAsArrayBuffer(resizepdfInput.files[0]);
    resizepdfStatus.textContent='⏳ يتم الضغط وإعادة الإنشاء...';
    const q = parseFloat(resizepdfQuality.value) || 0.6;
    const blob = await compressPdf(arr, q);
    downloadBlob(blob, 'compressed.pdf');
    resizepdfStatus.textContent='✅ تم الإنشاء';
  }catch(e){ resizepdfStatus.textContent='خطأ: '+(e.message||e); console.error(e); }
});

/* ---------- تحويل النص إلى docx/xlsx/pptx/txt ---------- */
const btnConvertFile = $('btn-convertfile'), convertInput = $('convert-input'), convertType = $('convert-type'), convertStatus = $('convert-status');
btnConvertFile && btnConvertFile.addEventListener('click', async ()=>{
  convertStatus.textContent=''; const text = (convertInput.value||'').trim(); if(!text){ alert('أدخل نصًا'); return; }
  const type = convertType.value;
  try{
    convertStatus.textContent='⏳ جاري التحويل...';
    if(type==='txt'){ downloadBlob(new Blob([text],{type:'text/plain'}), 'document.txt'); }
    else if(type==='docx'){
      const { Document, Packer, Paragraph, TextRun } = window.docx;
      const doc = new Document({ sections:[{ children:[ new Paragraph({ children:[ new TextRun(text) ] }) ] }] });
      const packer = new Packer();
      const arrayBuffer = await packer.toBuffer(doc);
      downloadBlob(new Blob([arrayBuffer],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}), 'document.docx');
    } else if(type==='xlsx'){
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([[text]]);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const wbout = XLSX.write(wb, { bookType:'xlsx', type:'array' });
      downloadBlob(new Blob([wbout],{type:'application/octet-stream'}), 'document.xlsx');
    } else if(type==='pptx'){
      const pptx = new PptxGenJS();
      const slide = pptx.addSlide();
      slide.addText(text, { x:0.5, y:0.6, w:'90%', h:2, fontSize:14, color:'000000' });
      await pptx.writeFile({ fileName:'presentation.pptx' });
    }
    convertStatus.textContent='✅ تم التحويل';
  }catch(e){ convertStatus.textContent='خطأ: '+(e.message||e); console.error(e); }
});

/* ---------- تغيير حجم الصور وتغيير النوع (Canvas) ---------- */
const resizeImgInput = $('resizeimg-input'), resizeImgWidth = $('resizeimg-width'), resizeImgHeight = $('resizeimg-height'), resizeImgFormat = $('resizeimg-format'), btnResizeImg = $('btn-resizeimg'), resizeImgDownload = $('resizeimg-download'), resizeImgCanvas = $('resizeimg-canvas'), resizeImgStatus = $('resizeimg-status');

btnResizeImg && btnResizeImg.addEventListener('click', async ()=>{
  resizeImgStatus.textContent=''; if(!resizeImgInput.files.length){ alert('اختر صورة'); return; }
  try{
    const f = resizeImgInput.files[0]; const dataUrl = await readFileAsDataURL(f);
    const img = new Image(); await new Promise((res,rej)=>{ img.onload=res; img.onerror=rej; img.src=dataUrl; });
    let w = parseInt(resizeImgWidth.value) || img.width; let h = parseInt(resizeImgHeight.value) || img.height;
    if(!resizeImgWidth.value && resizeImgHeight.value) w = Math.round(img.width * (h/img.height));
    if(resizeImgWidth.value && !resizeImgHeight.value) h = Math.round(img.height * (w/img.width));
    resizeImgCanvas.width = w; resizeImgCanvas.height = h;
    const ctx = resizeImgCanvas.getContext('2d'); ctx.clearRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
    const fmt = resizeImgFormat.value || 'jpeg'; const mime = fmt==='png' ? 'image/png' : (fmt==='webp' ? 'image/webp' : 'image/jpeg');
    const outData = resizeImgCanvas.toDataURL(mime, 0.92); const blob = dataURLtoBlob(outData);
    downloadBlob(blob, `image_converted.${fmt==='jpeg'?'jpg':fmt}`);
    const url = URL.createObjectURL(blob); resizeImgDownload.href=url; resizeImgDownload.download=`image_converted.${fmt==='jpeg'?'jpg':fmt}`; resizeImgDownload.style.display='inline-block'; resizeImgDownload.textContent='⬇️ تحميل الصورة';
    resizeImgStatus.textContent='✅ تم التعديل';
  }catch(e){ resizeImgStatus.textContent='خطأ: '+(e.message||e); console.error(e); }
});

/* ---------- نص إلى كلام (TTS) ---------- */
const btnTts = $('btn-tts');
btnTts && btnTts.addEventListener('click', () => {
  const t = ($('tts-input').value||'').trim(); if(!t){ alert('أدخل نصًا'); return; }
  const u = new SpeechSynthesisUtterance(t); u.lang='ar-SA'; u.rate=1; u.pitch=1; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
});

/* ---------- init: إخفاء الألواح عند البدء ---------- */
document.addEventListener('DOMContentLoaded', ()=> {
  document.querySelectorAll('.panel').forEach(p => { p.style.display='none'; p.classList.remove('active'); });
  $('home').style.display='block';
});
