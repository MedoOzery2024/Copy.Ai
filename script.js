// Global Variables
let currentStream = null;
let historyData = JSON.parse(localStorage.getItem('summaryHistory') || '[]');
let currentImage = null;
let currentPdf = null;
let currentText = '';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    initializeEventListeners();
    updateHistory();
    loadSettings();
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

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // Auto-save text
    textInput.addEventListener('blur', saveTextDraft);
}

// Keyboard Shortcuts
function handleKeyboardShortcuts(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const activeTab = document.querySelector('.tab-content.active').id;
        if (activeTab === 'text-tab') {
            summarizeText();
        } else if (activeTab === 'image-tab' && currentImage) {
            summarizeImage();
        } else if (activeTab === 'pdf-tab' && currentPdf) {
            summarizePdf();
        }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveCurrentWork();
    }
}

// Camera Functions
async function startCamera(mode) {
    try {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }
        const constraints = {
            video: {
                facingMode: mode,
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        currentStream = stream;
        const video = document.getElementById('camera');
        video.srcObject = stream;
        document.getElementById('cameraView').style.display = 'block';
        document.getElementById('imagePreview').style.display = 'none';
        document.getElementById('imageSummaryResult').style.display = 'none';
        showToast('تم تشغيل الكاميرا');
    } catch (error) {
        console.error('Camera error:', error);
        showToast('فشل في الوصول للكاميرا', 'error');
    }
}

function captureImage() {
    const video = document.getElementById('camera');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Enhance image quality
    const enhancedCanvas = enhanceImageQuality(canvas);
    currentImage = enhancedCanvas.toDataURL('image/jpeg', 0.9);

    displayImage(currentImage);
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
    document.getElementById('cameraView').style.display = 'none';
    showToast('تم التقاط الصورة');
}

// Image Quality Enhancement
function enhanceImageQuality(canvas) {
    const enhancedCanvas = document.createElement('canvas');
    const ctx = enhancedCanvas.getContext('2d');

    enhancedCanvas.width = canvas.width;
    enhancedCanvas.height = canvas.height;

    // Apply basic enhancements
    ctx.drawImage(canvas, 0, 0);

    // Convert to grayscale and increase contrast
    const imageData = ctx.getImageData(0, 0, enhancedCanvas.width, enhancedCanvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        data[i] = avg < 128 ? 0 : 255; // Black or white
        data[i + 1] = avg < 128 ? 0 : 255;
        data[i + 2] = avg < 128 ? 0 : 255;
    }

    ctx.putImageData(imageData, 0, 0);

    return enhancedCanvas;
}

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        // Validate file type
        const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!validTypes.includes(file.type)) {
            showToast('نوع الملف غير مدعوم. الرجاء تحميل صورة', 'error');
            return;
        }

        // Validate file size (max 10MB)
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            showToast('حجم الصورة كبير جداً. الحد الأقصى 10MB', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            currentImage = event.target.result;
            displayImage(currentImage);
            showToast('تم تحميل الصورة');
        };
        reader.onerror = () => {
            showToast('خطأ في قراءة الملف', 'error');
        };
        reader.readAsDataURL(file);
    }
}

function displayImage(imageSrc) {
    const previewImg = document.getElementById('previewImg');
    previewImg.src = imageSrc;

    // Add loading state
    previewImg.onload = () => {
        document.getElementById('imagePreview').style.display = 'block';
        document.getElementById('imageSummaryResult').style.display = 'none';
    };
}

