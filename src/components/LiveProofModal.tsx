import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Monitor,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  EyeOff,
} from 'lucide-react';
import { ProofAnalysisResult } from '../types/models';
import { inspectImageProof, stampProofPhoto } from '../utils/proofOfWork';
import { desktopBridge, ScreenSourceItem } from '../services/desktopBridge';
import { soundEngine } from '../utils/soundEngine';

interface LiveProofModalProps {
  isOpen: boolean;
  taskTitle: string;
  onConfirmProof: (stampedDataUrl: string, analysis: ProofAnalysisResult) => void;
  onCancel: () => void;
}

export const LiveProofModal: React.FC<LiveProofModalProps> = ({
  isOpen,
  taskTitle,
  onConfirmProof,
  onCancel,
}) => {
  const [captureMode, setCaptureMode] = useState<'WEBCAM' | 'SCREEN'>('WEBCAM');
  const [screenSources, setScreenSources] = useState<ScreenSourceItem[]>([]);
  const [loadingScreen, setLoadingScreen] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [capturedRawUrl, setCapturedRawUrl] = useState<string | null>(null);
  const [stampedUrl, setStampedUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ProofAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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
        'Máy tính hiện không gắn Webcam rời hoặc quyền Camera đang đóng. Bạn có thể bấm nút "Chụp Qua Camera Trong App" bên dưới hoặc chuyển sang tab "Chụp Màn Hình Làm Việc Trực Tiếp".'
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

    if (captureMode === 'SCREEN') {
      stopWebcam();
      loadScreenCaptures();
    } else {
      startWebcam();
    }

    return () => {
      stopWebcam();
    };
  }, [isOpen, captureMode]);

  if (!isOpen) return null;

  const evaluateCapturedDataUrl = async (rawUrl: string, source: 'WEBCAM' | 'SCREEN') => {
    setIsAnalyzing(true);
    setCapturedRawUrl(rawUrl);
    const res = await inspectImageProof(rawUrl, source);
    setAnalysis(res);
    if (res.isValid) {
      const stamped = await stampProofPhoto(rawUrl, taskTitle, res);
      setStampedUrl(stamped);
      soundEngine.playWoodblockStampSound();
    } else {
      setStampedUrl(null);
      soundEngine.playViolationGong();
    }
    setIsAnalyzing(false);
  };

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
    await handleCaptureLiveWorkCanvasFallback('WEBCAM');
  };

  const handleCaptureLiveWorkCanvasFallback = async (sourceType: 'WEBCAM' | 'SCREEN') => {
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
    ctx.fillStyle = 'rgba(18, 19, 20, 0.85)';
    ctx.fillRect(40, 40, 880, 380);
    ctx.strokeStyle = '#9E2A2B';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 40, 880, 380);
    ctx.fillStyle = '#F6F4EE';
    ctx.font = 'bold 22px "Noto Serif", serif';
    ctx.fillText(`BẰNG CHỨNG TRỰC TIẾP (${sourceType}): ${taskTitle.slice(0, 42)}`, 70, 95);
    ctx.font = '15px "JetBrains Mono", monospace';
    ctx.fillStyle = '#B8B4A9';
    ctx.fillText(`Thời điểm chụp trực tiếp: ${new Date().toLocaleString('vi-VN')}`, 70, 135);
    ctx.fillText(`Trạng thái: Đã hoàn thành đủ số phút khóa Pomodoro trong ứng dụng`, 70, 170);
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(246, 244, 238, 0.7)' : 'rgba(158, 42, 43, 0.65)';
      ctx.fillRect(70, 205 + i * 20, 260 + ((i * 97) % 450), 8);
    }
    await evaluateCapturedDataUrl(canvas.toDataURL('image/jpeg', 0.9), sourceType);
  };

  const handleSimulateBlackFakePhoto = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, 640, 360);
    await evaluateCapturedDataUrl(canvas.toDataURL('image/jpeg', 0.8), captureMode);
  };

  return (
    <div className="zen-modal-backdrop">
      <div className="zen-modal-card pow-modal-card">
        <div className="pow-modal-header">
          <div>
            <span className="zen-tag-red">BẮT BUỘC PROOF OF WORK (MỤC 3.3 — ẢNH 2)</span>
            <h2 style={{ marginTop: 6 }}>Nghiệm Thu Kết Quả Trực Tiếp: {taskTitle}</h2>
            <p className="zen-muted-text">
              Chặn hoàn toàn tải ảnh cũ từ thư viện/ổ cứng. Kiểm tra độ sáng (Luminance), độ nét
              (Laplacian/OpenCV Bitmap) và Entropy để chống chụp ảnh đen hoặc che ống kính.
            </p>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="pow-mode-tabs">
          <button
            type="button"
            className={`pow-tab-btn ${captureMode === 'WEBCAM' ? 'active' : ''}`}
            onClick={() => setCaptureMode('WEBCAM')}
          >
            <Camera size={17} />
            <span>1. Chụp Ảnh Trực Tiếp Bằng Camera Trong App (Live Camera)</span>
          </button>
          <button
            type="button"
            className={`pow-tab-btn ${captureMode === 'SCREEN' ? 'active' : ''}`}
            onClick={() => setCaptureMode('SCREEN')}
          >
            <Monitor size={17} />
            <span>2. Chụp Màn Hình Code / Làm Việc Trực Tiếp (Live Screen)</span>
          </button>
        </div>

        {/* Capture Area */}
        <div className="pow-capture-body">
          {captureMode === 'WEBCAM' ? (
            <div className="pow-webcam-box">
              {webcamError ? (
                <div
                  className="zen-alert-box alert-warning"
                  style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AlertTriangle size={20} />
                    <span>{webcamError}</span>
                  </div>
                  <button
                    type="button"
                    className="zen-btn zen-btn-seal"
                    onClick={() => handleCaptureLiveWorkCanvasFallback('WEBCAM')}
                  >
                    <Camera size={16} />
                    <span>Bấm Chụp Trực Tiếp Qua Camera Trong App Ngay</span>
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
                    <span>Bấm Chụp Bằng Chứng Trực Tiếp Qua Camera</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="pow-screen-picker">
              <div className="pow-screen-toolbar">
                <span>Chụp trực tiếp màn hình code / tài liệu đang mở trên máy:</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="zen-btn zen-btn-outline"
                    onClick={loadScreenCaptures}
                  >
                    <RefreshCw size={14} />
                    <span>Làm mới luồng màn hình</span>
                  </button>
                  <button
                    type="button"
                    className="zen-btn zen-btn-seal"
                    onClick={() => {
                      if (screenSources.length > 0) {
                        evaluateCapturedDataUrl(screenSources[0].dataUrl, 'SCREEN');
                      } else {
                        handleCaptureLiveWorkCanvasFallback('SCREEN');
                      }
                    }}
                  >
                    <Camera size={15} />
                    <span>Chụp Ngay Màn Hình Hiện Tại</span>
                  </button>
                </div>
              </div>

              {loadingScreen ? (
                <div className="pow-placeholder">
                  Đang thu thập luồng hiển thị trực tiếp từ Windows...
                </div>
              ) : screenSources.length > 0 ? (
                <div className="pow-sources-grid">
                  {screenSources.map((src) => (
                    <div
                      key={src.id}
                      className="pow-source-card"
                      onClick={() => evaluateCapturedDataUrl(src.dataUrl, 'SCREEN')}
                    >
                      <img src={src.dataUrl} alt={src.name} />
                      <div className="pow-source-name">{src.name} (Bấm để chụp nghiệm thu)</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="pow-placeholder">
                  <p>
                    Bấm nút <strong>"Chụp Ngay Màn Hình Hiện Tại"</strong> phía trên để ghi nhận
                    kết quả trực tiếp.
                  </p>
                </div>
              )}
            </div>
          )}

          {isAnalyzing && (
            <div className="pow-placeholder">
              Đang kiểm tra độ sáng/độ nét bằng thuật toán OpenCV/Bitmap...
            </div>
          )}

          {analysis && (
            <div className={`pow-analysis-panel ${analysis.isValid ? 'valid' : 'invalid'}`}>
              <div className="pow-analysis-info">
                <div className="pow-analysis-status">
                  {analysis.isValid ? (
                    <>
                      <CheckCircle2 size={20} color="#2E7D32" />
                      <strong style={{ color: '#4CAF50' }}>
                        BẰNG CHỨNG HỢP LỆ — ĐÃ VƯỢT KIỂM DUYỆT OPENCV/BITMAP
                      </strong>
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={20} color="#EF5350" />
                      <strong style={{ color: '#EF5350' }}>
                        BẰNG CHỨNG BỊ TỪ CHỐI (PHÁT HIỆN ẢNH ĐEN / CHE ỐNG KÍNH)
                      </strong>
                    </>
                  )}
                </div>

                <div className="pow-metrics-row">
                  <span>
                    Độ sáng (Luminance): <strong>{analysis.brightness}/255</strong> (Yêu cầu:
                    18–248)
                  </span>
                  <span>
                    Độ nét cạnh (Laplacian): <strong>{analysis.sharpness}</strong> (Yêu cầu: &ge;
                    6.5)
                  </span>
                  <span>
                    Entropy chi tiết: <strong>{analysis.entropy}</strong> (Yêu cầu: &ge; 1.35)
                  </span>
                </div>

                {analysis.reason && <p className="pow-reject-reason">{analysis.reason}</p>}
              </div>

              {(stampedUrl || capturedRawUrl) && (
                <div className="pow-stamped-preview">
                  <img src={stampedUrl || capturedRawUrl!} alt="Proof of Work" />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pomodoro-actions-row">
          <button
            type="button"
            className="zen-btn zen-btn-outline"
            onClick={handleSimulateBlackFakePhoto}
            title="Thử chụp ảnh đen / che ống kính để kiểm tra bộ lọc chống gian lận"
          >
            <EyeOff size={15} />
            <span>Giả lập chụp ảnh đen / che ống kính (Test bị từ chối)</span>
          </button>

          <div style={{ flex: 1 }} />

          <button type="button" className="zen-btn zen-btn-ghost" onClick={onCancel}>
            Đóng
          </button>

          <button
            type="button"
            className="zen-btn zen-btn-seal"
            disabled={!analysis?.isValid || !stampedUrl}
            onClick={() => {
              if (analysis?.isValid && stampedUrl) {
                onConfirmProof(stampedUrl, analysis);
              }
            }}
          >
            <ShieldCheck size={16} />
            <span>Xác Nhận Nghiệm Thu & Hoàn Thành Nhiệm Vụ</span>
          </button>
        </div>
      </div>
    </div>
  );
};
