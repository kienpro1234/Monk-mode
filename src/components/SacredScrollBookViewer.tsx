import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  Award,
  CheckCircle2,
  X,
  Stamp,
  Clock,
  Camera,
  Swords,
  FileText,
  Flame,
} from 'lucide-react';
import { SacredScrollEntity, SacredScrollSnapshot } from '../types/models';
import { WoodblockSealSvg } from './WoodblockSealSvg';
import { soundEngine } from '../utils/soundEngine';
import { desktopBridge, resolveProofImageUrl } from '../services/desktopBridge';

interface SacredScrollBookViewerProps {
  scroll: SacredScrollEntity;
  isCeremonyMode?: boolean;
  onFinishCeremony?: () => void;
  onClose?: () => void;
  onExportedPdf?: (scrollId: string, pdfPath: string) => void;
}

export const SacredScrollBookViewer: React.FC<SacredScrollBookViewerProps> = ({
  scroll,
  isCeremonyMode = false,
  onFinishCeremony,
  onClose,
  onExportedPdf,
}) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [isStamped, setIsStamped] = useState(!isCeremonyMode);
  const [shakeScreen, setShakeScreen] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [zoomedPhoto, setZoomedPhoto] = useState<{
    uri: string;
    title: string;
    caption: string;
    timeStr: string;
  } | null>(null);

  const snapshot: SacredScrollSnapshot | null = useMemo(() => {
    try {
      return JSON.parse(scroll.snapshotJson);
    } catch {
      return null;
    }
  }, [scroll.snapshotJson]);

  const goals = snapshot?.goals || [];
  const primaryGoal = goals[0];
  const allStrikes = useMemo(() => {
    const list = snapshot?.strikes || [];
    return [...list].sort((a, b) => (b.completedAt || b.createdAt || 0) - (a.completedAt || a.createdAt || 0));
  }, [snapshot]);

  // Build chronological timeline of all proof photos across all todos of this mountain
  const timelinePhotos = useMemo(() => {
    const photos: Array<{
      id: string;
      uri: string;
      taskTitle: string;
      caption: string;
      date: string;
      timestamp: number;
      pomodoroMins: number;
    }> = [];

    for (const s of allStrikes) {
      if (s.proofPhotosList && s.proofPhotosList.length > 0) {
        for (const p of s.proofPhotosList) {
          photos.push({
            id: p.id,
            uri: p.uri,
            taskTitle: s.title,
            caption: p.caption || s.proofPhotoCaption || s.title,
            date: s.date,
            timestamp: p.capturedAt || s.completedAt || Date.now(),
            pomodoroMins: p.pomodoroMins ?? (s.completedPomodoroMins || 0),
          });
        }
      } else if (s.proofPhotoUri) {
        photos.push({
          id: `photo-${s.id}`,
          uri: s.proofPhotoUri,
          taskTitle: s.title,
          caption: s.proofPhotoCaption || s.notes || s.title,
          date: s.date,
          timestamp: s.proofAnalysis?.capturedAt || s.completedAt || Date.now(),
          pomodoroMins: s.completedPomodoroMins || 0,
        });
      }
    }

    return photos.sort((a, b) => a.timestamp - b.timestamp);
  }, [allStrikes]);

  const journals = snapshot?.journals || [];
  const totalPages = 4;

  const handlePerformSealStamp = () => {
    soundEngine.playWoodblockStampSound();
    setShakeScreen(true);
    setIsStamped(true);
    setTimeout(() => setShakeScreen(false), 650);
  };

  const handleExportPdf = async () => {
    setExportStatus('Đang kết xuất Sổ Ghi Chép Lịch Sử & Chứng Nhận sang định dạng PDF...');
    const sealedDateStr = new Date(scroll.sealedAt).toLocaleString('vi-VN');

    const milestonesHtml =
      primaryGoal?.milestones && primaryGoal.milestones.length > 0
        ? primaryGoal.milestones
            .map(
              (m, idx) =>
                `<li style="margin-bottom:6px;"><strong>Mục ${idx + 1}:</strong> ${m.title} — <span style="color:#2F6B57;font-weight:bold;">✓ Đã hoàn thành</span></li>`
            )
            .join('')
        : '';

    const strikesHtml = allStrikes
      .map(
        (s, idx) => `
      <div style="border-bottom:1px dashed #B5AFA0; padding: 10px 0;">
        <div><strong>#${idx + 1} [${s.date}] ${s.title}</strong> — <span style="color:#2F6B57;">Pomodoro thực tế: ${s.completedPomodoroMins || 0} phút</span></div>
        ${s.notes ? `<div style="font-size:12.5px; color:#444; margin-top:3px;">Ghi chú: ${s.notes}</div>` : ''}
      </div>`
      )
      .join('');

    const photosHtml = timelinePhotos
      .map(
        (p, idx) => `
      <div style="border:1px solid #B5AFA0; padding:12px; margin-bottom:14px; background:#EFECE2; page-break-inside:avoid;">
        <div style="font-size:12px; color:#2F6B57; font-weight:bold; margin-bottom:6px;">
          MỐC THỜI GIAN #${idx + 1}: ${new Date(p.timestamp).toLocaleString('vi-VN')} | Pomodoro: ${p.pomodoroMins} phút
        </div>
        <div style="font-weight:bold; margin-bottom:6px;">Nhiệm vụ: ${p.taskTitle}</div>
        <div style="font-size:13px; font-style:italic; margin-bottom:8px;">“${p.caption}”</div>
        <img src="${resolveProofImageUrl(p.uri, true)}" style="max-width:100%; max-height:260px; object-fit:contain; border:1px solid #1C1D1F;" />
      </div>`
      )
      .join('');

    const journalsHtml = journals
      .map(
        (j) => `
      <div style="margin-bottom: 18px; padding: 14px; border: 1px solid #C5BFB0; background: #EFECE2; page-break-inside:avoid;">
        <div style="font-weight:bold; color:#2F6B57; margin-bottom:6px;">
          Ngày Tự Vấn: ${j.date} | Số từ: ${j.validWordCount} | Độ tập trung: ${j.focusRating}/5
        </div>
        <p style="line-height:1.65; margin:0; text-align:justify;">${j.content}</p>
        ${j.repentanceNote ? `<div style="margin-top:6px; font-size:12px; color:#555;">Cam kết / Ghi chú: ${j.repentanceNote}</div>` : ''}
      </div>`
      )
      .join('');

    const htmlContent = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>${scroll.title}</title>
  <style>
    body {
      background: #F6F4EE;
      color: #1C1D1F;
      font-family: 'Noto Serif', Georgia, serif;
      padding: 36px 48px;
      margin: 0;
    }
    .scroll-border {
      border: 4px double #1C1D1F;
      padding: 32px;
      position: relative;
    }
    .seal-box {
      border: 4px solid #2F6B57;
      color: #2F6B57;
      display: inline-block;
      padding: 10px 18px;
      font-weight: bold;
      text-align: center;
      transform: rotate(-3deg);
      margin-top: 14px;
    }
    h1, h2, h3 { color: #1C1D1F; }
    .cinnabar { color: #2F6B57; }
  </style>
</head>
<body>
  <div class="scroll-border">
    <div style="text-align:center; border-bottom: 2px solid #1C1D1F; padding-bottom: 20px;">
      <div style="letter-spacing:3px; font-size:13px; color:#2F6B57; font-weight:bold;">TÀNG KINH CÁC — CHỨNG NHẬN CHINH PHỤC ĐỈNH NÚI & SỔ GHI CHÉP LỊCH SỬ</div>
      <h1 style="font-size:26px; margin: 10px 0;">${scroll.title}</h1>
      <p style="font-style:italic; font-size:17px;">“${scroll.futureSelfVow || scroll.mottoText}”</p>
      <div class="seal-box">
        CHINH PHỤC ĐỈNH NÚI<br/>
        ${scroll.totalDaysSpent} NGÀY NỖ LỰC &bull; ${scroll.totalPomodoroHours} GIỜ TẬP TRUNG<br/>
        ẤN CHỨNG: ${scroll.sealHash}
      </div>
    </div>

    <div style="margin-top: 24px;">
      <h2 class="cinnabar">I. Tổng Kết Hành Trình Nỗ Lực</h2>
      <p><strong>Thời điểm Chạm Đỉnh & Đóng Dấu:</strong> ${sealedDateStr}</p>
      <p><strong>Tổng số ngày bền bỉ:</strong> ${scroll.totalDaysSpent} ngày</p>
      <p><strong>Tổng số giờ tập trung Pomodoro:</strong> ${scroll.totalPomodoroHours} giờ</p>
      <p><strong>Tổng số nhiệm vụ Công Phá đã hoàn thành:</strong> ${allStrikes.length} nhiệm vụ</p>
      <p><strong>Tổng số ảnh bằng chứng (Live PoW):</strong> ${timelinePhotos.length} bức ảnh</p>
      ${milestonesHtml ? `<ul>${milestonesHtml}</ul>` : ''}
    </div>

    <div style="margin-top: 24px;">
      <h2 class="cinnabar">II. Hành Trình Ảnh Bằng Chứng Theo Mốc Thời Gian (${timelinePhotos.length} ảnh)</h2>
      ${photosHtml || '<p>Chưa có ảnh đính kèm.</p>'}
    </div>

    <div style="margin-top: 24px;">
      <h2 class="cinnabar">III. Nhật Ký Toàn Bộ Các Nhiệm Vụ Công Phá Đã Thực Hiện (${allStrikes.length} việc)</h2>
      ${strikesHtml || '<p>Đã hoàn tất mục tiêu.</p>'}
    </div>

    <div style="margin-top: 24px;">
      <h2 class="cinnabar">IV. Nhật Trình Tự Vấn Trên Đỉnh Núi (${journals.length} bản ghi)</h2>
      ${journalsHtml || '<p>Đã hoàn tất nhật trình tu luyện.</p>'}
    </div>

    <div style="margin-top: 36px; text-align:right;">
      <p style="font-style:italic;">“Tương lai nhìn lại là lời cảm ơn vì đã nỗ lực hết mình, không phải hai chữ Giá như...”</p>
      <div class="seal-box">
        ĐẠI SỰ VIÊN THÀNH<br/>
        DẤU MỘC CHU SA<br/>
        ${sealedDateStr}
      </div>
    </div>
  </div>
</body>
</html>`;

    const safeFileName = `${scroll.title.replace(/[^a-zA-Z0-9À-ỹ_-]/g, '-')}.pdf`;
    const res = await desktopBridge.exportScrollToPdf(htmlContent, safeFileName);
    if (res.ok) {
      setExportStatus(`Đã xuất Hồ Sơ Chứng Nhận PDF thành công: ${res.filePath || safeFileName}`);
      if (onExportedPdf && res.filePath) {
        onExportedPdf(scroll.id, res.filePath);
      }
    } else {
      setExportStatus('Đã hủy hoặc không thể xuất PDF.');
    }
  };

  return (
    <div className="zen-modal-backdrop">
      <div className={`ancient-scroll-modal ${shakeScreen ? 'screen-shake-haptic' : ''}`}>
        {/* Top Toolbar */}
        <div className="scroll-modal-topbar">
          <div className="scroll-topbar-left">
            <BookOpen size={20} color="#2F6B57" />
            <span>
              {isCeremonyMode
                ? 'NGHI THỨC CHẠM ĐỈNH — ĐÓNG DẤU LƯU VÀO TÀNG KINH CÁC'
                : `TÀNG KINH CÁC (SỔ GHI CHÉP LỊCH SỬ & CHỨNG NHẬN) — ${scroll.title}`}
            </span>
          </div>
          <div className="scroll-topbar-right">
            {isStamped && (
              <button type="button" className="zen-btn zen-btn-outline" onClick={handleExportPdf}>
                <Download size={15} />
                <span>Xuất PDF Chứng Nhận & Chia Sẻ Hành Trình</span>
              </button>
            )}
            {onClose && !isCeremonyMode && (
              <button type="button" className="zen-btn zen-btn-ghost" onClick={onClose}>
                <X size={18} />
                <span>Đóng quyển</span>
              </button>
            )}
          </div>
        </div>

        {exportStatus && <div className="scroll-export-banner">{exportStatus}</div>}

        {/* Quick Page Tabs inside the Book */}
        <div className="xuan-book-page-tabs">
          <button
            type="button"
            className={`xuan-tab-btn ${currentPage === 0 ? 'active' : ''}`}
            onClick={() => setCurrentPage(0)}
          >
            <Award size={14} /> 1. Giấy Chứng Nhận & Ấn Chứng
          </button>
          <button
            type="button"
            className={`xuan-tab-btn ${currentPage === 1 ? 'active' : ''}`}
            onClick={() => setCurrentPage(1)}
          >
            <Camera size={14} /> 2. Hành Trình Ảnh Theo Thời Gian ({timelinePhotos.length})
          </button>
          <button
            type="button"
            className={`xuan-tab-btn ${currentPage === 2 ? 'active' : ''}`}
            onClick={() => setCurrentPage(2)}
          >
            <Swords size={14} /> 3. Lịch Sử Toàn Bộ Todo Công Phá ({allStrikes.length})
          </button>
          <button
            type="button"
            className={`xuan-tab-btn ${currentPage === 3 ? 'active' : ''}`}
            onClick={() => setCurrentPage(3)}
          >
            <FileText size={14} /> 4. Nhật Ký Tự Vấn ({journals.length})
          </button>
        </div>

        {/* Ancient Thread-Bound Book Container */}
        <div className="xuan-paper-book">
          <div className="thread-bound-spine">
            <div className="spine-stitch" />
            <div className="spine-stitch" />
            <div className="spine-stitch" />
            <div className="spine-stitch" />
            <div className="spine-stitch" />
          </div>

          <div className="xuan-page-body">
            {/* PAGE 0: CERTIFICATE & OVERVIEW */}
            {currentPage === 0 && (
              <div className="xuan-page-content page-fade-in">
                <div className="xuan-page-subtitle">
                  TRANG I — GIẤY CHỨNG NHẬN CHINH PHỤC ĐỈNH NÚI & TỔNG KẾT NỖ LỰC
                </div>
                <h1 className="xuan-scroll-title">⛰️ {scroll.title}</h1>

                <div className="xuan-motto-quote">
                  “{scroll.futureSelfVow || scroll.mottoText}”
                </div>

                <div className="xuan-stats-grid">
                  <div className="xuan-stat-box">
                    <span className="xuan-stat-label">Tổng Ngày Nỗ Lực</span>
                    <strong className="xuan-stat-value">{scroll.totalDaysSpent} Ngày</strong>
                    <small>Kiên trì bền bỉ không bỏ cuộc</small>
                  </div>
                  <div className="xuan-stat-box">
                    <span className="xuan-stat-label">Tổng Giờ Pomodoro</span>
                    <strong className="xuan-stat-value">{scroll.totalPomodoroHours} Giờ</strong>
                    <small>Tập trung sâu trên từng Todo</small>
                  </div>
                  <div className="xuan-stat-box">
                    <span className="xuan-stat-label">Nhiệm Vụ Đã Công Phá</span>
                    <strong className="xuan-stat-value">{allStrikes.length} Việc</strong>
                    <small>Kèm {timelinePhotos.length} ảnh bằng chứng PoW</small>
                  </div>
                  <div className="xuan-stat-box">
                    <span className="xuan-stat-label">Ngày Chạm Đỉnh</span>
                    <strong className="xuan-stat-value" style={{ fontSize: 16 }}>
                      {new Date(scroll.sealedAt).toLocaleDateString('vi-VN')}
                    </strong>
                    <small>Mã Ấn: {scroll.sealHash}</small>
                  </div>
                </div>

                {primaryGoal?.milestones && primaryGoal.milestones.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <strong style={{ color: '#2F6B57', fontSize: 13 }}>
                      CHECKLIST MỤC TIÊU ĐÃ HOÀN THÀNH:
                    </strong>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 8,
                        marginTop: 6,
                      }}
                    >
                      {primaryGoal.milestones.map((m, idx) => (
                        <div
                          key={m.id}
                          style={{
                            padding: '6px 10px',
                            background: '#EAE5D9',
                            border: '1px solid #bfb8a8',
                            fontSize: 13,
                          }}
                        >
                          ✓ <strong>Mục {idx + 1}:</strong> {m.title}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="xuan-seal-showcase">
                  {isStamped ? (
                    <>
                      <WoodblockSealSvg
                        topText="CHINH PHỤC"
                        middleText={`${scroll.totalDaysSpent} NGÀY`}
                        bottomText="ĐỈNH NÚI"
                        subText={new Date(scroll.sealedAt).toLocaleDateString('vi-VN')}
                        size={130}
                        animateStamp={true}
                      />
                      <div className="xuan-seal-caption">
                        <strong>CHỨNG NHẬN CHINH PHỤC ĐỈNH NÚI — DẤU MỘC CHU SA</strong>
                        <p>
                          “Nhìn lại chặng đường này, không có một giây phút nào bị lãng phí. Tương
                          lai của bạn ngày hôm nay xin cúi đầu cảm ơn những giọt mồ hôi bạn đã đổ
                          xuống trên ngọn núi này.”
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="xuan-unsealed-prompt">
                      <p>
                        Bạn đã hoàn thành mục tiêu Đỉnh Núi này! Hãy thực hiện nghi thức đóng Dấu
                        Mộc Đỏ Chu Sa để lưu chứng nhận và toàn bộ lịch sử nỗ lực vào Tàng Kinh Các.
                      </p>
                      <button
                        type="button"
                        className="zen-btn zen-btn-seal btn-large-ceremony"
                        onClick={handlePerformSealStamp}
                      >
                        <Stamp size={20} />
                        <span>ĐÓNG DẤU MỘC ĐỎ CHU SA (KHẮC ẤN CHINH PHỤC)</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PAGE 1: CHRONOLOGICAL PHOTO PROOF TIMELINE */}
            {currentPage === 1 && (
              <div className="xuan-page-content page-fade-in">
                <div className="xuan-page-subtitle">
                  TRANG II — HÀNH TRÌNH BẰNG CHỨNG HÌNH ẢNH THEO MỐC THỜI GIAN ({timelinePhotos.length}{' '}
                  ẢNH)
                </div>
                <h2 className="xuan-section-heading">
                  Dòng Thời Gian Nỗ Lực Thực Tế (Visual Proof of Work Timeline)
                </h2>
                <p style={{ fontSize: 13.5, color: '#4a4a4a', marginBottom: 12 }}>
                  Mỗi bức ảnh là một cột mốc thời gian chứng minh bạn đã thực sự ngồi vào bàn và
                  đổ mồ hôi vì mục tiêu này. Bấm vào bất kỳ ảnh nào để phóng to.
                </p>

                {timelinePhotos.length === 0 ? (
                  <p className="xuan-empty-note">
                    Chưa có bức ảnh bằng chứng nào được đính kèm trong hành trình này.
                  </p>
                ) : (
                  <div className="xuan-timeline-photo-list">
                    {timelinePhotos.map((item, idx) => {
                      const timeStr = new Date(item.timestamp).toLocaleString('vi-VN');
                      return (
                        <div key={item.id} className="xuan-timeline-photo-row">
                          <div className="xuan-timeline-marker">
                            <span className="xuan-step-badge">Mốc #{idx + 1}</span>
                            <span className="xuan-step-date">{timeStr}</span>
                          </div>
                          <div className="xuan-timeline-card">
                            <div
                              className="xuan-timeline-img-wrap"
                              onClick={() =>
                                setZoomedPhoto({
                                  uri: resolveProofImageUrl(item.uri),
                                  title: item.taskTitle,
                                  caption: item.caption,
                                  timeStr,
                                })
                              }
                            >
                              <img src={resolveProofImageUrl(item.uri)} alt={item.taskTitle} />
                              <span className="xuan-zoom-hint">🔍 Bấm để phóng to</span>
                            </div>
                            <div className="xuan-timeline-info">
                              <div className="xuan-timeline-task">
                                <strong>Nhiệm vụ Công Phá:</strong> {item.taskTitle}
                              </div>
                              <div className="xuan-timeline-caption">“{item.caption}”</div>
                              <div className="xuan-timeline-meta">
                                <span>
                                  <Clock size={12} /> Ngày thực hiện: <strong>{item.date}</strong>
                                </span>
                                <span>
                                  <Flame size={12} /> Tập trung Pomodoro:{' '}
                                  <strong>{item.pomodoroMins} phút</strong>
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* PAGE 2: FULL HISTORY OF ALL COMPLETED TODOS */}
            {currentPage === 2 && (
              <div className="xuan-page-content page-fade-in">
                <div className="xuan-page-subtitle">
                  TRANG III — SỔ GHI CHÉP TOÀN BỘ NHIỆM VỤ CÔNG PHÁ ({allStrikes.length} VIỆC ĐÃ
                  LÀM)
                </div>
                <h2 className="xuan-section-heading">
                  Lịch Sử Chi Tiết Từng Việc Đã Làm Để Chinh Phục Đỉnh Núi
                </h2>
                <div className="xuan-goals-list">
                  {allStrikes.length === 0 ? (
                    <p>Chưa có nhiệm vụ Công Phá nào được ghi nhận.</p>
                  ) : (
                    allStrikes.map((s, idx) => (
                      <div key={s.id} className="xuan-goal-item">
                        <div className="xuan-goal-header">
                          <strong>
                            #{allStrikes.length - idx} [{s.date}] — {s.title}
                          </strong>
                          <span className="xuan-stamp-mini">
                            {s.status === 'COMPLETED' ? 'ĐÃ HOÀN THÀNH' : s.status} &bull;{' '}
                            {s.completedPomodoroMins || 0} phút Pomodoro thực tế
                          </span>
                        </div>
                        {s.notes && (
                          <p style={{ fontSize: 13, color: '#333', marginTop: 4 }}>
                            Ghi chú tập trung: {s.notes}
                          </p>
                        )}
                        <div className="xuan-goal-metric" style={{ marginTop: 6, fontSize: 12 }}>
                          {s.completedAt && (
                            <span>
                              Hoàn thành lúc: {new Date(s.completedAt).toLocaleString('vi-VN')}
                            </span>
                          )}
                          {s.proofPhotoUri && (
                            <span style={{ marginLeft: 14, color: '#2F6B57', fontWeight: 700 }}>
                              📷 Có đính kèm ảnh bằng chứng
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* PAGE 3: REFLECTION JOURNALS & FINAL SEAL */}
            {currentPage === 3 && (
              <div className="xuan-page-content page-fade-in">
                <div className="xuan-page-subtitle">
                  TRANG IV — NHẬT TRÌNH TỰ VẤN & ẤN CHỨNG KHÉP QUYỂN
                </div>
                <h2 className="xuan-section-heading">
                  Những Đêm Tự Vấn & Ghi Chép Tâm Huyết Trên Đỉnh Núi
                </h2>
                <div className="xuan-journals-scroll">
                  {journals.length === 0 ? (
                    <p>Chưa có bản ghi Tự Vấn trong hành trình này.</p>
                  ) : (
                    journals.map((j) => (
                      <div key={j.id} className="xuan-journal-entry">
                        <div className="xuan-journal-meta">
                          <strong>Ngày Tự Vấn: {j.date}</strong>
                          <span>
                            {j.validWordCount} từ &bull; Độ tập trung: {j.focusRating}/5 ⭐
                          </span>
                        </div>
                        <p className="xuan-journal-body">{j.content}</p>
                        {j.repentanceNote && (
                          <div className="xuan-journal-repentance">
                            Bài học / Cam kết: {j.repentanceNote}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="xuan-seal-showcase" style={{ marginTop: 18 }}>
                  <WoodblockSealSvg
                    topText="VIÊN THÀNH"
                    middleText="TÀNG KINH"
                    bottomText="CHU SA ẤN"
                    subText={scroll.sealHash.slice(0, 14)}
                    size={116}
                    animateStamp={isStamped}
                  />
                  <div className="xuan-seal-caption">
                    <strong>DẤU MỘC ĐỎ CHU SA — LƯU TRỮ VĨNH VIỄN TRONG TÀNG KINH CÁC</strong>
                    <p>
                      “Tương lai nhìn lại sẽ là cảm ơn vì đã nỗ lực, chứ không phải là Giá như...”
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Page Navigation Footer */}
            <div className="xuan-page-footer">
              <button
                type="button"
                className="xuan-nav-btn"
                disabled={currentPage === 0}
                onClick={() => {
                  soundEngine.playWoodenFish(0.4);
                  setCurrentPage((p) => Math.max(0, p - 1));
                }}
              >
                <ChevronLeft size={18} />
                <span>Trang trước</span>
              </button>

              <span className="xuan-page-indicator">
                Trang {currentPage + 1} / {totalPages} — Sổ Ghi Chép Lịch Sử & Chứng Nhận Đỉnh Núi
              </span>

              <button
                type="button"
                className="xuan-nav-btn"
                disabled={currentPage === totalPages - 1}
                onClick={() => {
                  soundEngine.playWoodenFish(0.4);
                  setCurrentPage((p) => Math.min(totalPages - 1, p + 1));
                }}
              >
                <span>Trang tiếp</span>
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Ceremony Completion Footer */}
        {isCeremonyMode && (
          <div className="ceremony-bottom-bar">
            {!isStamped ? (
              <button
                type="button"
                className="zen-btn zen-btn-seal"
                onClick={handlePerformSealStamp}
              >
                <Award size={18} />
                <span>Đóng Dấu Mộc Đỏ Chu Sa Để Khóa Sổ & Cấp Chứng Nhận</span>
              </button>
            ) : (
              <button type="button" className="zen-btn zen-btn-seal" onClick={onFinishCeremony}>
                <CheckCircle2 size={18} />
                <span>Hoàn Tất Nghi Thức Chinh Phục & Lưu Vào Tàng Kinh Các</span>
              </button>
            )}
          </div>
        )}

        {/* Photo Lightbox Zoom Modal */}
        {zoomedPhoto && (
          <div
            className="zen-modal-backdrop"
            style={{ zIndex: 3500 }}
            onClick={() => setZoomedPhoto(null)}
          >
            <div
              className="zen-modal-card"
              style={{ maxWidth: 960, textAlign: 'center' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <div style={{ textAlign: 'left' }}>
                  <span className="zen-tag-red">{zoomedPhoto.timeStr}</span>
                  <h3 style={{ marginTop: 4 }}>{zoomedPhoto.title}</h3>
                  <p className="zen-muted-text">“{zoomedPhoto.caption}”</p>
                </div>
                <button
                  type="button"
                  className="zen-btn zen-btn-outline"
                  onClick={() => setZoomedPhoto(null)}
                >
                  <X size={16} /> Đóng ảnh
                </button>
              </div>
              <img
                src={resolveProofImageUrl(zoomedPhoto.uri)}
                alt={zoomedPhoto.title}
                style={{
                  maxWidth: '100%',
                  maxHeight: '72vh',
                  objectFit: 'contain',
                  border: '2px solid #2F6B57',
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
