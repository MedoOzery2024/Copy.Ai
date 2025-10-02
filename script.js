let currentStream = null;
const cameraPreview = document.getElementById("cameraPreview");
const canvas = document.getElementById("snapshotCanvas");
const ctx = canvas.getContext("2d");

// فتح المودال
function openModal() {
  document.getElementById("cameraModal").style.display = "flex";
}

// إغلاق المودال
function closeModal() {
  document.getElementById("cameraModal").style.display = "none";
}

// تشغيل الكاميرا
function startCamera(mode) {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }

  navigator.mediaDevices.getUserMedia({ video: { facingMode: mode } })
    .then(stream => {
      currentStream = stream;
      cameraPreview.srcObject = stream;
      cameraPreview.play();
      closeModal(); // إغلاق المودال بعد الاختيار
    })
    .catch(err => {
      alert("تعذر تشغيل الكاميرا: " + err);
    });
}

// إيقاف الكاميرا
function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
    cameraPreview.srcObject = null;
  }
}

// إغلاق المودال عند الضغط خارج المحتوى
window.onclick = function(event) {
  const modal = document.getElementById("cameraModal");
  if (event.target === modal) {
    closeModal();
  }
};

// التقاط صورة
document.getElementById("captureBtn").addEventListener("click", () => {
  if (!currentStream) return;
  canvas.width = cameraPreview.videoWidth;
  canvas.height = cameraPreview.videoHeight;
  ctx.drawImage(cameraPreview, 0, 0, canvas.width, canvas.height);
  canvas.style.display = "block";
  document.getElementById("retakeBtn").style.display = "inline-block";
  document.getElementById("downloadImageBtn").style.display = "inline-block";
});

// إعادة الالتقاط
document.getElementById("retakeBtn").addEventListener("click", () => {
  canvas.style.display = "none";
  document.getElementById("retakeBtn").style.display = "none";
  document.getElementById("downloadImageBtn").style.display = "none";
});

// تحميل الصورة
document.getElementById("downloadImageBtn").addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "snapshot.png";
  link.href = canvas.toDataURL();
  link.click();
});

// تلخيص محلي
document.getElementById("summarizeLocalBtn").addEventListener("click", () => {
  const text = document.getElementById("extractedText").value;
  const lang = document.getElementById("langSelect").value;
  document.getElementById("summaryOutput").value = summarizeLocal(text, lang);
});

// تلخيص بالذكاء الاصطناعي (OpenAI API)
document.getElementById("summarizeAIBtn").addEventListener("click", async () => {
  const text = document.getElementById("extractedText").value;
  const apiKey = "ضع_مفتاحك_هنا"; // ⚠️ ضع مفتاح OpenAI API هنا
  const summary = await summarizeWithAI(text, apiKey);
  document.getElementById("summaryOutput").value = summary;
});

// تحميل الملخص
document.getElementById("downloadSummaryBtn").addEventListener("click", () => {
  const blob = new Blob([document.getElementById("summaryOutput").value], { type: "text/plain" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "summary.txt";
  link.click();
});

// === خوارزمية تلخيص محلية بسيطة تدعم العربية والإنجليزية ===
function summarizeLocal(text, lang) {
  if (!text.trim()) return "⚠️ لا يوجد نص للتلخيص";
  const stopwords = {
    ar: ["من","في","إلى","على","عن","أن","إن","هو","هي","هذا","هذه","هناك","كل"],
    en: ["the","is","in","at","of","on","and","a","to","it","for","with"]
  };
  const words = text.split(/\s+/).filter(w => !stopwords[lang].includes(w.toLowerCase()));
  const sentences = text.match(/[^.!؟\n]+[.!؟\n]*/g) || [];
  const scores = sentences.map(s => {
    let score = 0;
    words.forEach(w => { if (s.includes(w)) score++; });
    return { s, score };
  });
  scores.sort((a,b)=>b.score-a.score);
  return scores.slice(0,3).map(x=>x.s.trim()).join(" ");
}

// === التلخيص بالذكاء الاصطناعي (OpenAI API) ===
async function summarizeWithAI(text, apiKey) {
  if (!apiKey || apiKey === "ضع_مفتاحك_هنا") {
    return "⚠️ ضع مفتاح OpenAI API في script.js";
  }
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: "لخص النص التالي باختصار:\n" + text }]
      })
    });
    const data = await res.json();
    return data.choices[0].message.content;
  } catch (e) {
    return "❌ خطأ أثناء الاتصال بالذكاء الاصطناعي";
  }
}
