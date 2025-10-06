/* script.js for Copy.Ai
   - OCR: Tesseract + pdf.js (PDF -> canvases -> OCR)
   - images -> PDF: jsPDF
   - PDF rebuild/compress: pdf-lib (embed compressed images)
   - convert text -> docx/xlsx/pptx/txt
   - resize images via Canvas
   Developed by: محمود محمد محمود أبو الفتوح أحمد العزيري
*/

/* ---------- Helpers ---------- */
function by(id){ return document.getElementById(id); }
function readFileAsDataURL(file){
  return new Promise((res, rej)=>{
    const fr = new FileReader();
    fr.onload = ()=>res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}
function readFileAsArrayBuffer(file){
  return new Promise((res, rej)=>{
    const fr = new FileReader();
    fr.onload = ()=>res(fr.result);
    fr.onerror = rej;
    fr.readAsArrayBuffer(file);
  });
}
function dataURLtoBlob(dataurl){
  const arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]); let n = bstr.length; const u8 = new Uint8Array(n);
  while(n--) u8[n] = bstr.charCodeAt(n);
  return new Blob([u8], {type: mime});
}
function downloadBlob(blob, name){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ---------- Theme ---------- */
const themeToggle = by('theme-toggle');
const saved = localStorage.getItem('copyai_theme') || 'light';
if (saved === 'dark') document.body.classList.add('dark-mode');
themeToggle.textContent = saved==='dark' ? '☀️' : '🌙';
themeToggle.onclick = ()=> {
  document.body.classList.toggle('dark-mode');
  const now = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
  localStorage.setItem('copyai_theme', now);
  themeToggle.textContent = now==='dark' ? '☀️' : '🌙';
};

/* ---------- Navigation ---------- */
function openSection(id){
  // hide all panels and home
  document.querySelectorAll('.panel').forEach(p=>{p.classList.remove('active')});
  document.getElementById('home').style.display = 'none';
  const el = document.getElementById(id);
  if (el) { el.classList.add('active'); el.style.display = 'block'; window.scrollTo({top:0,behavior:'smooth'}); }
}
function goHome(){
  document.querySelectorAll('.panel').forEach(p=>{p.classList.remove('active'); p.style.display='none';});
  document.getElementById('home').style.display = 'block';
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ---------- OCR: PDF -> canvases -> Tesseract.recognize ---------- */
const extractFile = by('extract-file');
const btnExtract = by('btn-extract');
const extractStatus = by('extract-status');
const extractOutput = by('extract-output');

async function pdfToImageDataURLs(arrayBuffer){
  // uses pdf.js (window.pdfjsLib)
  const pdfjsLib = window['pdfjs-dist/build/pdf'] || window['pdfjsLib'] || window.pdfjsLib;
  if(!pdfjsLib || !pdfjsLib.getDocument) pdfjsLib = window['pdfjsLib'];
  if(!pdfjsLib || !pdfjsLib.getDocument) throw new Error('pdf.js لم يتم تحميله.');
  // ensure workerSrc if absent
  if(pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc){
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.14.305/pdf.worker.min.js';
  }
  const loadingTask = pdfjsLib.getDocument({data: arrayBuffer});
  const pdf = await loadingTask.promise;
  const urls = [];
  for(let p=1;p<=pdf.numPages;p++){
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({scale:1.5}); // scale for better OCR
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({canvasContext: ctx, viewport}).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    urls.push(dataUrl);
    // free memory by removing canvas (garbage-collected)
  }
  return urls;
}

async function ocrFromImageDataURL(dataUrl, langHint='ara+eng', progressCallback){
  if(!window.Tesseract) throw new Error('Tesseract.js غير محمّل.');
  const worker = window.Tesseract.createWorker({
    logger: m => {
      if(progressCallback) progressCallback(m);
    }
  });
  await worker.load();
  // نحمّل كلا اللغتين العربية والإنجليزية لزيادة الدقّة
  await worker.loadLanguage(langHint);
  await worker.initialize(langHint);
  const { data: { text } } = await worker.recognize(dataUrl);
  await worker.terminate();
  return text;
}

btnExtract && btnExtract.addEventListener('click', async ()=>{
  extractOutput.textContent = '';
  extractStatus.textContent = '';
  if(!extractFile.files.length){ alert('اختر ملفًا أولاً'); return; }
  const f = extractFile.files[0];
  try{
    extractStatus.textContent = '⏳ جارٍ المعالجة...';
    if(f.type === 'application/pdf'){
      // read as arrayBuffer and convert pages to images
      const arr = await readFileAsArrayBuffer(f);
      extractStatus.textContent = '⏳ تحويل صفحات PDF إلى صور...';
      const images = await pdfToImageDataURLs(arr);
      let combinedText = '';
      for(let i=0;i<images.length;i++){
        extractStatus.textContent = `⏳ OCR صفحة ${i+1}/${images.length} ...`;
        const txt = await ocrFromImageDataURL(images[i], 'ara+eng', (m)=>{/* optional logging */});
        combinedText += `\n\n--- صفحة ${i+1} ---\n` + txt;
      }
      extractOutput.textContent = combinedText.trim() || 'لا يوجد نص مرئي.';
      // put into summary input for convenience
      by('summary-input').value = combinedText.trim();
      extractStatus.textContent = '✅ اكتمل الاستخراج';
    } else if (f.type.startsWith('image/')) {
      extractStatus.textContent = '⏳ جاري استخراج النص من الصورة...';
      const dataUrl = await readFileAsDataURL(f);
      const txt = await ocrFromImageDataURL(dataUrl, 'ara+eng', (m)=>{ if(m && m.status) extractStatus.textContent = `${m.status} ${(m.progress||0)*100|0}%`; });
      extractOutput.textContent = txt || 'لا يوجد نص مرئي.';
      by('summary-input').value = txt || '';
      extractStatus.textContent = '✅ اكتمل الاستخراج';
    } else {
      extractStatus.textContent = 'نوع الملف غير مدعوم للاستخراج.';
    }
  }catch(err){
    console.error(err);
    extractStatus.textContent = 'خطأ: ' + (err.message || err);
  }
});

/* ---------- تلخيص النص (خوارزمية استخراجية بسيطة) ---------- */
const btnSummarize = by('btn-summarize');
const summaryInput = by('summary-input');
const summaryOutput = by('summary-output');
const summarySentencesSel = by('summary-sentences');

function summarizeTextBasic(text, maxSentences=2){
  if(!text) return '';
  const sentences = text.match(/[^.!؟\n]+[.!؟]?/g) || [text];
  const stop = new Set(['و','في','من','على','إلى','عن','أن','كان','ما','لم','لا','هو','هي','هذا','هذه','ذلك','مع','كل','قد','كما','إن','أو','حتى','أي','عن','كانت','the','and','is','in','to','of']);
  const words = text.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu,' ').split(/\s+/).filter(Boolean);
  const freq = {};
  words.forEach(w=>{ if(!stop.has(w)) freq[w] = (freq[w]||0)+1; });
  const scores = sentences.map(s=>{
    const ws = s.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu,' ').split(/\s+/).filter(Boolean);
    return ws.reduce((sum,w)=> sum + (freq[w]||0), 0);
  });
  const idx = scores.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v).slice(0, Math.min(maxSentences,sentences.length)).map(x=>x.i).sort((a,b)=>a-b);
  return idx.map(i=>sentences[i].trim()).join(' ').trim();
}

