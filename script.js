// Copy.Ai — دمج: تلخيص محلي + OpenAI API option
// ملاحظات: لو أردت حماية مفتاح OpenAI فلا تضعه في المتصفح، بل استعمل خادم وسيط.

// DOM
const fileInput = document.getElementById('fileInput');
const openCameraBtn = document.getElementById('openCameraBtn');
const cameraModal = document.getElementById('cameraModal');
const closeModal = document.getElementById('closeModal');
const chooseCameraBtns = document.querySelectorAll('.chooseCamera');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const cameraArea = document.getElementById('cameraArea');
const captureBtn = document.getElementById('captureBtn');
const retakeBtn = document.getElementById('retakeBtn');
const downloadImageBtn = document.getElementById('downloadImageBtn');
const langSelect = document.getElementById('langSelect');
const sentCount = document.getElementById('sentCount');
const summarizeBtn = document.getElementById('summarizeBtn');
const clearBtn = document.getElementById('clearBtn');
const extractedTextEl = document.getElementById('extractedText');
const loader = document.getElementById('loader');
const summaryEl = document.getElementById('summary');
const summaryMeta = document.getElementById('summaryMeta');
const summaryActions = document.getElementById('summaryActions');
const copyBtn = document.getElementById('copyBtn');
const downloadTxtBtn = document.getElementById('downloadTxtBtn');
const downloadPdfBtn = document.getElementById('downloadPdfBtn');
const historyList = document.getElementById('historyList');
const themeToggle = document.getElementById('themeToggle');
const historyBtn = document.getElementById('historyBtn');
const useAiCheckbox = document.getElementById('useAi');
const apiKeyInput = document.getElementById('openaiKey');
const apiKeyLabel = document.getElementById('apiKeyLabel');

let currentStream = null;
let lastImageBlob = null;
let extractedText = '';

// show/hide helpers
const show = el => el.classList.remove('hidden');
const hide = el => el.classList.add('hidden');

// Theme toggle
themeToggle.addEventListener('click', ()=>{
  document.body.classList.toggle('light');
  themeToggle.textContent = document.body.classList.contains('light') ? '☀️' : '🌙';
});

// History (localStorage)
function addToHistory(item){
  const raw = localStorage.getItem('copyai_history');
  const arr = raw ? JSON.parse(raw) : [];
  arr.unshift(item);
  localStorage.setItem('copyai_history', JSON.stringify(arr.slice(0,50)));
  renderHistory();
}
function renderHistory(){
  const raw = localStorage.getItem('copyai_history');
  const arr = raw ? JSON.parse(raw) : [];
  historyList.innerHTML = '';
  arr.forEach((it, idx)=>{
    const li = document.createElement('li');
    li.textContent = `${new Date(it.timestamp).toLocaleString()} — ${it.title}`;
    li.addEventListener('click', ()=>{
      if(it.type==='summary'){ summaryEl.textContent = it.text; }
      else if(it.type==='text'){ extractedTextEl.value = it.text; extractedText = it.text; }
      else if(it.type==='image'){ window.open(it.dataUrl, '_blank'); }
    });
    historyList.appendChild(li);
  });
}
renderHistory();

// --- File handling (PDF or image)
fileInput.addEventListener('change', async (e)=>{
  const f = e.target.files[0];
  if(!f) return;
  show(loader); hide(summaryActions); summaryEl.textContent='...'; extractedTextEl.value='';
  try {
    if(f.type === 'application/pdf'){
      const arr = new Uint8Array(await f.arrayBuffer());
      const pdf = await pdfjsLib.getDocument(arr).promise;
      let fullText = '';
      for(let p=1;p<=pdf.numPages;p++){
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        fullText += tc.items.map(i=>i.str).join(' ') + '\n';
      }
      extractedText = fullText.trim();
      extractedTextEl.value = extractedText;
      addToHistory({type:'text', title:`PDF: ${f.name}`, text:extractedText, timestamp:Date.now()});
    } else if(f.type.startsWith('image/')){
      const lang = langSelect.value || 'eng';
      const { data: { text } } = await Tesseract.recognize(f, lang);
      extractedText = text.trim();
      extractedTextEl.value = extractedText;
      addToHistory({type:'text', title:`Image: ${f.name}`, text:extractedText, timestamp:Date.now()});
    } else {
      alert('صيغة الملف غير مدعومة');
    }
  } catch(err){
    alert('خطأ عند معالجة الملف: '+err.message);
  }
  hide(loader);
});

// --- Camera modal open/close
openCameraBtn.addEventListener('click', ()=> show(cameraModal));
closeModal.addEventListener('click', ()=> hide(cameraModal));

