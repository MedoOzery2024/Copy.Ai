// Global Variables
let currentStream = null;
let historyData = JSON.parse(localStorage.getItem('summaryHistory') || '[]');
let currentImage = null;
let currentPdf = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    initializeEventListeners();
    updateHistory();
});

// Toast Notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Tabs
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
}

// Event Listeners
function initializeEventListeners() {
    // Image Input
    document.getElementById('imageInput').addEventListener('change', handleImageUpload);

    // PDF Input
    document.getElementById('pdfInput').addEventListener('change', handlePdfUpload);

    // Text Input
    const textInput = document.getElementById('textInput');
    textInput.addEventListener('input', updateTextStats);
}

// Camera Functions
async function startCamera(mode) {
    try {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: mode }
        });

        currentStream = stream;
        const video = document.getElementById('camera');
        video.srcObject = stream;

        document.getElementById('cameraView').style.display = 'block';
        document.getElementById('imagePreview').style.display = 'none';
        document.getElementById('imageSummaryResult').style.display = 'none';

        showToast('تم تشغيل الكاميرا');
    } catch (error) {
        showToast('فشل في الوصول للكاميرا', 'error');
    }
}

function captureImage() {
    const video = document.getElementById('camera');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    currentImage = canvas.toDataURL('image/png');
    displayImage(currentImage);

    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }

    document.getElementById('cameraView').style.display = 'none';
    showToast('تم التقاط الصورة');
}

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            currentImage = event.target.result;
            displayImage(currentImage);
            showToast('تم تحميل الصورة');
        };
        reader.readAsDataURL(file);
    }
}

function displayImage(imageSrc) {
    document.getElementById('previewImg').src = imageSrc;
    document.getElementById('imagePreview').style.display = 'block';
    document.getElementById('imageSummaryResult').style.display = 'none';
}

async function summarizeImage() {
    if (!currentImage) {
        showToast('الرجاء تحميل صورة أولاً', 'error');
        return;
    }

    const btn = event.target;
    btn.classList.add('loading');
    btn.disabled = true;

    // Simulate AI processing
    setTimeout(() => {
        const summaryLength = document.getElementById('imageSummaryLength').value;
        const summary = generateMockSummary('image', summaryLength);
        
        document.getElementById('imageSummaryText').value = summary;
        document.getElementById('imageWordCount').textContent = `عدد الكلمات: ${countWords(summary)}`;
        document.getElementById('imageSummaryResult').style.display = 'block';

        // Save to history
        saveToHistory('صورة', currentImage, summary);

        btn.classList.remove('loading');
        btn.disabled = false;
        showToast('تم إنشاء التلخيص بنجاح!');
    }, 2000);
}

// PDF Functions
function handlePdfUpload(e) {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
        currentPdf = file;
        document.getElementById('pdfFileName').textContent = file.name;
        document.getElementById('pdfFileSize').textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
        document.getElementById('pdfPreview').style.display = 'block';
        document.getElementById('pdfSummaryResult').style.display = 'none';
        showToast('تم تحميل ملف PDF');
    } else {
        showToast('الرجاء تحميل ملف PDF صالح', 'error');
    }
}

async function summarizePdf() {
    if (!currentPdf) {
        showToast('الرجاء تحميل ملف PDF أولاً', 'error');
        return;
    }

    const btn = event.target;
    btn.classList.add('loading');
    btn.disabled = true;

    // Simulate AI processing
    setTimeout(() => {
        const summaryLength = document.getElementById('pdfSummaryLength').value;
        const summary = generateMockSummary('pdf', summaryLength, currentPdf.name);
        
        document.getElementById('pdfSummaryText').value = summary;
        document.getElementById('pdfWordCount').textContent = `عدد الكلمات: ${countWords(summary)}`;
        document.getElementById('pdfSummaryResult').style.display = 'block';

        // Save to history
        saveToHistory('PDF', currentPdf.name, summary);

        btn.classList.remove('loading');
        btn.disabled = false;
        showToast('تم إنشاء التلخيص بنجاح!');
    }, 2500);
}

// Text Functions
function updateTextStats() {
    const text = document.getElementById('textInput').value;
    const wordCount = countWords(text);
    const charCount = text.length;

    document.getElementById('textWordCount').textContent = `الكلمات: ${wordCount}`;
    document.getElementById('textCharCount').textContent = `الأحرف: ${charCount}`;
}