btnSummarize && btnSummarize.addEventListener('click', ()=>{
  const txt = summaryInput.value.trim();
  if(!txt){ alert('أدخل نصًا أولًا'); return; }
  const n = parseInt(summarySentencesSel.value) || 2;
  summaryOutput.textContent = '⏳ جاري التلخيص...';
  setTimeout(()=> {
    try{
      const s = summarizeTextBasic(txt, n);
      summaryOutput.textContent = s || 'لم يتم إنتاج ملخص.';
    }catch(e){ summaryOutput.textContent = 'خطأ أثناء التلخيص.'; console.error(e); }
  }, 200);
});

/* ---------- Translate panel: فقط عرض النص المستخرج حالياً ---------- */
const translateFile = by('translate-file'), btnTranslate = by('btn-translate'), translateOutput = by('translate-output');
btnTranslate && btnTranslate.addEventListener('click', async ()=>{
  translateOutput.textContent = '';
  if(!translateFile.files.length){ alert('اختر ملفًا'); return; }
  const f = translateFile.files[0];
  if(f.type === 'application/pdf'){
    translateOutput.textContent = '⏳ تحويل صفحات PDF إلى صور ثم استخراج النص...';
    const arr = await readFileAsArrayBuffer(f);
    const images = await pdfToImageDataURLs(arr);
    let txtAll = '';
    for(let i=0;i<images.length;i++){
      translateOutput.textContent = `⏳ صفحة ${i+1}/${images.length} - استخراج...`;
      const t = await ocrFromImageDataURL(images[i], 'ara+eng');
      txtAll += `\n\n--- صفحة ${i+1} ---\n` + t;
    }
    translateOutput.textContent = txtAll.trim();
  } else if (f.type.startsWith('image/')) {
    translateOutput.textContent = '⏳ استخراج النص من الصورة...';
    const dataUrl = await readFileAsDataURL(f);
    const txt = await ocrFromImageDataURL(dataUrl, 'ara+eng');
    translateOutput.textContent = txt || 'لا يوجد نص.';
  } else translateOutput.textContent = 'نوع ملف غير مدعوم.';
});

