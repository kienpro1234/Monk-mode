import { ProofAnalysisResult } from '../types/models';

/**
 * OpenCV/Bitmap-inspired Proof of Work Image Inspector (Section 3.3)
 * Checks brightness, Laplacian edge sharpness, and Shannon histogram entropy
 * to prevent black images, covered webcams, or blank/solid-color captures.
 */
export async function inspectImageProof(
  dataUrl: string,
  source: 'WEBCAM' | 'SCREEN'
): Promise<ProofAnalysisResult> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = 320;
      const h = 180;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({
          brightness: 0,
          sharpness: 0,
          entropy: 0,
          isValid: false,
          reason: 'Không thể khởi tạo bộ phân tích Bitmap.',
          source,
          capturedAt: Date.now(),
        });
        return;
      }

      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h).data;
      const gray = new Float32Array(w * h);
      const hist = new Int32Array(32);

      let sumLum = 0;
      for (let i = 0; i < w * h; i++) {
        const r = imgData[i * 4];
        const g = imgData[i * 4 + 1];
        const b = imgData[i * 4 + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        gray[i] = lum;
        sumLum += lum;
        const bin = Math.min(31, Math.floor(lum / 8));
        hist[bin]++;
      }

      const brightness = Number((sumLum / (w * h)).toFixed(1));

      // Shannon Entropy (0..5)
      let entropy = 0;
      const totalPixels = w * h;
      for (let b = 0; b < 32; b++) {
        if (hist[b] > 0) {
          const p = hist[b] / totalPixels;
          entropy -= p * Math.log2(p);
        }
      }
      entropy = Number(entropy.toFixed(2));

      // 3x3 Laplacian Variance for Sharpness
      let lapSum = 0;
      let lapSqSum = 0;
      let count = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = y * w + x;
          const lap =
            gray[idx - w] +
            gray[idx + w] +
            gray[idx - 1] +
            gray[idx + 1] -
            4 * gray[idx];
          lapSum += lap;
          lapSqSum += lap * lap;
          count++;
        }
      }
      const meanLap = lapSum / count;
      const variance = lapSqSum / count - meanLap * meanLap;
      const sharpness = Number(Math.sqrt(Math.max(0, variance)).toFixed(1));

      if (brightness < 18) {
        resolve({
          brightness,
          sharpness,
          entropy,
          isValid: false,
          reason: `Bằng chứng bị từ chối: Độ sáng quá thấp (${brightness}/255 < 18). Nghi vấn chụp ảnh đen hoặc che ống kính.`,
          source,
          capturedAt: Date.now(),
        });
        return;
      }

      if (brightness > 248) {
        resolve({
          brightness,
          sharpness,
          entropy,
          isValid: false,
          reason: `Bằng chứng bị từ chối: Ảnh trắng lóa (${brightness}/255 > 248), không có nội dung thực tế.`,
          source,
          capturedAt: Date.now(),
        });
        return;
      }

      if (sharpness < 6.5 || entropy < 1.35) {
        resolve({
          brightness,
          sharpness,
          entropy,
          isValid: false,
          reason: `Bằng chứng bị từ chối: Độ nét (${sharpness}) hoặc mật độ chi tiết (${entropy}) quá thấp. Hãy chụp rõ trang sách, màn hình code hoặc kết quả thực tế.`,
          source,
          capturedAt: Date.now(),
        });
        return;
      }

      resolve({
        brightness,
        sharpness,
        entropy,
        isValid: true,
        source,
        capturedAt: Date.now(),
      });
    };
    img.onerror = () => {
      resolve({
        brightness: 0,
        sharpness: 0,
        entropy: 0,
        isValid: false,
        reason: 'Dữ liệu hình ảnh không hợp lệ.',
        source,
        capturedAt: Date.now(),
      });
    };
    img.src = dataUrl;
  });
}

/**
 * Stamps a red woodblock verification seal onto the proof photo
 */