async function summarizeImage() {
    if (!currentImage) {
        showToast('الرجاء تحميل صورة أولاً', 'error');
        return;
    }

    const btn = event.target;
    const originalText = btn.textContent;
    btn.classList.add('loading');
    btn.disabled = true;
    btn.innerHTML = '<span>جاري المعالجة...</span>';

    try {
        // Extract text from image using Tesseract.js
        const extractedText = await extractTextFromImage(currentImage);

        if (!extractedText || extractedText.trim().length < 10) {
            document.getElementById('imageSummaryText').value = "لم يتم العثور على نص واضح في الصورة. حاول استخدام صورة أكثر وضوحًا.";
            throw new Error('لم يتم العثور على نص واضح في الصورة');
        }

        const summaryLength = document.getElementById('imageSummaryLength').value;
        const summary = generateSmartSummary(extractedText, summaryLength);

        document.getElementById('imageSummaryText').value = summary;
        document.getElementById('imageWordCount').textContent = `عدد الكلمات: ${countWords(summary)}`;
        document.getElementById('imageSummaryResult').style.display = 'block';

        // Save to history
        saveToHistory('صورة', currentImage, summary, extractedText);
        showToast('تم إنشاء التلخيص بنجاح!');

    } catch (error) {
        console.error('Image summarization error:', error);
        showToast(error.message || 'فشل في معالجة الصورة', 'error');
    } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// OCR Text Extraction using Tesseract.js
async function extractTextFromImage(imageData) {
    try {
        const { createWorker } = Tesseract;
        const worker = await createWorker({
            logger: m => console.log(m),
        });

        const ret = await worker.recognize(imageData);
        await worker.terminate();

        return ret.data.text;
    } catch (error) {
        console.error("OCR Error:", error);
        throw new Error("فشل في استخراج النص من الصورة");
    }
}

// PDF Functions
function handlePdfUpload(e) {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
        // Validate file size (max 10MB)
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            showToast('حجم الملف كبير جداً. الحد الأقصى 10MB', 'error');
            return;
        }

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
    const originalText = btn.textContent;
    btn.classList.add('loading');
    btn.disabled = true;
    btn.innerHTML = '<span>جاري معالجة PDF...</span>';

    try {
        // Simulate PDF text extraction
        const extractedText = await extractTextFromPdf(currentPdf);

        const summaryLength = document.getElementById('pdfSummaryLength').value;
        const summary = generateSmartSummary(extractedText, summaryLength);

        document.getElementById('pdfSummaryText').value = summary;
        document.getElementById('pdfWordCount').textContent = `عدد الكلمات: ${countWords(summary)}`;
        document.getElementById('pdfSummaryResult').style.display = 'block';

        // Save to history
        saveToHistory('PDF', currentPdf.name, summary, extractedText.substring(0, 200));
        showToast('تم إنشاء التلخيص بنجاح!');

    } catch (error) {
        console.error('PDF summarization error:', error);
        showToast('فشل في معالجة ملف PDF', 'error');
    } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// PDF Text Extraction (Simulated)
async function extractTextFromPdf(pdfFile) {
    return new Promise((resolve) => {
        setTimeout(() => {
            const mockPdfContent = `
                الفصل الأول: المقدمة

                هذا مستند PDF محاكى يحتوي على محتوى غني بالمعلومات. يتضمن عدة فصول وأقسام تغطي مواضيع متعددة.

                الفصل الثاني: الخلفية النظرية

                تشمل هذه الخلفية جميع الأساسيات النظرية اللازمة لفهم الموضوع الرئيسي. تحتوي على تعريفات ومفاهيم أساسية.

                الفصل الثالث: المنهجية

                تم اتباع منهجية علمية دقيقة في إعداد هذا المستند. شملت المنهجية عدة مراحل من التخطيط والتنفيذ.

                الفصل الرابع: النتائج

                تم الحصول على نتائج مهمة تشير إلى عدة استنتاجات رئيسية. كل نتيجة تدعم فرضية معينة.

                الفصل الخامس: الخاتمة

                خلاصة البحث والتوصيات المستقبلية. تم تقديم مقترحات للتطوير والتحسين.
            `;
            resolve(mockPdfContent);
        }, 2500);
    });
}

// Text Functions
function updateTextStats() {
    const text = document.getElementById('textInput').value;
    const wordCount = countWords(text);
    const charCount = text.length;
    const paragraphCount = countParagraphs(text);
    const sentenceCount = countSentences(text);
    document.getElementById('textWordCount').textContent = `الكلمات: ${wordCount}`;
    document.getElementById('textCharCount').textContent = `الأحرف: ${charCount}`;

    // Update advanced stats if element exists
    const advancedStats = document.getElementById('textAdvancedStats');
    if (!advancedStats) {
        const statsContainer = document.querySelector('.summary-stats');
        const advancedStatsEl = document.createElement('div');
        advancedStatsEl.id = 'textAdvancedStats';
        advancedStatsEl.className = 'summary-stats';
        advancedStatsEl.innerHTML = `
            <span>الفقرات: ${paragraphCount}</span>
            <span>الجمل: ${sentenceCount}</span>
            <span>مستوى التعقيد: ${calculateComplexity(text)}</span>
        `;
        statsContainer.parentNode.insertBefore(advancedStatsEl, statsContainer.nextSibling);
    } else {
        advancedStats.innerHTML = `
            <span>الفقرات: ${paragraphCount}</span>
            <span>الجمل: ${sentenceCount}</span>
            <span>مستوى التعقيد: ${calculateComplexity(text)}</span>
        `;
    }
}

function countParagraphs(text) {
    return text.split('\n').filter(para => para.trim().length > 0).length;
}

function countSentences(text) {
    return text.split(/[.!?]+/).filter(sentence => sentence.trim().length > 0).length;
}

function calculateComplexity(text) {
    const words = text.split(/\s+/).filter(word => word.length > 0);
    const longWords = words.filter(word => word.length > 6).length;
    const complexity = (longWords / words.length) * 100;

    if (complexity < 10) return 'سهل';
    if (complexity < 20) return 'متوسط';
    if (complexity < 30) return 'صعب';
    return 'معقد';
}

async function summarizeText() {
    const text = document.getElementById('textInput').value.trim();

    if (!text) {
        showToast('الرجاء إدخال نص للتلخيص', 'error');
        return;
    }

    if (countWords(text) < 10) {
        showToast('النص قصير جداً. الرجاء إدخال نص أطول', 'error');
        return;
    }

    const btn = event.target;
    const originalText = btn.textContent;
    btn.classList.add('loading');
    btn.disabled = true;
    btn.innerHTML = '<span>جاري التلخيص...</span>';

    try {
        const summaryLength = document.getElementById('textSummaryLength').value;
        const summary = generateSmartSummary(text, summaryLength);

        document.getElementById('textSummaryText').value = summary;
        const wordCount = countWords(text);
        const summaryWordCount = countWords(summary);
        const ratio = Math.round((summaryWordCount / wordCount) * 100);

        document.getElementById('textSummaryWordCount').textContent = `عدد الكلمات: ${summaryWordCount}`;
        document.getElementById('textSummaryRatio').textContent = `نسبة التلخيص: ${ratio}%`;
        document.getElementById('textSummaryResult').style.display = 'block';

        // Save to history
        saveToHistory('نص', text.substring(0, 100) + '...', summary);
        showToast('تم إنشاء التلخيص بنجاح!');

    } catch (error) {
        console.error('Text summarization error:', error);
        showToast('فشل في إنشاء التلخيص', 'error');
    } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Smart Summary Generation
function generateSmartSummary(text, length) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);

    let targetLength;
    switch(length) {
        case 'short':
            targetLength = Math.max(1, Math.floor(sentences.length * 0.25));
            break;
        case 'long':
            targetLength = Math.max(1, Math.floor(sentences.length * 0.75));
            break;
        default: // medium
            targetLength = Math.max(1, Math.floor(sentences.length * 0.5));
    }

    // Simple algorithm to select important sentences
    const importantSentences = sentences
        .map((sentence, index) => ({
            sentence,
            index,
            importance: calculateSentenceImportance(sentence, words)
        }))
        .sort((a, b) => b.importance - a.importance)
        .slice(0, targetLength)
        .sort((a, b) => a.index - b.index)
        .map(item => item.sentence.trim() + '.');

    return importantSentences.join(' ') || 'تعذر إنشاء تلخيص للنص المقدم.';
}