/* ---------- images -> PDF (jsPDF) ---------- */
const img2pdfInput = by('img2pdf-input'), btnImg2Pdf = by('btn-img2pdf'), img2pdfDownload = by('img2pdf-download'), img2pdfStatus = by('img2pdf-status');

async function createPdfFromImages(files){
  // ensure jsPDF available
  if(!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF غير محمّل.');
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit:'px', format:'a4' });
  for(let i=0;i<files.length;i++){
    const f = files[i];
    const dataUrl = await readFileAsDataURL(f);
    const img = new Image();
    await new Promise((res,rej)=>{ img.onload = res; img.onerror=rej; img.src = dataUrl; });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 20;
    let iw = img.width, ih = img.height;
    const ratio = Math.min((pageW-margin*2)/iw, (pageH-margin*2)/ih, 1);
    const drawW = iw * ratio, drawH = ih * ratio;
    const x = (pageW - drawW)/2, y = (pageH - drawH)/2;
    const fmt = f.type && f.type.includes('png') ? 'PNG' : 'JPEG';
    pdf.addImage(dataUrl, fmt, x, y, drawW, drawH);
    if(i < files.length-1) pdf.addPage();
  }
  // save
  pdf.save('images-to-pdf.pdf');
  // also return blob link
  const blob = pdf.output('blob');
  return blob;
}

btnImg2Pdf && btnImg2Pdf.addEventListener('click', async ()=>{
  img2pdfStatus.textContent = '';
  if(!img2pdfInput.files.length){ alert('اختر صورًا'); return; }
  try{
    img2pdfStatus.textContent = '⏳ جاري إنشاء PDF...';
    const blob = await createPdfFromImages(Array.from(img2pdfInput.files));
    img2pdfStatus.textContent = '✅ تم الإنشاء';
    downloadBlob(blob, 'images-to-pdf.pdf');
  }catch(err){ img2pdfStatus.textContent = 'خطأ: '+(err.message||err); console.error(err); }
});