// choose camera (front/back)
chooseCameraBtns.forEach(btn=>{
  btn.addEventListener('click', async ()=>{
    const mode = btn.dataset.mode; // 'user' or 'environment'
    hide(cameraModal);
    if(currentStream){ currentStream.getTracks().forEach(t=>t.stop()); currentStream=null; }
    try{
      let constraints = { video: { facingMode: mode } };
      if(mode === 'environment') constraints = { video: { facingMode: { exact: 'environment' } } };
      currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    }catch(err){
      // fallback
      try { currentStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode } }); }
      catch(e){ alert('لا توجد الكاميرا المطلوبة: '+e.message); return; }
    }
    video.srcObject = currentStream;
    show(cameraArea);
    hide(canvas); hide(retakeBtn); hide(downloadImageBtn);
  });
});

// capture
captureBtn.addEventListener('click', ()=>{
  if(!currentStream) return alert('الكاميرا غير متاحة');
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d'); ctx.drawImage(video,0,0,canvas.width,canvas.height);
  hide(video); show(canvas); show(retakeBtn); show(downloadImageBtn);
  canvas.toBlob(async (blob)=>{
    lastImageBlob = blob;
    show(loader); extractedTextEl.value='';
    try{
      const lang = langSelect.value || 'eng';
      const { data: { text } } = await Tesseract.recognize(blob, lang);
      extractedText = text.trim(); extractedTextEl.value = extractedText;
      addToHistory({type:'image', title:'Captured Image', dataUrl:URL.createObjectURL(blob), text:extractedText, timestamp:Date.now()});
    }catch(err){
      alert('خطأ أثناء OCR: '+err.message);
    }
    hide(loader);
  }, 'image/png');
});

// retake
retakeBtn.addEventListener('click', ()=>{
  lastImageBlob = null; hide(canvas); show(video); hide(retakeBtn); hide(downloadImageBtn); extractedTextEl.value=''; extractedText='';
});

// download image
downloadImageBtn.addEventListener('click', ()=>{
  if(!lastImageBlob) return alert('لا توجد صورة للتحميل');
  saveAs(lastImageBlob, 'capture.png');
});

// --- Summarization modes
// local summarizer supports Arabic + English stopwords
const STOPWORDS_AR = new Set([
  'من','في','على','و','ما','إن','أن','ثم','لا','لن','لم','هو','هي','هذا','هذه','هناك','كل','بين','لدى','إلى','عن','حتى','بعد','قبل','قد','كان'
  // can expand list
]);
const STOPWORDS_EN = new Set(['the','and','of','to','a','in','is','it','that','for','on','with','as','are','was','this','by','an','be','or','from','at']);

// helper: tokenize and build freq excluding stopwords by selected language
function buildFreq(sentences, lang){
  const freq = {};
  const stop = (lang === 'ara') ? STOPWORDS_AR : STOPWORDS_EN;
  sentences.forEach(s=>{
    s.split(/\s+/).forEach(w=>{
      const k = w.replace(/[^\p{L}\p{N}]+/gu,'').toLowerCase();
      if(!k) return;
      if(stop.has(k)) return;
      freq[k] = (freq[k]||0) + 1;
    });
  });
  return freq;
}
function splitSentences(text){
  const s = text.replace(/\n+/g,' ').trim();
  // match sentences in Arabic and Latin punctuation
  return s.match(/[^.!؟!?]+[.!؟!?]*/g) || [s];
}
function extractiveSummary(sentences, n, lang){
  if(sentences.length <= n) return sentences.join(' ');
  const freq = buildFreq(sentences, lang);
  const scored = sentences.map(s=>{
    const words = s.split(/\s+/);
    let score = 0;
    words.forEach(w=>{
      const k = w.replace(/[^\p{L}\p{N}]+/gu,'').toLowerCase();
      if(!k) return;
      score += (freq[k]||0);
    });
    return { s, score };
  });
  scored.sort((a,b)=>b.score - a.score);
  const top = scored.slice(0,n).map(x=>x.s.trim());
  // preserve original order
  const ordered = sentences.filter(s=>top.includes(s)).slice(0,n);
  return ordered.join(' ');
}

// chunking helper for large texts (split by chars)
function chunkText(text, maxChars=3000){
  const chunks = [];
  for(let i=0;i<text.length;i+=maxChars){
    chunks.push(text.slice(i,i+maxChars));
  }
  return chunks;
}

