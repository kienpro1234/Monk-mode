import React, { useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  Award,
  CheckCircle2,
  X,
  Stamp,
} from 'lucide-react';
import { SacredScrollEntity, SacredScrollSnapshot } from '../types/models';
import { WoodblockSealSvg } from './WoodblockSealSvg';
import { soundEngine } from '../utils/soundEngine';
import { desktopBridge } from '../services/desktopBridge';

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

  let snapshot: SacredScrollSnapshot | null = null;
  try {
    snapshot = JSON.parse(scroll.snapshotJson);
  } catch {
    snapshot = null;
  }

  const goals = snapshot?.goals || [];
  const strikesWithProof = (snapshot?.strikes || []).filter((s) => s.proofPhotoUri);
  const journals = snapshot?.journals || [];
  const totalPages = 4;

  const handlePerformSealStamp = () => {
    soundEngine.playWoodblockStampSound();
    setShakeScreen(true);
    setIsStamped(true);
    setTimeout(() => setShakeScreen(false), 650);
  };

  const handleExportPdf = async () => {
    setExportStatus('Đang kết xuất Bí Kíp Cổ Thư sang định dạng PDF...');
    const sealedDateStr = new Date(scroll.sealedAt).toLocaleString('vi-VN');

    const goalsHtml = goals
      .map(
        (g) => `
      <div style="border-bottom:1px dashed #1C1D1F; padding: 10px 0;">
        <strong>${g.title}</strong> — Đạt ${g.currentMetric}/${g.targetMetric} ${g.unit} (${g.progressPct}%)
        <div style="font-size:12px; color:#555;">${g.description || ''}</div>
      </div>`
      )
      .join('');

    const journalsHtml = journals
      .map(
        (j) => `
      <div style="margin-bottom: 18px; padding: 14px; border: 1px solid #C5BFB0; background: #EFECE2;">
        <div style="font-weight:bold; color:#9E2A2B; margin-bottom:6px;">
          Đêm Tự Vấn: ${j.date} | Số từ hợp lệ: ${j.validWordCount} | Mật độ từ vựng: ${j.lexicalDiversityScore}
        </div>
        <p style="line-height:1.65; margin:0; text-align:justify;">${j.content}</p>
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
      padding: 40px 54px;
      margin: 0;
    }
    .scroll-border {
      border: 4px double #1C1D1F;
      padding: 36px;
      position: relative;
      min-height: 920px;
    }
    .seal-box {
      border: 4px solid #9E2A2B;
      color: #9E2A2B;
      display: inline-block;
      padding: 10px 18px;
      font-weight: bold;
      text-align: center;
      transform: rotate(-4deg);
      margin-top: 16px;
    }
    h1, h2, h3 { color: #1C1D1F; }
    .cinnabar { color: #9E2A2B; }
  </style>
</head>
<body>
  <div class="scroll-border">
    <div style="text-align:center; border-bottom: 2px solid #1C1D1F; padding-bottom: 20px;">
      <div style="letter-spacing:4px; font-size:13px; color:#9E2A2B; font-weight:bold;">TÀNG KINH CÁC — BÍ KÍP TU LUYỆN BẤT BIẾN</div>
      <h1 style="font-size:28px; margin: 10px 0;">${scroll.title}</h1>
      <p style="font-style:italic; font-size:18px;">“${scroll.mottoText}”</p>
      <div class="seal-box">
        LÊN NÚI ĐẮC ĐẠO<br/>
        ${scroll.totalDaysSpent} NGÀY KHỔ LUYỆN<br/>
        ẤN CHỨNG: ${scroll.sealHash}
      </div>
    </div>

    <div style="margin-top: 24px;">
      <h2 class="cinnabar">I. Tổng Kết Hành Trình Tu Luyện</h2>
      <p><strong>Thời điểm Đắc Đạo Xuống Núi:</strong> ${sealedDateStr}</p>
      <p><strong>Tổng số ngày khổ luyện:</strong> ${scroll.totalDaysSpent} ngày (Cam kết ban đầu: ${scroll.initialDaysCommitted} ngày)</p>
      <p><strong>Tổng số giờ thiền định Pomodoro:</strong> ${scroll.totalPomodoroHours} giờ</p>
      <p><strong>Số lần vấp ngã phải gia hạn ngày:</strong> ${scroll.violationCount} lần</p>
    </div>

    <div style="margin-top: 24px;">
      <h2 class="cinnabar">II. Các Đỉnh Núi Đã Chinh Phục (100%)</h2>
      ${goalsHtml}
    </div>

    <div style="margin-top: 24px;">
      <h2 class="cinnabar">III. Nhật Trình Tự Vấn Mỗi Đêm</h2>
      ${journalsHtml || '<p>Đã hoàn tất nhật trình tu luyện.</p>'}
    </div>

    <div style="margin-top: 36px; text-align:right;">
      <p style="font-style:italic;">“Phong sương đã vượt, đại sự viên thành. Dấu mộc đã đóng, cuốn bí kíp này là minh chứng cho đạo tâm bất động của bạn.”</p>
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
      setExportStatus(`Đã xuất Bí Kíp PDF thành công: ${res.filePath || safeFileName}`);
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
            <BookOpen size={20} color="#9E2A2B" />
            <span>
              {isCeremonyMode
                ? 'NGHI THỨC ĐẮC ĐẠO XUỐNG NÚI — ĐÓNG QUYỂN BÍ KÍP TU LUYỆN'
                : `TÀNG KINH CÁC (CHẾ ĐỘ BẤT BIẾN READ-ONLY) — ${scroll.title}`}
            </span>
          </div>
          <div className="scroll-topbar-right">
            {isStamped && (
              <button type="button" className="zen-btn zen-btn-outline" onClick={handleExportPdf}>
                <Download size={15} />
                <span>Xuất File PDF Cổ Thư</span>
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

        {/* Ancient Thread-Bound Book Container (Giấy Tuyên Cổ #F6F4EE + Chỉ Gáy Truyền Thống) */}
        <div className="xuan-paper-book">
          {/* Traditional Thread-Bound Spine on the left */}
          <div className="thread-bound-spine">
            <div className="spine-stitch" />
            <div className="spine-stitch" />
            <div className="spine-stitch" />
            <div className="spine-stitch" />
            <div className="spine-stitch" />
          </div>

          {/* Page Content Area */}
          <div className="xuan-page-body">
            {currentPage === 0 && (
              <div className="xuan-page-content page-fade-in">
                <div className="xuan-page-subtitle">
                  QUYỂN THƯỢNG — KHỞI NGUYÊN ĐẠO TÂM & ẤN CHỨNG MỞ QUYỂN
                </div>
                <h1 className="xuan-scroll-title">{scroll.title}</h1>

                <div className="xuan-motto-quote">“{scroll.mottoText}”</div>

                <div className="xuan-stats-grid">
                  <div className="xuan-stat-box">
                    <span className="xuan-stat-label">Tổng Số Ngày Khổ Luyện</span>
                    <strong className="xuan-stat-value">{scroll.totalDaysSpent} Ngày</strong>
                    <small>Cam kết ban đầu: {scroll.initialDaysCommitted} ngày</small>
                  </div>
                  <div className="xuan-stat-box">
                    <span className="xuan-stat-label">Tổng Giờ Thiền Định Pomodoro</span>
                    <strong className="xuan-stat-value">{scroll.totalPomodoroHours} Giờ</strong>
                    <small>Tập trung tuyệt đối 100%</small>
                  </div>
                  <div className="xuan-stat-box">
                    <span className="xuan-stat-label">Số Lần Vấp Ngã Gia Hạn</span>
                    <strong className="xuan-stat-value">{scroll.violationCount} Lần</strong>
                    <small>Vượt qua khảo nghiệm Luật Núi</small>
                  </div>
                  <div className="xuan-stat-box">
                    <span className="xuan-stat-label">Ngày Giờ Đắc Đạo Xuống Núi</span>
                    <strong className="xuan-stat-value" style={{ fontSize: 16 }}>
                      {new Date(scroll.sealedAt).toLocaleString('vi-VN')}
                    </strong>
                    <small>Mã Ấn: {scroll.sealHash}</small>
                  </div>
                </div>

                {/* First Page Red Woodblock Mastery Seal */}
                <div className="xuan-seal-showcase">
                  {isStamped ? (
                    <>
                      <WoodblockSealSvg
                        topText="LÊN NÚI"
                        middleText={`${scroll.totalDaysSpent} NGÀY`}
                        bottomText="ĐẮC ĐẠO"
                        subText={new Date(scroll.sealedAt).toLocaleDateString('vi-VN')}
                        size={136}
                        animateStamp={true}
                      />
                      <div className="xuan-seal-caption">
                        <strong>DẤU MỘC GỖ ĐỎ CHU SA (#9E2A2B) — TRANG ĐẦU</strong>
                        <p>
                          “Phong sương đã vượt, đại sự viên thành. Dấu mộc đã đóng, cuốn bí kíp này là minh chứng cho đạo tâm bất động của bạn.”
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="xuan-unsealed-prompt">
                      <p>
                        Bạn đã hoàn tất 100% thời gian cam kết và 100% mục tiêu Đỉnh Núi. Hãy thực hiện nghi thức đóng Dấu Mộc Đỏ Chu Sa lên trang đầu và trang cuối của cuốn Bí Kíp.
                      </p>
                      <button
                        type="button"
                        className="zen-btn zen-btn-seal btn-large-ceremony"
                        onClick={handlePerformSealStamp}
                      >
                        <Stamp size={20} />
                        <span>ĐÓNG DẤU MỘC ĐỎ CHU SA (KHẮC ẤN ĐẮC ĐẠO)</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentPage === 1 && (
              <div className="xuan-page-content page-fade-in">
                <div className="xuan-page-subtitle">
                  TRANG II — CÁC ĐỈNH NÚI ĐÃ CHINH PHỤC (100% KPI/OKR)
                </div>
                <h2 className="xuan-section-heading">Chiến Công Công Phá & Đỉnh Núi</h2>
                <div className="xuan-goals-list">
                  {goals.map((g, idx) => (
                    <div key={g.id} className="xuan-goal-item">
                      <div className="xuan-goal-header">
                        <strong>
                          Đỉnh Núi {idx + 1}: {g.title}
                        </strong>
                        <span className="xuan-stamp-mini">ĐẠT 100%</span>
                      </div>
                      <p>{g.description}</p>
                      <div className="xuan-goal-metric">
                        Chỉ số nghiệm thu: <strong>{g.currentMetric}</strong> / {g.targetMetric}{' '}
                        {g.unit} ({g.progressPct}%)
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentPage === 2 && (
              <div className="xuan-page-content page-fade-in">
                <div className="xuan-page-subtitle">
                  TRANG III — BỘ SƯU TẬP BẰNG CHỨNG XÁC THỰC (PROOF OF WORK)
                </div>
                <h2 className="xuan-section-heading">Minh Chứng Mồ Hôi & Công Sức</h2>
                {strikesWithProof.length === 0 ? (
                  <p className="xuan-empty-note">
                    Các nhiệm vụ Công Phá và Nghi Thức đã được nghiệm thu đầy đủ trong khóa tu luyện.
                  </p>
                ) : (
                  <div className="xuan-pow-gallery">
                    {strikesWithProof.map((s) => (
                      <div key={s.id} className="xuan-pow-card">
                        {s.proofPhotoUri && <img src={s.proofPhotoUri} alt={s.title} />}
                        <div className="xuan-pow-meta">
                          <strong>{s.title}</strong>
                          <span>
                            Ngày: {s.date} | Pomodoro: {s.completedPomodoroMins} phút | Trọng số: +{s.weightPct}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {currentPage === 3 && (
              <div className="xuan-page-content page-fade-in">
                <div className="xuan-page-subtitle">
                  QUYỂN HẠ — NHẬT KÝ TỰ VẤN MỖI ĐÊM & ẤN CHỨNG KHÉP QUYỂN
                </div>
                <h2 className="xuan-section-heading">Tự Vấn Lương Tri & Đạo Tâm</h2>
                <div className="xuan-journals-scroll">
                  {journals.length === 0 ? (
                    <p>Chưa có bản ghi Tự Vấn trong kỳ này.</p>
                  ) : (
                    journals.map((j) => (
                      <div key={j.id} className="xuan-journal-entry">
                        <div className="xuan-journal-meta">
                          <strong>Đêm Tự Vấn: {j.date}</strong>
                          <span>
                            {j.validWordCount} từ hợp lệ | Lexical Diversity: {j.lexicalDiversityScore}
                          </span>
                        </div>
                        <p className="xuan-journal-body">{j.content}</p>
                        {j.repentanceNote && (
                          <div className="xuan-journal-repentance">
                            Ghi chú giới luật: {j.repentanceNote}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Last Page Red Woodblock Mastery Seal */}
                <div className="xuan-seal-showcase" style={{ marginTop: 18 }}>
                  <WoodblockSealSvg
                    topText="VIÊN THÀNH"
                    middleText="BÍ KÍP"
                    bottomText="CHU SA ẤN"
                    subText={scroll.sealHash.slice(0, 14)}
                    size={126}
                    animateStamp={isStamped}
                  />
                  <div className="xuan-seal-caption">
                    <strong>DẤU MỘC ĐỎ CHU SA — TRANG CUỐI (KHÓA BẤT BIẾN READ-ONLY)</strong>
                    <p>
                      “Phong sương đã vượt, đại sự viên thành. Dấu mộc đã đóng, cuốn bí kíp này là minh chứng cho đạo tâm bất động của bạn.”
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
                <span>Lật trang trước</span>
              </button>

              <span className="xuan-page-indicator">
                Trang {currentPage + 1} / {totalPages} — Giấy Tuyên Cổ (#F6F4EE)
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
                <span>Lật trang tiếp</span>
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
                <span>Đóng Dấu Mộc Đỏ Chu Sa Để Khóa Sổ Bí Kíp</span>
              </button>
            ) : (
              <button
                type="button"
                className="zen-btn zen-btn-seal"
                onClick={onFinishCeremony}
              >
                <CheckCircle2 size={18} />
                <span>Hoàn Tất Nghi Thức Xuống Núi & Cất Vào Tàng Kinh Các</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