/* ---------- ضغط / إعادة بناء PDF (تقريبي) باستخدام pdf-lib ---------- */
const resizepdfInput = by('resizepdf-input'), btnResizePdf = by('btn-resizepdf'), resizepdfQuality = by('resizepdf-quality'), resizepdfDownload = by('resizepdf-download'), resizepdfStatus = by('resizepdf-status');

async function compressPdf(arrayBuffer, quality=0.6){
  // الفكرة: نحول صفحات PDF إلى صور (عبر pdf.js)، نضغطها عبر canvas، ثم ندرجها في pdf-lib
  const images = await pdfToImageDataURLs(arrayBuffer);
  const PDFLib = window.PDFLib;
  if(!PDFLib) throw new Error('pdf-lib غير محمّلة.');
  const newPdfDoc = await PDFLib.PDFDocument.create();
  for(let i=0;i<images.length;i++){
    resizepdfStatus.textContent = `⏳ ضغط صفحة ${i+1}/${images.length} ...`;
    // ضغط الصورة بتحويلها لـ canvas ثم toDataURL بجودة محددة
    const imgData = images[i];
    const imgBlob = dataURLtoBlob(imgData);
    const imgURL = URL.createObjectURL(imgBlob);
    const imgEl = await new Promise((res,rej)=>{ const im = new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=imgURL; });
    const canvas = document.createElement('canvas');
    const maxW = imgEl.width, maxH = imgEl.height;
    canvas.width = maxW; canvas.height = maxH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl,0,0);
    const compressed = canvas.toDataURL('image/jpeg', quality);
    const compressedBytes = await (await fetch(compressed)).arrayBuffer();
    const jpgImage = await newPdfDoc.embedJpg(compressedBytes);
    const page = newPdfDoc.addPage([jpgImage.width, jpgImage.height]);
    page.drawImage(jpgImage, { x:0, y:0, width: jpgImage.width, height: jpgImage.height });
    URL.revokeObjectURL(imgURL);
  }
  const out = await newPdfDoc.save();
  return new Blob([out], { type: 'application/pdf' });
}

btnResizePdf && btnResizePdf.addEventListener('click', async ()=>{
  resizepdfStatus.textContent = '';
  if(!resizepdfInput.files.length){ alert('اختر PDF'); return; }
  const f = resizepdfInput.files[0];
  try{
    resizepdfStatus.textContent = '⏳ قراءة الملف...';
    const arr = await readFileAsArrayBuffer(f);
    resizepdfStatus.textContent = '⏳ ضغط وإعادة بناء PDF (قد يستغرق وقتًا)...';
    const q = parseFloat(resizepdfQuality.value) || 0.6;
    const blob = await compressPdf(arr, q);
    resizepdfStatus.textContent = '✅ اكتمل الضغط';
    downloadBlob(blob, 'compressed.pdf');
  }catch(err){ resizepdfStatus.textContent = 'خطأ: ' + (err.message || err); console.error(err); }
});

/* ---------- تحويل النص إلى docx/xlsx/pptx/txt ---------- */
const btnConvertFile = by('btn-convertfile'), convertInput = by('convert-input'), convertType = by('convert-type'), convertStatus = by('convert-status');