async function summarizeText() {
    const text = document.getElementById('textInput').value.trim();
    
    if (!text) {
        showToast('الرجاء إدخال نص للتلخيص', 'error');
        return;
    }

    const btn = event.target;
    btn.classList.add('loading');
    btn.disabled = true;

    // Simulate AI processing
    setTimeout(() => {
        const summaryLength = document.getElementById('textSummaryLength').value;
        const wordCount = countWords(text);
        const summary = generateMockSummary('text', summaryLength, null, wordCount);
        
        document.getElementById('textSummaryText').value = summary;
        const summaryWordCount = countWords(summary);
        const ratio = Math.round((summaryWordCount / wordCount) * 100);
        
        document.getElementById('textSummaryWordCount').textContent = `عدد الكلمات: ${summaryWordCount}`;
        document.getElementById('textSummaryRatio').textContent = `نسبة التلخيص: ${ratio}%`;
        document.getElementById('textSummaryResult').style.display = 'block';

        // Save to history
        saveToHistory('نص', text.substring(0, 100) + '...', summary);

        btn.classList.remove('loading');
        btn.disabled = false;
        showToast('تم إنشاء التلخيص بنجاح!');
    }, 1500);
}

// Utility Functions
function countWords(text) {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

function generateMockSummary(type, length, filename = '', originalWordCount = 0) {
    const baseSummaries = {
        short: 'هذا ملخص قصير يحتوي على النقاط الأساسية الأكثر أهمية من المحتوى الأصلي.',
        medium: 'هذا ملخص متوسط يغطي النقاط الرئيسية بشكل أكثر تفصيلاً. يتضمن السياق الضروري لفهم الموضوع مع الحفاظ على الإيجاز والوضوح في العرض.',
        long: 'هذا ملخص مفصل يشمل جميع النقاط المهمة مع توضيحات كافية. يحافظ على السياق الكامل للمحتوى الأصلي مع إضافة التفاصيل الضرورية لفهم شامل. يتم تنظيم المعلومات بشكل منطقي ومتسلسل.'
    };

    let summary = baseSummaries[length] || baseSummaries.medium;

    if (type === 'pdf') {
        summary = `ملخص الملف "${filename}". ${summary} في النسخة الفعلية، سيتم استخدام تقنيات AI لاستخراج النص من PDF وتلخيصه بدقة عالية.`;
    } else if (type === 'text' && originalWordCount > 0) {
        summary = `النص الأصلي يحتوي على ${originalWordCount} كلمة. ${summary} تم تحليل المحتوى واستخراج النقاط الرئيسية بدقة.`;
    } else if (type === 'image') {
        summary = `${summary} في النسخة الفعلية، سيتم استخدام OCR و AI لاستخراج النص من الصورة وتلخيصه بدقة عالية.`;
    }

    return summary;
}

function copyText(elementId) {
    const text = document.getElementById(elementId).value;
    navigator.clipboard.writeText(text);
    
    const btn = event.target.closest('.btn');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        تم النسخ
    `;
    
    showToast('تم نسخ التلخيص');
    
    setTimeout(() => {
        btn.innerHTML = originalHTML;
    }, 2000);
}

// History Functions
function saveToHistory(type, content, summary) {
    const historyItem = {
        id: Date.now(),
        type,
        content,
        summary,
        timestamp: new Date().toISOString()
    };

    historyData.unshift(historyItem);
    
    // Keep only last 20 items
    if (historyData.length > 20) {
        historyData = historyData.slice(0, 20);
    }

    localStorage.setItem('summaryHistory', JSON.stringify(historyData));
    updateHistory();
}

function updateHistory() {
    const historyList = document.getElementById('historyList');
    const emptyHistory = document.getElementById('emptyHistory');

    if (historyData.length === 0) {
        historyList.style.display = 'none';
        emptyHistory.style.display = 'block';
        return;
    }

    historyList.style.display = 'block';
    emptyHistory.style.display = 'none';

    historyList.innerHTML = historyData.map(item => `
        <div class="history-item">
            <div class="history-header">
                <div class="history-type">
                    ${getTypeIcon(item.type)}
                    <div class="history-type-info">
                        <p>${item.type}</p>
                        <p>${formatDate(item.timestamp)}</p>
                    </div>
                </div>
                <button class="btn btn-sm btn-outline" onclick="copyHistoryItem('${item.id}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    نسخ
                </button>
            </div>
            <p class="history-summary-label">التلخيص:</p>
            <div class="history-summary">
                <p>${item.summary}</p>
            </div>
            <div class="summary-stats">
                <span>عدد الكلمات: ${countWords(item.summary)}</span>
            </div>
        </div>
    `).join('');
}

function getTypeIcon(type) {
    const icons = {
        'صورة': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>',
        'PDF': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>',
        'نص': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>'
    };
    return icons[type] || icons['نص'];
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('ar-SA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function copyHistoryItem(id) {
    const item = historyData.find(h => h.id == id);
    if (item) {
        navigator.clipboard.writeText(item.summary);
        showToast('تم نسخ التلخيص');
    }
}
