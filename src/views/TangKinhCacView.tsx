import React, { useState } from 'react';
import { BookOpen, Flame, ScrollText } from 'lucide-react';
import { MonkDatabaseSchema, SacredScrollEntity } from '../types/models';
import { WoodblockSealSvg } from '../components/WoodblockSealSvg';
import { DisciplineHeatmap } from './DisciplineHeatmap';
import { TabPurposeBanner } from '../components/TabPurposeBanner';

type TangKinhCacSubTab = 'SCROLLS' | 'HEATMAP';

interface TangKinhCacViewProps {
  db: MonkDatabaseSchema;
  todayStr: string;
  sacredScrolls: SacredScrollEntity[];
  onOpenScroll: (scroll: SacredScrollEntity) => void;
}

export const TangKinhCacView: React.FC<TangKinhCacViewProps> = ({
  db,
  todayStr,
  sacredScrolls,
  onOpenScroll,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<TangKinhCacSubTab>('SCROLLS');

  return (
    <section className="module-block">
      <div className="zen-card">
        <div className="section-header-row" style={{ marginBottom: 10 }}>
          <div>
            <span className="zen-tag-red">
              TÀNG KINH CÁC — LỊCH SỬ THÀNH TỰU &amp; BẢN ĐỒ KỶ LUẬT
            </span>
            <h2 className="section-title" style={{ marginTop: 6 }}>
              📜 Tàng Kinh Các — Nơi Lưu Giữ Mọi Nỗ Lực &amp; Chứng Nhận Chinh Phục
            </h2>
          </div>
        </div>

        <TabPurposeBanner
          purpose="Nơi lưu trữ vĩnh viễn các Cuộn Chứng Nhận Chu Sa (Todo, giờ Pomodoro, Tự Vấn & ảnh bằng chứng) của các Đỉnh Núi đã hoàn thành, cùng Bản Đồ Nhiệt Kỷ Luật suốt năm."
          steps={[
            'Xem kệ Cuộn Chứng Nhận Đỉnh Núi đã chinh phục',
            'Xuất PDF chứng nhận lưu kỷ niệm',
            'Theo dõi Bản Đồ Nhiệt kỷ luật hằng ngày',
          ]}
        />

        {/* 2 SUB-TABS */}
        <div className="laws-subtabs-bar" role="tablist" aria-label="Phân mục Tàng Kinh Các">
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === 'SCROLLS'}
            className={`laws-subtab-btn ${activeSubTab === 'SCROLLS' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('SCROLLS')}
          >
            <div className="laws-subtab-top">
              <ScrollText size={16} />
              <span className="laws-subtab-name">1. Kệ Chứng Nhận Đỉnh Núi</span>
            </div>
            <span className="laws-subtab-pill pill-ok">
              {sacredScrolls.length} cuộn đã đóng ấn
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === 'HEATMAP'}
            className={`laws-subtab-btn ${activeSubTab === 'HEATMAP' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('HEATMAP')}
          >
            <div className="laws-subtab-top">
              <Flame size={16} />
              <span className="laws-subtab-name">2. Bản Đồ Nhiệt Kỷ Luật (Heatmap)</span>
            </div>
            <span className="laws-subtab-pill pill-gold">
              Streak hiện tại: {db.session.currentStreak} ngày
            </span>
          </button>
        </div>

        {activeSubTab === 'SCROLLS' && (
          <div className="laws-tabpanel page-fade-in">
            {sacredScrolls.length === 0 ? (
              <div className="empty-state-box" style={{ padding: '42px 24px', textAlign: 'center' }}>
                <ScrollText size={44} color="#A8D8C6" style={{ margin: '0 auto 12px' }} />
                <h4 style={{ fontSize: 18, marginBottom: 6, color: '#F4F1EA' }}>
                  Kệ Sách Tàng Kinh Các Đang Chờ Đỉnh Núi Đầu Tiên Của Bạn
                </h4>
                <p className="zen-muted-text" style={{ maxWidth: 580, margin: '0 auto' }}>
                  Khi bạn hoàn thành một Đỉnh Núi và bấm nút{' '}
                  <strong>“Đóng Dấu Chinh Phục Đỉnh Núi”</strong>, toàn bộ lịch sử Todo, giờ Pomodoro,
                  Tự Vấn và ảnh bằng chứng sẽ được đóng ấn lưu tại đây.
                </p>
              </div>
            ) : (
              <div className="sacred-scrolls-shelf">
                {sacredScrolls.map((scroll) => (
                  <div
                    key={scroll.id}
                    className="ancient-scroll-shelf-card"
                    onClick={() => onOpenScroll(scroll)}
                  >
                    <div className="shelf-card-spine" />
                    <div className="shelf-card-body">
                      <div className="shelf-card-top">
                        <div>
                          <span className="shelf-scroll-tag">
                            CHỨNG NHẬN CHINH PHỤC ĐỈNH NÚI — BẤM ĐỂ MỞ XEM LỊCH SỬ &amp; ẢNH
                          </span>
                          <h3>{scroll.title}</h3>
                          <p className="shelf-motto">“{scroll.futureSelfVow || scroll.mottoText}”</p>
                        </div>
                        <WoodblockSealSvg
                          topText="CHINH PHỤC"
                          middleText={`${scroll.totalDaysSpent} NGÀY`}
                          bottomText="CHU SA ẤN"
                          size={86}
                        />
                      </div>

                      <div className="shelf-metrics-row">
                        <span>
                          Nỗ lực: <strong>{scroll.totalDaysSpent} ngày</strong>
                        </span>
                        <span>
                          Tập trung Pomodoro: <strong>{scroll.totalPomodoroHours} giờ</strong>
                        </span>
                        {scroll.totalCompletedTodos !== undefined && (
                          <span>
                            Đã công phá: <strong>{scroll.totalCompletedTodos} Todo</strong>
                          </span>
                        )}
                        {scroll.totalProofPhotos !== undefined && (
                          <span>
                            Ảnh bằng chứng: <strong>{scroll.totalProofPhotos} ảnh</strong>
                          </span>
                        )}
                        <span>
                          Ngày đóng dấu:{' '}
                          <strong>{new Date(scroll.sealedAt).toLocaleDateString('vi-VN')}</strong>
                        </span>
                      </div>

                      <div className="shelf-card-footer">
                        <span className="seal-hash-code">ẤN CHỨNG: {scroll.sealHash}</span>
                        <button type="button" className="zen-btn zen-btn-seal">
                          <BookOpen size={15} />
                          <span>Mở Xem Hành Trình Ảnh &amp; Xuất Chứng Nhận PDF</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSubTab === 'HEATMAP' && (
          <div className="laws-tabpanel page-fade-in">
            <DisciplineHeatmap db={db} todayStr={todayStr} />
          </div>
        )}
      </div>
    </section>
  );
};