// --- OpenAI summarization (client-side fetch) - NOTE: exposing API key in client is insecure.
// Recommended: create server-side proxy that calls OpenAI using your secret key.
// Endpoint here uses /v1/chat/completions (commonly supported). See OpenAI docs for Responses API options. :contentReference[oaicite:1]{index=1}
async function summarizeWithOpenAI(text, apiKey, lang, maxSentences){
  if(!apiKey) throw new Error('مفتاح OpenAI مفقود');
  // chunk if long
  const chunks = chunkText(text, 3000);
  const partials = [];
  for(const chunk of chunks){
    const prompt = `Please provide a concise summary in ${lang==='ara'?'Arabic':'English'} of the following text. Return plain text only.\n\n${chunk}\n\nSummary:`;
    const body = {
      model: "gpt-4o", // يمكنك تغييره حسب توافر حسابك
      messages: [{role:'system', content:'You are a helpful summarizer.'},{role:'user', content:prompt}],
      max_tokens: 800
    };
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body)
    });
    if(!res.ok){
      const txt = await res.text();
      throw new Error('OpenAI API error: ' + txt);
    }
    const data = await res.json();
    // get assistant reply
    const reply = data.choices && data.choices[0] && (data.choices[0].message?.content || data.choices[0].text) || '';
    partials.push(reply.trim());
  }
  // if multiple partials, summarize them into one final summary
  if(partials.length>1){
    const combinedPrompt = `Combine and condense these partial summaries into a final concise summary of up to ${maxSentences} sentences in ${lang==='ara'?'Arabic':'English'}:\n\n${partials.join('\n\n')}`;
    const body2 = {
      model: "gpt-4o",
      messages: [{role:'system', content:'You are a concise summarizer.'},{role:'user', content:combinedPrompt}],
      max_tokens: 800
    };
    const res2 = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body2)
    });
    if(!res2.ok){
      const txt = await res2.text();
      throw new Error('OpenAI API error: ' + txt);
    }
    const d2 = await res2.json();
    const finalReply = d2.choices && d2.choices[0] && (d2.choices[0].message?.content || d2.choices[0].text) || '';
    return finalReply.trim();
  } else {
    return partials[0] || '';
  }
}

// --- Summarize button handler (uses local summarizer by default, or OpenAI if checked)
summarizeBtn.addEventListener('click', async ()=>{
  if(!extractedText || extractedText.trim().length < 10) return alert('لا يوجد نص كافٍ للتلخيص. ارفع ملفًا أو التقط صورة.');
  show(loader); hide(summaryActions); summaryEl.textContent = '...'; hide(summaryMeta);
  const lang = langSelect.value || 'eng';
  const n = parseInt(sentCount.value) || 5;

  try{
    if(useAiCheckbox.checked){
      // AI path
      const apiKey = apiKeyInput.value.trim();
      if(!apiKey){ hide(loader); return alert('ضع مفتاح OpenAI في الحقل ليعمل الملخّص بالذكاء الاصطناعي (أو ألغِ التفعيل لاستخدام الملخّص المحلي).'); }
      // call OpenAI
      const aiSummary = await summarizeWithOpenAI(extractedText, apiKey, lang, n);
      summaryEl.textContent = aiSummary;
      summaryMeta.textContent = `طريقة: OpenAI — جمل المصدر: ${splitSentences(extractedText).length} — كلمات الملخص: ${aiSummary.split(/\s+/).filter(Boolean).length}`;
      show(summaryActions); show(summaryMeta);
      addToHistory({type:'summary', title:'Summary (AI)', text:aiSummary, timestamp:Date.now()});
    } else {
      // Local summarizer
      const sentences = splitSentences(extractedText);
      const summary = extractiveSummary(sentences, n, lang==='ara' ? 'ara' : 'eng');
      summaryEl.textContent = summary;
      summaryMeta.textContent = `طريقة: محلي — جمل المصدر: ${sentences.length} — كلمات الملخص: ${summary.split(/\s+/).filter(Boolean).length}`;
      show(summaryActions); show(summaryMeta);
      addToHistory({type:'summary', title:'Summary (Local)', text:summary, timestamp:Date.now()});
    }
  }catch(err){
    alert('خطأ أثناء التلخيص: '+err.message);
  }finally{
    hide(loader);
  }
});

// Clear
clearBtn.addEventListener('click', ()=>{ extractedText=''; extractedTextEl.value=''; summaryEl.textContent='لم يتم التلخيص بعد.'; hide(summaryActions); hide(summaryMeta); });

// Copy summary
copyBtn.addEventListener('click', async ()=>{ try{ await navigator.clipboard.writeText(summaryEl.textContent); alert('تم نسخ الملخص'); }catch(e){ alert('فشل النسخ: '+e.message); } });

// Download TXT
downloadTxtBtn.addEventListener('click', ()=>{ const txt = summaryEl.textContent || ''; const blob = new Blob([txt], {type:'text/plain;charset=utf-8'}); saveAs(blob, 'summary.txt'); });

// Download PDF (نُنشئ PDF بسيط - للاحتراف استخدم jsPDF)
downloadPdfBtn.addEventListener('click', ()=>{ const txt = summaryEl.textContent || ''; const blob = new Blob([txt], {type:'application/pdf'}); saveAs(blob, 'summary.pdf'); });

// History button
historyBtn.addEventListener('click', ()=>{ const raw = localStorage.getItem('copyai_history'); const arr = raw?JSON.parse(raw):[]; alert('السجل يحتوي على '+arr.length+' عنصر'); });

// Update visibility of API key input when checking useAi
useAiCheckbox.addEventListener('change', ()=>{ if(useAiCheckbox.checked) apiKeyLabel.classList.remove('hidden'); else apiKeyLabel.classList.add('hidden'); });

// --- initial UI state
hide(cameraArea); hide(canvas); hide(retakeBtn); hide(downloadImageBtn); hide(loader); hide(summaryActions);
