const fileInput = document.getElementById("fileInput");
const cameraBtn = document.getElementById("cameraBtn");
const summarizeBtn = document.getElementById("summarizeBtn");
const downloadBtn = document.getElementById("downloadBtn");
const summaryOutput = document.getElementById("summaryOutput");
const statusLog = document.getElementById("statusLog");
const langSelect = document.getElementById("langSelect");
const summaryLength = document.getElementById("summaryLength");

let extractedText = "";

// تحديث السجل
function logStatus(msg) {
  const li = document.createElement("li");
  li.textContent = msg;
  statusLog.appendChild(li);
}

// قراءة PDF
async function readPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let textContent = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const text = await page.getTextContent();
    text.items.forEach(item => {
      textContent += item.str + " ";
    });
  }
  return textContent;
}

// OCR للصور
async function readImage(file, langCode) {
  const { data: { text } } = await Tesseract.recognize(file, langCode);
  return text;
}

// تلخيص النص
function summarizeText(text, numSentences) {
  const sentences = text.match(/[^.!؟\n]+[.!؟\n]?/g) || [];
  if (sentences.length <= numSentences) return text;

  let freq = {};
  text.split(/\s+/).forEach(word => {
    word = word.toLowerCase();
    if (!freq[word]) freq[word] = 0;
    freq[word]++;
  });

  let scored = sentences.map(s => {
    let score = 0;
    s.split(/\s+/).forEach(word => {
      word = word.toLowerCase();
      if (freq[word]) score += freq[word];
    });
    return { sentence: s, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, numSentences).map(s => s.sentence).join(" ");
}

// عند رفع الملف
fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;

  logStatus("جارٍ قراءة الملف...");
  if (file.type === "application/pdf") {
    extractedText = await readPDF(file);
  } else if (file.type.startsWith("image/")) {
    extractedText = await readImage(file, langSelect.value);
  }
  logStatus("تم استخراج النص.");
});

// فتح الكاميرا
cameraBtn.addEventListener("click", () => {
  logStatus("ميزة الكاميرا تحتاج HTTPS أو خادم محلي.");
  alert("ميزة الكاميرا ستعمل عند فتح الموقع عبر HTTPS أو localhost.");
});

// تنفيذ التلخيص
summarizeBtn.addEventListener("click", () => {
  if (!extractedText) {
    alert("من فضلك ارفع ملف أو صورة أولاً");
    return;
  }
  const num = parseInt(summaryLength.value, 10);
  const summary = summarizeText(extractedText, num);
  summaryOutput.value = summary;
  logStatus("تم إنشاء الملخص.");
});

// تحميل الملخص
downloadBtn.addEventListener("click", () => {
  const blob = new Blob([summaryOutput.value], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "summary.txt";
  a.click();
  logStatus("تم تحميل الملخص.");
});
