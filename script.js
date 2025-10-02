// ضع مفتاح OpenAI API هنا
const OPENAI_API_KEY = "ضع_مفتاحك_هنا";

// فتح/إغلاق المودال
function openModal() {
  document.getElementById("cameraModal").style.display = "flex";
}
function closeModal() {
  document.getElementById("cameraModal").style.display = "none";
}
window.onclick = function(event) {
  const modal = document.getElementById("cameraModal");
  if (event.target === modal) closeModal();
}

// تشغيل الكاميرا
let stream;
async function startCamera(facingMode) {
  closeModal();
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode }
  });
  document.getElementById("cameraPreview").srcObject = stream;
}

// التقاط صورة واستخراج نص (OCR)
document.getElementById("captureBtn").onclick = async function() {
  const video = document.getElementById("cameraPreview");
  const canvas = document.getElementById("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);

  const { data: { text } } = await Tesseract.recognize(canvas, "ara+eng");
  document.getElementById("extractedText").value = text;
};

// رفع PDF واستخراج نصوص
document.getElementById("pdfUpload").addEventListener("change", async function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function() {
    const pdf = await pdfjsLib.getDocument({ data: reader.result }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(" ");
      fullText += pageText + "\n";
    }
    document.getElementById("extractedText").value = fullText;
  };
  reader.readAsArrayBuffer(file);
});

// تلخيص باستخدام OpenAI
async function summarize() {
  const text = document.getElementById("extractedText").value.trim();
  const langChoice = document.getElementById("langSelect").value;
  
  if (!text) {
    alert("لا يوجد نص لتلخيصه!");
    return;
  }

  // إعداد البرومبت حسب اللغة
  let prompt = `لخص النص التالي باحترافية:\n\n${text}`;
  if (langChoice === "en") {
    prompt = `Summarize the following text professionally in English:\n\n${text}`;
  } else if (langChoice === "fr") {
    prompt = `Résumez le texte suivant en français de manière professionnelle:\n\n${text}`;
  } else if (langChoice === "de") {
    prompt = `Fassen Sie den folgenden Text professionell auf Deutsch zusammen:\n\n${text}`;
  } else if (langChoice === "ar") {
    prompt = `لخص النص التالي باللغة العربية:\n\n${text}`;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "أنت مساعد ذكي يلخص النصوص بدقة بجميع اللغات." },
        { role: "user", content: prompt }
      ],
      max_tokens: 500
    })
  });

  const data = await response.json();
  if (data.choices) {
    document.getElementById("summary").value = data.choices[0].message.content;
  } else {
    document.getElementById("summary").value = "❌ حدث خطأ أثناء التلخيص.";
  }
}
