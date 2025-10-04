let currentStream = null;
let historyData = JSON.parse(localStorage.getItem('summaryHistory') || '[]');
let currentImage = null;
let currentPdf = null;
let extractedImageText = '';
let extractedPdfText = '';

document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    initializeEventListeners();
    updateHistory();
});

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

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
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
}

function initializeEventListeners() {
    document.getElementById('imageInput').addEventListener('change', handleImageUpload);
    document.getElementById('pdfInput').addEventListener('change', handlePdfUpload);
    const textInput = document.getElementById('textInput');
    textInput.addEventListener('input', updateTextStats);
}

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
        document.getElementById('imageResult').style.display = 'none';
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
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    currentImage = canvas.toDataURL('image/jpeg', 0.9);
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
        const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!validTypes.includes(file.type)) {
            showToast('نوع الملف غير مدعوم. الرجاء تحميل صورة', 'error');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
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
    previewImg.onload = () => {
        document.getElementById('imagePreview').style.display = 'block';
        document.getElementById('imageResult').style.display = 'none';
    };
}

async function extractFromImage() {
    if (!currentImage) {
        showToast('الرجاء تحميل صورة أولاً', 'error');
        return;
    }

    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.classList.add('loading');
    btn.disabled = true;
    btn.innerHTML = '<span>جاري استخراج النص...</span>';

    try {
        const result = await Tesseract.recognize(
            currentImage,
            'ara+eng',
            {
                logger: m => console.log(m)
            }
        );

        extractedImageText = cleanExtractedText(result.data.text.trim());

        if (!extractedImageText || extractedImageText.length < 10) {
            throw new Error('لم يتم العثور على نص واضح في الصورة');
        }

        document.getElementById('extractedImageText').value = extractedImageText;
        document.getElementById('extractedImageWordCount').textContent = `عدد الكلمات: ${countWords(extractedImageText)}`;

        navigator.clipboard.writeText(extractedImageText);
        showToast('تم استخراج ونسخ النص!');

        summarizeExtractedImage();

        document.getElementById('imageResult').style.display = 'block';

        saveToHistory('صورة', extractedImageText, '');

    } catch (error) {
        console.error('Image extraction error:', error);
        showToast(error.message || 'فشل في استخراج النص من الصورة', 'error');
    } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function summarizeExtractedImage() {
    if (!extractedImageText) return;

    const summaryLength = document.getElementById('imageSummaryLength').value;
    const summary = generateSmartSummary(extractedImageText, summaryLength);

    document.getElementById('imageSummaryText').value = summary;
    const wordCount = countWords(extractedImageText);
    const summaryWordCount = countWords(summary);
    const ratio = Math.round((summaryWordCount / wordCount) * 100);

    document.getElementById('imageSummaryWordCount').textContent = `عدد الكلمات: ${summaryWordCount}`;
    document.getElementById('imageSummaryRatio').textContent = `نسبة التلخيص: ${ratio}%`;
}

function handlePdfUpload(e) {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
        if (file.size > 10 * 1024 * 1024) {
            showToast('حجم الملف كبير جداً. الحد الأقصى 10MB', 'error');
            return;
        }

        currentPdf = file;
        document.getElementById('pdfFileName').textContent = file.name;
        document.getElementById('pdfFileSize').textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
        document.getElementById('pdfPreview').style.display = 'block';
        document.getElementById('pdfResult').style.display = 'none';
        showToast('تم تحميل ملف PDF');
    } else {
        showToast('الرجاء تحميل ملف PDF صالح', 'error');
    }
}