export async function stampProofPhoto(
  dataUrl: string,
  taskTitle: string,
  analysis: ProofAnalysisResult
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 960;
      canvas.height = 540;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Dark bottom strip
      ctx.fillStyle = 'rgba(18, 19, 20, 0.82)';
      ctx.fillRect(0, canvas.height - 64, canvas.width, 64);

      ctx.fillStyle = '#F6F4EE';
      ctx.font = 'bold 16px "Noto Serif", serif';
      ctx.fillText(`BẰNG CHỨNG XÁC THỰC (PoW): ${taskTitle.slice(0, 52)}`, 20, canvas.height - 36);

      ctx.fillStyle = '#B8B4A9';
      ctx.font = '13px "JetBrains Mono", monospace';
      const timeStr = new Date(analysis.capturedAt).toLocaleString('vi-VN');
      ctx.fillText(
        `Nguồn: ${analysis.source} | Độ sáng: ${analysis.brightness} | Độ nét: ${analysis.sharpness} | Entropy: ${analysis.entropy} | ${timeStr}`,
        20,
        canvas.height - 14
      );

      // Red Cinnabar Woodblock Seal in bottom-right
      ctx.save();
      ctx.translate(canvas.width - 110, canvas.height - 105);
      ctx.rotate(-0.12);
      ctx.strokeStyle = '#9E2A2B';
      ctx.lineWidth = 4;
      ctx.fillStyle = 'rgba(158, 42, 43, 0.16)';
      ctx.fillRect(0, 0, 88, 88);
      ctx.strokeRect(0, 0, 88, 88);
      ctx.strokeRect(5, 5, 78, 78);

      ctx.fillStyle = '#9E2A2B';
      ctx.font = 'bold 14px "Noto Serif", serif';
      ctx.textAlign = 'center';
      ctx.fillText('LÊN NÚI', 44, 28);
      ctx.fillText('NGHIỆM', 44, 50);
      ctx.fillText('THU ẤN', 44, 72);
      ctx.restore();

      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Lexical Diversity & Valid Word Count Inspector for Daily Reflection Journal (Section 3.3 & 7)
 * Enforces >= 100 valid words and >= 0.45 lexical diversity in Monk Mode ON.
 */
export interface JournalValidationResult {
  validWordCount: number;
  rawWordCount: number;
  lexicalDiversityScore: number;
  invalidSpamWords: number;
  isPassingInMonkMode: boolean;
  reason?: string;
}

const VIETNAMESE_VOWEL_REGEX = /[aăâeêioôơuưyáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;

function isValidVietnameseOrEnglishWord(raw: string): boolean {
  const cleaned = raw.replace(/^[^a-zA-Z0-9À-ỹ]+|[^a-zA-Z0-9À-ỹ]+$/g, '').toLowerCase();
  if (!cleaned || cleaned.length < 1) return false;
  if (cleaned.length > 24) return false; // Keyboard mashing like "asdfghjklqwertyuiopzxcvbnm"
  if (/^\d+$/.test(cleaned)) return false; // Pure numbers don't count toward 100 reflective words
  if (!VIETNAMESE_VOWEL_REGEX.test(cleaned)) return false; // Must have a vowel
  if (/(.)\1{2,}/.test(cleaned)) return false; // 3+ identical consecutive chars like "aaaa", "hhhh"
  if (cleaned.length === 1 && !['ở', 'ý', 'ư', 'à', 'ồ', 'i', 'a'].includes(cleaned)) return false;
  return true;
}

export function analyzeReflectionText(text: string): JournalValidationResult {
  const tokens = text
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (tokens.length === 0) {
    return {
      validWordCount: 0,
      rawWordCount: 0,
      lexicalDiversityScore: 0,
      invalidSpamWords: 0,
      isPassingInMonkMode: false,
      reason: 'Chưa nhập nội dung Tự Vấn.',
    };
  }

  const validWords: string[] = [];
  let invalidSpamWords = 0;

  for (const token of tokens) {
    if (isValidVietnameseOrEnglishWord(token)) {
      const normalized = token.replace(/^[^a-zA-Z0-9À-ỹ]+|[^a-zA-Z0-9À-ỹ]+$/g, '').toLowerCase();
      validWords.push(normalized);
    } else {
      invalidSpamWords++;
    }
  }

  const validWordCount = validWords.length;
  if (validWordCount === 0) {
    return {
      validWordCount: 0,
      rawWordCount: tokens.length,
      lexicalDiversityScore: 0,
      invalidSpamWords,
      isPassingInMonkMode: false,
      reason: 'Không phát hiện từ vựng hợp lệ (Nghi vấn gõ ký tự rác).',
    };
  }

  // Compute Moving-Window Type-Token Ratio (MATTR-80) + Unique Bigram Ratio
  const windowSize = Math.min(80, validWordCount);
  let ttrSum = 0;
  let windowsCount = 0;
  for (let start = 0; start <= validWordCount - windowSize; start += 10) {
    const slice = validWords.slice(start, start + windowSize);
    const uniqueInSlice = new Set(slice).size;
    ttrSum += uniqueInSlice / slice.length;
    windowsCount++;
  }
  const mattr = windowsCount > 0 ? ttrSum / windowsCount : new Set(validWords).size / validWordCount;

  // Bigram uniqueness to catch repeated phrases
  const bigrams: string[] = [];
  for (let i = 0; i < validWords.length - 1; i++) {
    bigrams.push(`${validWords[i]}_${validWords[i + 1]}`);
  }
  const bigramRatio = bigrams.length > 0 ? new Set(bigrams).size / bigrams.length : 1;

  // Combined Lexical Diversity Score (0..1)
  const rawDiversity = mattr * 0.65 + bigramRatio * 0.35;
  const spamPenalty = tokens.length > 0 ? Math.max(0, 1 - (invalidSpamWords / tokens.length) * 1.5) : 1;
  const lexicalDiversityScore = Number((rawDiversity * spamPenalty).toFixed(2));

  const isPassingInMonkMode = validWordCount >= 100 && lexicalDiversityScore >= 0.45;
  let reason: string | undefined;
  if (validWordCount < 100) {
    reason = `Cần tối thiểu 100 từ hợp lệ (Hiện tại: ${validWordCount}/100 từ).`;
  } else if (lexicalDiversityScore < 0.45) {
    reason = `Mật độ từ vựng quá thấp (${lexicalDiversityScore} < 0.45). Hệ thống phát hiện lặp từ hoặc gõ đối phó.`;
  }

  return {
    validWordCount,
    rawWordCount: tokens.length,
    lexicalDiversityScore,
    invalidSpamWords,
    isPassingInMonkMode,
    reason,
  };
}

/**
 * Generates a live 1920x1080 Shanshui Zen Desktop Wallpaper with overlaid
 * Motto, Countdown, and Progress % (Section 4: Dual Ascent Wallpaper & Direct Display)
 */
export async function renderMonkDesktopWallpaper(params: {
  mottoText: string;
  remainingDaysText: string;
  progressPct: number;
  currentStreak: number;
  mode: 'HOME_TEMPLE' | 'LOCK_MOUNTAIN';
}): Promise<string> {
  const width = 1920;
  const height = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const imgSrc =
    params.mode === 'LOCK_MOUNTAIN'
      ? './assets/shanshui-mountains.jpg'
      : './assets/shanshui-monk-temple.jpg';

  await new Promise<void>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
      resolve();
    };
    img.onerror = () => {
      // Fallback Xuan paper gradient
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, '#E9E5DA');
      grad.addColorStop(1, '#CFC8B8');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      resolve();
    };
    img.src = imgSrc;
  });

  // Subtle dark ink vignette at top-left for the Zen HUD overlay
  ctx.fillStyle = 'rgba(18, 19, 20, 0.86)';
  ctx.fillRect(64, 64, 680, 320);
  ctx.strokeStyle = '#9E2A2B';
  ctx.lineWidth = 2;
  ctx.strokeRect(64, 64, 680, 320);
  ctx.strokeStyle = 'rgba(246, 244, 238, 0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(72, 72, 664, 304);

  // Header Badge
  ctx.fillStyle = '#9E2A2B';
  ctx.fillRect(92, 94, 180, 28);
  ctx.fillStyle = '#F6F4EE';
  ctx.font = 'bold 13px "JetBrains Mono", monospace';
  ctx.fillText('MONK MODE: TRÊN ĐỈNH NÚI', 104, 113);

  ctx.fillStyle = '#B8B4A9';
  ctx.font = '13px "JetBrains Mono", monospace';
  ctx.fillText(`CHUỖI TU LUYỆN: ${params.currentStreak} NGÀY`, 290, 113);

  // 1. Motto Text (Câu tâm niệm tu luyện)
  ctx.fillStyle = '#F6F4EE';
  ctx.font = 'italic 23px "Cormorant Garamond", "Noto Serif", serif';
  const motto = `"${params.mottoText}"`;
  ctx.fillText(motto.slice(0, 56), 92, 162);
  if (motto.length > 56) {
    ctx.fillText(motto.slice(56, 112), 92, 192);
  }

  // 2. Countdown (Đồng hồ đếm ngược ngày/giờ xuống núi)
  ctx.fillStyle = '#B8B4A9';
  ctx.font = '12px "JetBrains Mono", monospace';
  ctx.fillText('THỜI GIAN CÒN LẠI TRÊN NÚI:', 92, 235);
  ctx.fillStyle = '#F6F4EE';
  ctx.font = 'bold 28px "JetBrains Mono", monospace';
  ctx.fillText(params.remainingDaysText, 92, 270);

  // 3. Progress Bar (Thanh tiến độ hoàn thành mục tiêu %)
  ctx.fillStyle = '#B8B4A9';
  ctx.font = '12px "JetBrains Mono", monospace';
  ctx.fillText(`TIẾN ĐỘ ĐỈNH NÚI: ${params.progressPct}% / 100%`, 92, 310);

  ctx.fillStyle = 'rgba(246, 244, 238, 0.14)';
  ctx.fillRect(92, 324, 500, 16);
  ctx.fillStyle = '#9E2A2B';
  ctx.fillRect(92, 324, Math.max(4, (500 * Math.min(100, params.progressPct)) / 100), 16);

  // Red Cinnabar Stamp on the right of the card
  ctx.save();
  ctx.translate(625, 245);
  ctx.strokeStyle = '#9E2A2B';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, 86, 86);
  ctx.strokeRect(5, 5, 76, 76);
  ctx.fillStyle = '#9E2A2B';
  ctx.font = 'bold 16px "Noto Serif", serif';
  ctx.textAlign = 'center';
  ctx.fillText('TỊNH', 43, 34);
  ctx.fillText('GIỚI', 43, 62);
  ctx.restore();

  return canvas.toDataURL('image/png');
}
