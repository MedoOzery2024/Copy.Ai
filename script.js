let extractedText = "";
const pdfInput = document.getElementById("pdfInput");
const cameraBtn = document.getElementById("cameraBtn");
const captureBtn = document.getElementById("captureBtn");
const video = document.getElementById("cameraStream");
const canvas = document.getElementById("snapshot");
const summarizeBtn = document.getElementById("summarizeBtn");
const summaryOutput = document.getElementById("summaryOutput");
const languageSelect = document.getElementById("languageSelect");
const downloadTxt = document.getElementById("downloadTxt");
const downloadPdf = document.getElementById("downloadPdf");
const copySummary = document.getElementById("copySummary");
const summaryActions = document.querySelector(".summary-actions");
const loader = document.getElementById("loader");
const stats = document.getElementById("summaryStats");
const themeToggle = document.getElementById("themeToggle");

// Toggle Theme
themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("light");
  themeToggle.textContent = document.body.classList.contains("light") ? "☀️" : "🌙";
});

// PDF Upload & Read
pdfInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  loader.style.display = "block";
  const fileReader = new FileReader();
  fileReader.onload = async function() {
    const typedarray = new Uint8Array(this.result);
    const pdf = await pdfjsLib.getDocument(typedarray).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      content.items.forEach((item) => {
        text += item.str + " ";
      });
    }
    extractedText = text;
    loader.style.display = "none";
    alert("✅ تم استخراج النصوص من PDF بنجاح");
  };
  fileReader.readAsArrayBuffer(file);
});

// Camera Access
cameraBtn.addEventListener("click", async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.style.display = "block";
  captureBtn.style.display = "block";
  video.srcObject = stream;
});

// Capture Image
captureBtn.addEventListener("click", () => {
  const ctx = canvas.getContext("2d");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  video.style.display = "none";
  captureBtn.style.display = "none";
  canvas.style.display = "block";

  loader.style.display = "block";
  const lang = languageSelect.value;
  Tesseract.recognize(canvas, lang).then(({ data: { text } }) => {
    extractedText = text;
    loader.style.display = "none";
    alert("✅ تم استخراج النصوص من الصورة");
  });
});

// Summarize Function
summarizeBtn.addEventListener("click", () => {
  if (!extractedText) {
    alert("⚠️ لم يتم رفع ملف أو التقاط صورة بعد!");
    return;
  }

  loader.style.display = "block";
  setTimeout(() => {
    const sentences = extractedText.split(/[.؟!]/).filter(s => s.trim().length > 0);
    const summary = sentences.slice(0, 5).join(". ") + "...";
    summaryOutput.innerText = summary;

    // Show buttons
    summaryActions.style.display = "flex";

    // Stats
    const words = summary.split(/\s+/).length;
    stats.textContent = `📊 عدد الجمل: ${sentences.length} | عدد الكلمات في الملخص: ${words}`;

    loader.style.display = "none";
  }, 1000);
});

// Copy Summary
copySummary.addEventListener("click", () => {
  navigator.clipboard.writeText(summaryOutput.innerText);
  alert("📋 تم نسخ الملخص للحافظة");
});

// Download TXT
downloadTxt.addEventListener("click", () => {
  const blob = new Blob([summaryOutput.innerText], { type: "text/plain;charset=utf-8" });
  saveAs(blob, "summary.txt");
});

// Download PDF
downloadPdf.addEventListener("click", () => {
  const blob = new Blob([summaryOutput.innerText], { type: "application/pdf" });
  saveAs(blob, "summary.pdf");
});