async function extractFromPdf() {
    if (!currentPdf) {
        showToast('الرجاء تحميل ملف PDF أولاً', 'error');
        return;
    }

    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.classList.add('loading');
    btn.disabled = true;
    btn.innerHTML = '<span>جاري استخراج النص...</span>';

    try {
        const arrayBuffer = await currentPdf.arrayBuffer();

        const loadingTask = pdfjsLib.getDocument({
            data: arrayBuffer,
            verbosity: 0,
            isEvalSupported: false,
            useSystemFonts: true
        });

        const pdf = await loadingTask.promise;

        let fullText = '';
        let pagesProcessed = 0;

        for (let i = 1; i <= pdf.numPages; i++) {
            try {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();

                let pageText = '';
                textContent.items.forEach((item, index) => {
                    if (item.str) {
                        const nextItem = textContent.items[index + 1];
                        const cleanStr = item.str.replace(/[\u200B-\u200D\uFEFF]/g, '');
                        pageText += cleanStr;

                        if (nextItem && item.transform[5] !== nextItem.transform[5]) {
                            pageText += '\n';
                        } else if (nextItem && cleanStr.trim() !== '') {
                            pageText += ' ';
                        }
                    }
                });

                const cleanedPageText = cleanExtractedText(pageText);
                if (cleanedPageText.trim()) {
                    fullText += cleanedPageText.trim() + '\n\n';
                    pagesProcessed++;
                }

                btn.innerHTML = `<span>جاري المعالجة... صفحة ${i} من ${pdf.numPages}</span>`;

            } catch (pageError) {
                console.warn(`خطأ في صفحة ${i}:`, pageError);
            }
        }

        extractedPdfText = cleanExtractedText(fullText.trim());

        if (!extractedPdfText || extractedPdfText.length < 5) {
            throw new Error('لم يتم العثور على نص في ملف PDF. قد يكون الملف يحتوي على صور فقط أو محمي.');
        }

        if (pagesProcessed === 0) {
            throw new Error('لم يتم معالجة أي صفحة. الملف قد يكون تالف أو محمي.');
        }

        document.getElementById('extractedPdfText').value = extractedPdfText;
        document.getElementById('extractedPdfWordCount').textContent = `عدد الكلمات: ${countWords(extractedPdfText)} | عدد الصفحات: ${pagesProcessed}`;

        try {
            await navigator.clipboard.writeText(extractedPdfText);
            showToast(`تم استخراج ونسخ النص من ${pagesProcessed} صفحة!`);
        } catch (clipError) {
            showToast(`تم استخراج النص من ${pagesProcessed} صفحة!`);
        }

        summarizeExtractedPdf();

        document.getElementById('pdfResult').style.display = 'block';

        saveToHistory('PDF', extractedPdfText, '');

    } catch (error) {
        console.error('PDF extraction error:', error);

        let errorMessage = 'فشل في استخراج النص من PDF';

        if (error.message.includes('Invalid PDF')) {
            errorMessage = 'ملف PDF غير صالح أو تالف';
        } else if (error.message.includes('password')) {
            errorMessage = 'ملف PDF محمي بكلمة مرور';
        } else if (error.message.includes('صور فقط') || error.message.includes('محمي')) {
            errorMessage = error.message;
        }

        showToast(errorMessage, 'error');
    } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function summarizeExtractedPdf() {
    if (!extractedPdfText) return;

    const summaryLength = document.getElementById('pdfSummaryLength').value;
    const summary = generateSmartSummary(extractedPdfText, summaryLength);

    document.getElementById('pdfSummaryText').value = summary;
    const wordCount = countWords(extractedPdfText);
    const summaryWordCount = countWords(summary);
    const ratio = Math.round((summaryWordCount / wordCount) * 100);

    document.getElementById('pdfSummaryWordCount').textContent = `عدد الكلمات: ${summaryWordCount}`;
    document.getElementById('pdfSummaryRatio').textContent = `نسبة التلخيص: ${ratio}%`;
}

function updateTextStats() {
    const text = document.getElementById('textInput').value;
    const wordCount = countWords(text);
    const charCount = text.length;

    document.getElementById('textWordCount').textContent = `الكلمات: ${wordCount}`;
    document.getElementById('textCharCount').textContent = `الأحرف: ${charCount}`;
}

function summarizeText() {
    const rawText = document.getElementById('textInput').value.trim();
    const text = cleanExtractedText(rawText);

    if (!text) {
        showToast('الرجاء إدخال نص للتلخيص', 'error');
        return;
    }
    if (countWords(text) < 10) {
        showToast('النص قصير جداً. الرجاء إدخال نص أطول', 'error');
        return;
    }

    const summaryLength = document.getElementById('textSummaryLength').value;
    const summary = generateSmartSummary(text, summaryLength);

    document.getElementById('textSummaryText').value = summary;
    const wordCount = countWords(text);
    const summaryWordCount = countWords(summary);
    const ratio = Math.round((summaryWordCount / wordCount) * 100);

    document.getElementById('textSummaryWordCount').textContent = `عدد الكلمات: ${summaryWordCount}`;
    document.getElementById('textSummaryRatio').textContent = `نسبة التلخيص: ${ratio}%`;
    document.getElementById('textSummaryResult').style.display = 'block';

    saveToHistory('نص', text, summary);
    showToast('تم إنشاء التلخيص بنجاح!');
}

function generateSmartSummary(text, length) {
    text = cleanExtractedText(text);
    text = normalizeArabicText(text);

    const sentences = text.split(/[.!?؟।]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);

    if (sentences.length === 0) {
        return 'لا يمكن تلخيص هذا النص.';
    }

    if (sentences.length <= 2) {
        return sentences.map(s => s.trim()).join('. ') + '.';
    }

    let targetLength;
    switch(length) {
        case 'short':
            targetLength = Math.max(1, Math.floor(sentences.length * 0.25));
            break;
        case 'long':
            targetLength = Math.max(1, Math.floor(sentences.length * 0.75));
            break;
        default:
            targetLength = Math.max(1, Math.floor(sentences.length * 0.5));
    }

    targetLength = Math.max(1, Math.min(targetLength, sentences.length));

    const scoredSentences = sentences.map((sentence, index) => ({
        sentence: sentence.trim(),
        index,
        score: calculateSentenceScore(sentence, sentences, words, index)
    }));

    scoredSentences.sort((a, b) => b.score - a.score);

    const selectedSentences = scoredSentences
        .slice(0, targetLength)
        .sort((a, b) => a.index - b.index);

    const summary = selectedSentences
        .map(item => item.sentence)
        .join('. ') + '.';

    return summary || 'تعذر إنشاء تلخيص للنص المقدم.';
}

function normalizeArabicText(text) {
    return text
        .replace(/[أإآ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanExtractedText(text) {
    let cleaned = text;

    cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, '');

    cleaned = cleaned.replace(/[\x00-\x1F\x7F-\x9F]/g, '');

    cleaned = cleaned.replace(/[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFFa-zA-Z0-9\s.,;:!?؟،؛\-()[\]{}'"«»""\n\r%$€£٪٠-٩]/g, ' ');

    cleaned = cleaned.replace(/\b[a-zA-Z]{1,2}\b(?!\s*[a-zA-Z])/g, ' ');

    cleaned = cleaned.replace(/\b[A-Z]{2,}\b/g, ' ');

    cleaned = cleaned.replace(/([a-zA-Z])\1{2,}/g, ' ');

    cleaned = cleaned.replace(/[a-zA-Z]+[0-9]+[a-zA-Z]*/g, ' ');

    cleaned = cleaned.replace(/\b[a-z]+[A-Z]+[a-z]*\b/g, ' ');

    cleaned = cleaned.replace(/(\d+\.?\d*)\s*([a-zA-Z]{1,3})\s*(\d+)/g, '$1 $3');

    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');

    cleaned = cleaned.replace(/([.!?؟،]){2,}/g, '$1');

    const lines = cleaned.split('\n');
    cleaned = lines.filter(line => {
        const arabicChars = (line.match(/[\u0600-\u06FF]/g) || []).length;
        const englishChars = (line.match(/[a-zA-Z]/g) || []).length;
        const totalChars = line.replace(/\s/g, '').length;

        if (totalChars === 0) return false;

        if (englishChars > arabicChars && englishChars > totalChars * 0.5) {
            return false;
        }

        return true;
    }).join('\n');

    cleaned = cleaned.trim();

    return cleaned;
}

function calculateSentenceScore(sentence, allSentences, allWords, position) {
    let score = 0;
    const normalizedSentence = normalizeArabicText(sentence.toLowerCase());
    const words = normalizedSentence.split(/\s+/).filter(w => w.length > 0);

    const idealLength = 15;
    const lengthDiff = Math.abs(words.length - idealLength);
    score += Math.max(0, 2 - (lengthDiff / 10));

    if (position === 0) {
        score += 3;
    } else if (position === allSentences.length - 1) {
        score += 2.5;
    } else if (position === 1) {
        score += 1.5;
    } else if (position < 3) {
        score += 1;
    }

    const arabicKeywords = [
        'مهم', 'خلاصه', 'نتيجه', 'استنتاج', 'اهم', 'رييسي', 'اساسي', 'ضروري',
        'يجب', 'ينبغي', 'الاهم', 'بشكل', 'خاص', 'تحديدا', 'اولا', 'ثانيا', 'ثالثا',
        'اخيرا', 'واخيرا', 'باختصار', 'بالتالي', 'لذلك', 'اذن', 'وبذلك', 'ومن ثم',
        'الهدف', 'الغرض', 'السبب', 'الحل', 'المشكله', 'القضيه', 'الموضوع',
        'يتضح', 'يظهر', 'نلاحظ', 'نري', 'نستنتج', 'نستخلص', 'يمكن', 'يعني',
        'بمعني', 'اي', 'علي', 'سبيل', 'المثال', 'مثل', 'كذلك', 'ايضا',
        'بالاضافه', 'فضلا', 'علاوه', 'زياده', 'كما', 'حيث', 'اذا', 'عندما',
        'بينما', 'بعد', 'قبل', 'خلال', 'اثناء', 'طوال', 'منذ', 'حتي',
        'الواجب', 'الضروري', 'المطلوب', 'المفروض', 'اللازم', 'الحتمي'
    ];

    const englishKeywords = [
        'important', 'summary', 'conclusion', 'result', 'main', 'key', 'essential',
        'must', 'should', 'critical', 'significant', 'major', 'primary', 'first',
        'second', 'finally', 'therefore', 'thus', 'hence', 'consequently', 'moreover',
        'however', 'nevertheless', 'furthermore', 'additionally', 'ultimately'
    ];

    const allKeywords = [...arabicKeywords, ...englishKeywords];

    let keywordCount = 0;
    allKeywords.forEach(keyword => {
        if (normalizedSentence.includes(keyword)) {
            score += 2;
            keywordCount++;
        }
    });

    if (keywordCount > 2) {
        score += 1;
    }

    const questionWords = [
        'لماذا', 'كيف', 'متي', 'اين', 'ماذا', 'من', 'هل', 'ما', 'ايش', 'وش',
        'why', 'how', 'when', 'where', 'what', 'who', 'which'
    ];
    questionWords.forEach(qWord => {
        if (normalizedSentence.includes(qWord)) {
            score += 1;
        }
    });

    const arabicConnectors = [
        'لان', 'حيث', 'اذ', 'بما', 'نظرا', 'بسبب', 'نتيجه', 'من اجل',
        'لكي', 'حتي', 'اذا', 'ان', 'علي', 'الرغم', 'رغم', 'مع'
    ];
    arabicConnectors.forEach(connector => {
        if (normalizedSentence.includes(connector)) {
            score += 0.5;
        }
    });

    const numbers = sentence.match(/\d+/g);
    if (numbers && numbers.length > 0) {
        score += 0.8;
    }

    const arabicNumbers = sentence.match(/[٠-٩]+/g);
    if (arabicNumbers && arabicNumbers.length > 0) {
        score += 0.8;
    }

    const percentageOrCurrency = sentence.match(/[٪%$€£]/g);
    if (percentageOrCurrency && percentageOrCurrency.length > 0) {
        score += 0.6;
    }

    let wordFrequencyScore = 0;
    const normalizedAllWords = allWords.map(w => normalizeArabicText(w.toLowerCase()));
    words.forEach(word => {
        if (word.length > 3) {
            const frequency = normalizedAllWords.filter(w => w === word).length;
            if (frequency >= 3 && frequency <= 8) {
                wordFrequencyScore += 0.4;
            }
        }
    });
    score += Math.min(wordFrequencyScore, 3);

    const hasQuotation = sentence.match(/["«»"]/g);
    if (hasQuotation) {
        score += 0.7;
    }

    const hasProperNoun = /[A-Z][a-z]+/.test(sentence);
    if (hasProperNoun) {
        score += 0.5;
    }

    const arabicVerbs = [
        'يعتبر', 'يعد', 'تعد', 'تعتبر', 'يمثل', 'تمثل', 'يشكل', 'تشكل',
        'يوضح', 'توضح', 'يبين', 'تبين', 'يفسر', 'تفسر', 'يشير', 'تشير'
    ];
    arabicVerbs.forEach(verb => {
        if (normalizedSentence.includes(normalizeArabicText(verb))) {
            score += 0.6;
        }
    });

    return score;
}

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

    showToast('تم نسخ النص');

    setTimeout(() => {
        btn.innerHTML = originalHTML;
    }, 2000);
}

function saveToHistory(type, extractedText, summary) {
    const historyItem = {
        id: Date.now(),
        type,
        extractedText: extractedText.substring(0, 500),
        summary: summary || generateSmartSummary(extractedText, 'medium'),
        timestamp: new Date().toISOString(),
        wordCount: countWords(extractedText)
    };
    historyData.unshift(historyItem);

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
                <div class="history-actions-btns">
                    <button class="btn btn-sm btn-outline" onclick="copyHistoryExtracted(${item.id})" title="نسخ النص المستخرج">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        نسخ الأصل
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="copyHistorySummary(${item.id})" title="نسخ الملخص">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        نسخ الملخص
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="deleteHistoryItem(${item.id})" title="حذف">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
            <p class="history-summary-label">النص المستخرج:</p>
            <div class="history-summary">
                <p>${item.extractedText}${item.extractedText.length >= 500 ? '...' : ''}</p>
            </div>
            ${item.summary ? `
                <p class="history-summary-label">الملخص:</p>
                <div class="history-summary">
                    <p>${item.summary}</p>
                </div>
            ` : ''}
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

function copyHistoryExtracted(id) {
    const item = historyData.find(h => h.id == id);
    if (item) {
        navigator.clipboard.writeText(item.extractedText);
        showToast('تم نسخ النص المستخرج');
    }
}

function copyHistorySummary(id) {
    const item = historyData.find(h => h.id == id);
    if (item) {
        navigator.clipboard.writeText(item.summary);
        showToast('تم نسخ الملخص');
    }
}

function deleteHistoryItem(id) {
    if (confirm('هل أنت متأكد من حذف هذا السجل؟')) {
        historyData = historyData.filter(item => item.id != id);
        localStorage.setItem('summaryHistory', JSON.stringify(historyData));
        updateHistory();
        showToast('تم حذف السجل');
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