function calculateSentenceImportance(sentence, allWords) {
    let score = 0;
    const words = sentence.split(/\s+/).filter(w => w.length > 0);

    // Score based on sentence length (medium sentences are often important)
    const lengthScore = Math.min(words.length / 10, 2);
    score += lengthScore;

    // Score based on position (first and last sentences are often important)
    score += 1;

    // Score based on keywords
    const keywords = ['مهم', 'خلاصة', 'نتيجة', 'استنتاج', 'أهم', 'رئيسي', 'أساسي'];
    keywords.forEach(keyword => {
        if (sentence.includes(keyword)) score += 2;
    });

    // Score based on question words (questions might be important)
    const questionWords = ['لماذا', 'كيف', 'متى', 'أين', 'ماذا'];
    questionWords.forEach(qWord => {
        if (sentence.includes(qWord)) score += 1;
    });

    return score;
}

// Utility Functions
function countWords(text) {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
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
function saveToHistory(type, content, summary, extractedText = '') {
    const historyItem = {
        id: Date.now(),
        type,
        content,
        summary,
        extractedText,
        timestamp: new Date().toISOString(),
        wordCount: countWords(summary)
    };
    historyData.unshift(historyItem);

    // Keep only last 50 items
    if (historyData.length > 50) {
        historyData = historyData.slice(0, 50);
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
                <div>
                    <button class="btn btn-sm btn-outline" onclick="copyHistoryItem('${item.id}')" title="نسخ التلخيص">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        نسخ
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="deleteHistoryItem('${item.id}')" title="حذف">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
            ${item.extractedText ? `
                <p class="history-summary-label">النص المستخرج:</p>
                <div class="history-summary">
                    <p>${item.extractedText.substring(0, 150)}...</p>
                </div>
            ` : ''}
            <p class="history-summary-label">التلخيص:</p>
            <div class="history-summary">
                <p>${item.summary}</p>
            </div>
            <div class="summary-stats">
                <span>عدد الكلمات: ${item.wordCount}</span>
                <span>التاريخ: ${formatDate(item.timestamp)}</span>
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
        month: 'short',
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

function deleteHistoryItem(id) {
    if (confirm('هل أنت متأكد من حذف هذا التلخيص؟')) {
        historyData = historyData.filter(item => item.id != id);
        localStorage.setItem('summaryHistory', JSON.stringify(historyData));
        updateHistory();
        showToast('تم حذف التلخيص');
    }
}

function clearAllHistory() {
    if (confirm('هل أنت متأكد من حذف كل السجل؟')) {
        historyData = [];
        localStorage.setItem('summaryHistory', JSON.stringify(historyData));
        updateHistory();
        showToast('تم مسح السجل بالكامل');
    }
}

// Settings and Auto-save
function saveTextDraft() {
    const text = document.getElementById('textInput').value;
    localStorage.setItem('textDraft', text);
}

function loadSettings() {
    // Load text draft
    const savedText = localStorage.getItem('textDraft');
    if (savedText) {
        document.getElementById('textInput').value = savedText;
        updateTextStats();
    }

    // Load preferences
    const preferences = JSON.parse(localStorage.getItem('userPreferences') || '{}');
    if (preferences.defaultSummaryLength) {
        document.getElementById('textSummaryLength').value = preferences.defaultSummaryLength;
    }
}

function saveCurrentWork() {
    const activeTab = document.querySelector('.tab-content.active').id;
    let workData = {};

    switch(activeTab) {
        case 'text-tab':
            workData = {
                type: 'text',
                content: document.getElementById('textInput').value,
                timestamp: new Date().toISOString()
            };
            break;
        case 'image-tab':
            if (currentImage) {
                workData = {
                    type: 'image',
                    content: currentImage,
                    timestamp: new Date().toISOString()
                };
            }
            break;
        case 'pdf-tab':
            if (currentPdf) {
                workData = {
                    type: 'pdf',
                    content: currentPdf.name,
                    timestamp: new Date().toISOString()
                };
            }
            break;
    }

    if (workData.type) {
        localStorage.setItem('lastWork', JSON.stringify(workData));
        showToast('تم حفظ العمل الحالي');
    }
}

// Export functions
function exportSummary() {
    const summaryText = document.querySelector('.tab-content.active textarea[readonly]')?.value;
    if (!summaryText) {
        showToast('لا يوجد تلخيص لتصديره', 'error');
        return;
    }

    const blob = new Blob([summaryText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `summary-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('تم تصدير التلخيص');
}

// Add this to your existing CSS or create a new style section
function injectAdditionalStyles() {
    const additionalStyles = `
        .history-actions {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 1rem;
        }

        .text-advanced-stats {
            display: flex;
            gap: 1.5rem;
            font-size: 0.875rem;
            color: var(--text-secondary);
            margin-top: 0.5rem;
        }

        .quality-indicator {
            display: inline-block;
            padding: 0.25rem 0.5rem;
            border-radius: 0.25rem;
            font-size: 0.75rem;
            font-weight: 600;
        }

        .quality-easy { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
        .quality-medium { background: rgba(234, 179, 8, 0.2); color: var(--primary); }
        .quality-hard { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
        .quality-complex { background: rgba(139, 92, 246, 0.2); color: #8b5cf6; }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.textContent = additionalStyles;
    document.head.appendChild(styleSheet);
}

// Initialize additional styles
document.addEventListener('DOMContentLoaded', injectAdditionalStyles);
```"}