btnConvertFile && btnConvertFile.addEventListener('click', async ()=>{
  convertStatus.textContent = '';
  const text = (convertInput.value || '').trim();
  if(!text){ alert('أدخل نصًا لتحويله'); return; }
  const type = convertType.value;
  try{
    convertStatus.textContent = '⏳ جاري التحويل...';
    if(type === 'txt'){
      const blob = new Blob([text], { type:'text/plain;charset=utf-8' });
      downloadBlob(blob, 'document.txt');
    } else if (type === 'docx'){
      // استخدام مكتبة docx (global docx)
      const { Document, Packer, Paragraph, TextRun } = window.docx;
      const doc = new Document({ sections: [{ children: [ new Paragraph({ children: [ new TextRun(text) ] }) ] }] });
      const packer = new Packer();
      const arrayBuffer = await packer.toBuffer(doc);
      downloadBlob(new Blob([arrayBuffer], {type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}), 'document.docx');
    } else if (type === 'xlsx'){
      // ملف Excel بسيط: نضع النص في خلية A1
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([[text]]);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const wbout = XLSX.write(wb, { bookType:'xlsx', type:'array' });
      downloadBlob(new Blob([wbout], { type:'application/octet-stream' }), 'document.xlsx');
    } else if (type === 'pptx'){
      // PptxGenJS بسيط: صفحة واحدة مع نص
      const pptx = new PptxGenJS();
      const slide = pptx.addSlide();
      slide.addText(text, { x:0.5, y:0.5, w:'90%', h:'80%', fontSize:14, color:'363636' });
      await pptx.writeFile({ fileName: 'presentation.pptx' });
    } else {
      alert('نوع غير مدعوم');
    }
    convertStatus.textContent = '✅ تم التحويل';
  }catch(err){
    convertStatus.textContent = 'خطأ: ' + (err.message || err);
    console.error(err);
  }
});

/* ---------- تغيير حجم الصورة وتغيير نوعها ---------- */
const resizeImgInput = by('resizeimg-input'), resizeImgW = by('resizeimg-width'), resizeImgH = by('resizeimg-height'), resizeImgFormat = by('resizeimg-format'), btnResizeImg = by('btn-resizeimg'), resizeImgDownload = by('resizeimg-download'), resizeImgCanvas = by('resizeimg-canvas'), resizeImgStatus = by('resizeimg-status');

btnResizeImg && btnResizeImg.addEventListener('click', async ()=>{
  resizeImgStatus.textContent = '';
  if(!resizeImgInput.files.length){ alert('اختر صورة'); return; }
  const f = resizeImgInput.files[0];
  try{
    resizeImgStatus.textContent = '⏳ جاري القراءة...';
    const dataUrl = await readFileAsDataURL(f);
    const img = new Image();
    await new Promise((res, rej)=>{ img.onload=res; img.onerror=rej; img.src = dataUrl; });
    let targetW = parseInt(resizeImgW.value) || img.width;
    let targetH = parseInt(resizeImgH.value) || img.height;
    if(!resizeImgW.value && resizeImgH.value) targetW = Math.round(img.width * (targetH/img.height));
    if(resizeImgW.value && !resizeImgH.value) targetH = Math.round(img.height * (targetW/img.width));
    resizeImgCanvas.width = targetW; resizeImgCanvas.height = targetH;
    const ctx = resizeImgCanvas.getContext('2d');
    ctx.clearRect(0,0,targetW,targetH);
    ctx.drawImage(img,0,0,targetW,targetH);
    const fmt = resizeImgFormat.value || 'jpeg';
    const mime = fmt==='png' ? 'image/png' : (fmt==='webp' ? 'image/webp' : 'image/jpeg');
    const outData = resizeImgCanvas.toDataURL(mime, 0.92);
    const blob = dataURLtoBlob(outData);
    downloadBlob(blob, `image_converted.${fmt==='jpeg'?'jpg':fmt}`);
    const url = URL.createObjectURL(blob);
    resizeImgDownload.href = url; resizeImgDownload.download = `image_converted.${fmt==='jpeg'?'jpg':fmt}`; resizeImgDownload.style.display='inline-block'; resizeImgDownload.textContent='⬇️ تحميل الصورة';
    resizeImgStatus.textContent = '✅ انتهى التعديل';
  }catch(err){ resizeImgStatus.textContent = 'خطأ: '+(err.message||err); console.error(err); }
});

/* ---------- init ---------- */
document.addEventListener('DOMContentLoaded', ()=>{
  // hide all panels initially
  document.querySelectorAll('.panel').forEach(p=>{ p.style.display='none'; p.classList.remove('active'); });
  document.getElementById('home').style.display = 'block';
});
