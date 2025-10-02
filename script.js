let video = document.getElementById('video');
let canvas = document.getElementById('canvas');
let output = document.getElementById('output');
let summaryBox = document.getElementById('summary');
let stream;
let lastImageData = null;

const OPENAI_API_KEY = "ضع_مفتاحك_هنا"; // ضع مفتاح OpenAI هنا

async function startCamera(facingMode) {
  if (stream) {
    let tracks = stream.getTracks();
    tracks.forEach(track => track.stop());
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facingMode } });
    video.srcObject = stream;
  } catch (error) {
    alert("⚠️ لا يمكن تشغيل الكاميرا: " + error.message);
  }
}

function capture() {
  if (!stream) {
    alert("⚠️ من فضلك اختر الكاميرا أولاً!");
    return;
  }
  let context = canvas.getContext('2d');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  lastImageData = canvas.toDataURL('image/png');
  output.innerHTML = `<h3>✅ تم الالتقاط</h3>
                      <img src="${lastImageData}" width="320" height="240"/>`;
}

function downloadImage() {
  if (!lastImageData) {
    alert("⚠️ لا توجد صورة محفوظة بعد!");
    return;
  }
  let link = document.createElement('a');
  link.href = lastImageData;
  link.download = "captured.png";
  link.click();
}

// 📝 استخراج النص من الصورة وتلخيصه
async function summarizeImage() {
  if (!lastImageData) {
    alert("⚠️ التقط صورة أولاً!");
    return;
  }
  summaryBox.innerHTML = "⏳ جاري استخراج النص من الصورة...";
  const { data: { text } } = await Tesseract.recognize(lastImageData, 'ara+eng');
  summarizeText(text);
}

// 📝 استخراج النص من PDF وتلخيصه
async function summarizePDF() {
  const file = document.getElementById('pdfInput').files[0];
  if (!file) {
    alert("⚠️ اختر ملف PDF أولاً!");
    return;
  }
  summaryBox.innerHTML = "⏳ جاري استخراج النص من PDF...";

  const fileReader = new FileReader();
  fileReader.onload = async function() {
    const typedarray = new Uint8Array(this.result);
    const pdf = await pdfjsLib.getDocument(typedarray).promise;
    let textContent = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      content.items.forEach(item => textContent += item.str + " ");
    }
    summarizeText(textContent);
  };
  fileReader.readAsArrayBuffer(file);
}

// 📝 إرسال النص إلى OpenAI لتلخيصه
async function summarizeText(text) {
  summaryBox.innerHTML = "⏳ جاري التلخيص...";
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + OPENAI_API_KEY
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "أنت مساعد يلخص النصوص بدقة وباللغة العربية." },
          { role: "user", content: `لخص النص التالي:\n\n${text}` }
        ],
        max_tokens: 500
      })
    });
    const data = await response.json();
    summaryBox.innerHTML = data.choices[0].message.content;
  } catch (err) {
    summaryBox.innerHTML = "❌ خطأ أثناء التلخيص: " + err.message;
  }
}
