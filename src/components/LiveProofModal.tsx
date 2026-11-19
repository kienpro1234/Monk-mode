import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Monitor,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Upload,
  ClipboardPaste,
  Image as ImageIcon,
  Sparkles,
} from 'lucide-react';
import { ProofAnalysisResult } from '../types/models';
import { inspectImageProof, stampProofPhoto } from '../utils/proofOfWork';
import { desktopBridge, ScreenSourceItem } from '../services/desktopBridge';
import { soundEngine } from '../utils/soundEngine';

interface LiveProofModalProps {
  isOpen: boolean;
  taskTitle: string;
  initialCaption?: string;
  onConfirmProof: (stampedDataUrl: string, analysis: ProofAnalysisResult, caption: string) => void;
  onCancel: () => void;
}

export const LiveProofModal: React.FC<LiveProofModalProps> = ({
  isOpen,
  taskTitle,
  initialCaption = '',
  onConfirmProof,
  onCancel,
}) => {
  const [captureMode, setCaptureMode] = useState<'UPLOAD' | 'SCREEN' | 'WEBCAM'>('UPLOAD');
  const [screenSources, setScreenSources] = useState<ScreenSourceItem[]>([]);
  const [loadingScreen, setLoadingScreen] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [capturedRawUrl, setCapturedRawUrl] = useState<string | null>(null);
  const [stampedUrl, setStampedUrl] = useState<string | null>(null);
  const [useWatermarkSeal, setUseWatermarkSeal] = useState(true);
  const [caption, setCaption] = useState(initialCaption);
  const [analysis, setAnalysis] = useState<ProofAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const loadScreenCaptures = async () => {
    setLoadingScreen(true);
    const sources = await desktopBridge.getScreenCaptureSources();
    setScreenSources(sources);
    setLoadingScreen(false);
  };

  const startWebcam = async () => {
    setWebcamError(null);
    stopWebcam();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setWebcamError(
        'Máy tính hiện không gắn Webcam rời hoặc quyền Camera đang đóng. Bạn có thể chuyển sang tab "Tải Ảnh Từ Máy / Dán Ảnh" hoặc "Chụp Màn Hình".'
      );
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopWebcam();
      return;
    }
    setCapturedRawUrl(null);
    setStampedUrl(null);
    setAnalysis(null);
    setCaption(initialCaption || `Hoàn thành: ${taskTitle}`);
    setCaptureMode('UPLOAD');

    return () => {
      stopWebcam();
    };
  }, [isOpen, initialCaption, taskTitle]);

  useEffect(() => {
    if (!isOpen) return;
    if (captureMode === 'SCREEN') {
      stopWebcam();
      loadScreenCaptures();
    } else if (captureMode === 'WEBCAM') {
      startWebcam();
    } else {
      stopWebcam();
    }
  }, [isOpen, captureMode]);

  const evaluateCapturedDataUrl = async (
    rawUrl: string,
    source: 'UPLOAD' | 'CLIPBOARD' | 'WEBCAM' | 'SCREEN'
  ) => {
    setIsAnalyzing(true);
    setCapturedRawUrl(rawUrl);
    const res = await inspectImageProof(rawUrl, source);
    setAnalysis(res);
    const stamped = await stampProofPhoto(rawUrl, taskTitle, res);
    setStampedUrl(stamped);
    soundEngine.playWoodblockStampSound();
    setIsAnalyzing(false);
  };

  const handleFileObject = (file: File, source: 'UPLOAD' | 'CLIPBOARD' = 'UPLOAD') => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        evaluateCapturedDataUrl(reader.result, source);
      }
    };
    reader.readAsDataURL(file);
  };

  // Support Ctrl+V (Clipboard Paste) anywhere when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const handleWindowPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const blob = items[i].getAsFile();
          if (blob) {
            e.preventDefault();
            handleFileObject(blob, 'CLIPBOARD');
            return;
          }
        }
      }
    };
    window.addEventListener('paste', handleWindowPaste);
    return () => window.removeEventListener('paste', handleWindowPaste);
  }, [isOpen, taskTitle]);

  if (!isOpen) return null;

  const handleCaptureWebcamFrame = async () => {
    if (videoRef.current && streamRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 960;
      canvas.height = video.videoHeight || 540;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        await evaluateCapturedDataUrl(dataUrl, 'WEBCAM');
        return;
      }
    }
    await handleGenerateSampleProof('WEBCAM');
  };

  const handleGenerateSampleProof = async (sourceType: 'UPLOAD' | 'WEBCAM' | 'SCREEN') => {
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.src = './assets/shanshui-monk-temple.jpg';
    await new Promise<void>((r) => {
      img.onload = () => {
        ctx.drawImage(img, 0, 0, 960, 540);
        r();
      };
      img.onerror = () => r();
    });
    ctx.fillStyle = 'rgba(18, 19, 20, 0.86)';
    ctx.fillRect(40, 40, 880, 380);
    ctx.strokeStyle = '#3E8A72';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 40, 880, 380);
    ctx.fillStyle = '#F6F4EE';
    ctx.font = 'bold 22px "Noto Serif", serif';
    ctx.fillText(`MINH CHỨNG NỖ LỰC: ${taskTitle.slice(0, 46)}`, 70, 95);
    ctx.font = '15px "JetBrains Mono", monospace';
    ctx.fillStyle = '#B8B4A9';
    ctx.fillText(`Thời điểm ghi nhận: ${new Date().toLocaleString('vi-VN')}`, 70, 135);
    ctx.fillText(`Trạng thái: Đã hoàn thành nhiệm vụ & lưu vào Tàng Kinh Các`, 70, 170);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(246, 244, 238, 0.7)' : 'rgba(62, 138, 114, 0.65)';
      ctx.fillRect(70, 205 + i * 22, 260 + ((i * 97) % 450), 9);
    }
    await evaluateCapturedDataUrl(canvas.toDataURL('image/jpeg', 0.9), sourceType);
  };

  const finalImageUrl = useWatermarkSeal ? stampedUrl || capturedRawUrl : capturedRawUrl || stampedUrl;

  return (
    <div className="zen-modal-backdrop">
      <div className="zen-modal-card pow-modal-card">
        <div className="pow-modal-header">
          <div>
            <span className="zen-tag-red">BẰNG CHỨNG NỖ LỰC (LIVE PoW) &bull; LƯU TÀNG KINH CÁC</span>
            <h2 style={{ marginTop: 6 }}>Đính Kèm Ảnh Minh Chứng: {taskTitle}</h2>
            <p className="zen-muted-text">
              Tải ảnh từ máy tính, kéo thả ảnh, hoặc bấm <strong>Ctrl + V</strong> để dán ảnh chụp
              màn hình (Snipping Tool). Mọi bức ảnh đều được lưu theo dòng thời gian của Ngọn Núi để
              nhìn lại hành trình nỗ lực trong <strong>Tàng Kinh Các</strong>.
            </p>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="pow-mode-tabs" style={{ gridTemplateColumns: '1.3fr 1fr 1fr' }}>
          <button
            type="button"
            className={`pow-tab-btn ${captureMode === 'UPLOAD' ? 'active' : ''}`}
            onClick={() => setCaptureMode('UPLOAD')}
          >
            <Upload size={17} />
            <span>1. Tải Ảnh Từ Máy / Kéo Thả / Ctrl+V</span>
          </button>
          <button
            type="button"
            className={`pow-tab-btn ${captureMode === 'SCREEN' ? 'active' : ''}`}
            onClick={() => setCaptureMode('SCREEN')}
          >
            <Monitor size={17} />
            <span>2. Chụp Màn Hình Desktop</span>
          </button>
          <button
            type="button"
            className={`pow-tab-btn ${captureMode === 'WEBCAM' ? 'active' : ''}`}
            onClick={() => setCaptureMode('WEBCAM')}
          >
            <Camera size={17} />
            <span>3. Chụp Qua Webcam</span>
          </button>
        </div>

        {/* Capture / Upload Area */}
        <div className="pow-capture-body">
          {captureMode === 'UPLOAD' && (
            <div
              className={`pow-upload-dropzone ${isDraggingOver ? 'dragging' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingOver(true);
              }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileObject(file, 'UPLOAD');
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileObject(file, 'UPLOAD');
                }}
              />
              <div className="pow-dropzone-inner">
                <div className="pow-dropzone-icon">
                  <ImageIcon size={34} color="#A8D8C6" />
                </div>
                <h3>Bấm Để Chọn Ảnh Từ Máy Tính Hoặc Kéo Thả Ảnh Vào Đây</h3>
                <p>
                  Hỗ trợ <strong>JPG, PNG, WEBP</strong> &bull; Hoặc dùng tổ hợp phím{' '}
                  <code>Win + Shift + S</code> chụp màn hình rồi nhấn <code>Ctrl + V</code> ngay tại
                  cửa sổ này!
                </p>
                <div style={{ display: 'flex', gap: 10, marginTop: 10, justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="zen-btn zen-btn-seal"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  >
                    <Upload size={15} />
                    <span>Chọn File Ảnh Từ Máy Tính</span>
                  </button>
                  <button
                    type="button"
                    className="zen-btn zen-btn-outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleGenerateSampleProof('UPLOAD');
                    }}
                  >
                    <Sparkles size={15} />
                    <span>Tạo Ảnh Minh Chứng Mẫu Nhanh</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {captureMode === 'SCREEN' && (
            <div className="pow-screen-picker">
              <div className="pow-screen-toolbar">
                <span>Chụp trực tiếp màn hình tài liệu / bài học / code đang mở trên máy:</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="zen-btn zen-btn-outline"
                    onClick={loadScreenCaptures}
                  >
                    <RefreshCw size={14} />
                    <span>Làm mới</span>
                  </button>
                  <button
                    type="button"
                    className="zen-btn zen-btn-seal"
                    onClick={() => {
                      if (screenSources.length > 0) {
                        evaluateCapturedDataUrl(screenSources[0].dataUrl, 'SCREEN');
                      } else {
                        handleGenerateSampleProof('SCREEN');
                      }
                    }}
                  >
                    <Camera size={15} />
                    <span>Chụp Màn Hình Hiện Tại</span>
                  </button>
                </div>
              </div>

              {loadingScreen ? (
                <div className="pow-placeholder">Đang thu thập hình ảnh màn hình...</div>
              ) : screenSources.length > 0 ? (
                <div className="pow-sources-grid">
                  {screenSources.map((src) => (
                    <div
                      key={src.id}
                      className="pow-source-card"
                      onClick={() => evaluateCapturedDataUrl(src.dataUrl, 'SCREEN')}
                    >
                      <img src={src.dataUrl} alt={src.name} />
                      <div className="pow-source-name">{src.name} (Bấm để chọn)</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="pow-placeholder">
                  <p>
                    Bấm nút <strong>"Chụp Màn Hình Hiện Tại"</strong> phía trên hoặc chuyển sang tab{' '}
                    <strong>"Tải Ảnh Từ Máy / Ctrl+V"</strong>.
                  </p>
                </div>
              )}
            </div>
          )}

          {captureMode === 'WEBCAM' && (
            <div className="pow-webcam-box">
              {webcamError ? (
                <div
                  className="zen-alert-box alert-warning"
                  style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}
                >
                  <span>{webcamError}</span>
                  <button
                    type="button"
                    className="zen-btn zen-btn-seal"
                    onClick={() => setCaptureMode('UPLOAD')}
                  >
                    <Upload size={16} />
                    <span>Chuyển Sang Tải Ảnh Từ Máy Tính</span>
                  </button>
                </div>
              ) : (
                <div className="pow-video-wrapper">
                  <video ref={videoRef} autoPlay playsInline muted className="pow-video-preview" />
                  <button
                    type="button"
                    className="zen-btn zen-btn-seal"
                    style={{ marginTop: 12 }}
                    onClick={handleCaptureWebcamFrame}
                  >
                    <Camera size={16} />
                    <span>Chụp Ảnh Qua Camera</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {isAnalyzing && (
            <div className="pow-placeholder">Đang xử lý & đóng dấu ấn thời gian lên ảnh...</div>
          )}

          {finalImageUrl && analysis && (
            <div className="pow-analysis-panel valid">
              <div className="pow-analysis-info">
                <div className="pow-analysis-status">
                  <CheckCircle2 size={20} color="#4CAF50" />
                  <strong style={{ color: '#4CAF50' }}>
                    ĐÃ TẢI ẢNH MINH CHỨNG THÀNH CÔNG — SẴN SÀNG LƯU VÀO HÀNH TRÌNH ĐỈNH NÚI
                  </strong>
                </div>

                <div style={{ marginTop: 10 }}>
                  <label style={{ fontSize: 12, color: '#B8B4A9', display: 'block', marginBottom: 4 }}>
                    Ghi chú / Chú thích cho bức ảnh này (Hiển thị trong Tàng Kinh Các):
                  </label>
                  <input
                    type="text"
                    className="zen-input"
                    style={{ width: '100%' }}
                    placeholder="VD: Đã giải xong 2 đề đọc hiểu HSK6 đạt 88/100..."
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                  />
                </div>

                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12.5,
                      cursor: 'pointer',
                      color: '#F6F4EE',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={useWatermarkSeal}
                      onChange={(e) => setUseWatermarkSeal(e.target.checked)}
                    />
                    Đóng dấu mộc đỏ Chu Sa & mốc thời gian lên góc ảnh
                  </label>
                </div>

                <div className="pow-metrics-row" style={{ marginTop: 8 }}>
                  <span>
                    Thời gian ghi nhận:{' '}
                    <strong>{new Date(analysis.capturedAt).toLocaleString('vi-VN')}</strong>
                  </span>
                </div>
              </div>

              <div className="pow-stamped-preview">
                <img src={finalImageUrl} alt="Proof of Work" />
              </div>
            </div>
          )}
        </div>

        <div className="pomodoro-actions-row">
          <span style={{ fontSize: 12, color: '#B8B4A9', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ClipboardPaste size={14} /> Mẹo nhanh: Bấm <strong>Ctrl + V</strong> để dán ảnh từ Clipboard
          </span>

          <div style={{ flex: 1 }} />

          <button type="button" className="zen-btn zen-btn-ghost" onClick={onCancel}>
            Hủy
          </button>

          <button
            type="button"
            className="zen-btn zen-btn-seal"
            disabled={!finalImageUrl || !analysis}
            onClick={() => {
              if (finalImageUrl && analysis) {
                onConfirmProof(
                  finalImageUrl,
                  { ...analysis, isValid: true },
                  caption.trim() || taskTitle
                );
              }
            }}
          >
            <ShieldCheck size={16} />
            <span>Lưu Ảnh Bằng Chứng & Xác Nhận Hoàn Thành</span>
          </button>
        </div>
      </div>
    </div>
  );
};
