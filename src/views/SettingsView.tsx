import React, { useMemo, useRef, useState } from 'react';
import {
  Bot,
  Calendar,
  Camera,
  Check,
  CheckSquare,
  Clock,
  Coffee,
  Download,
  Flame,
  Image as ImageIcon,
  Lightbulb,
  Power,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { MonkDatabaseSchema, SIDE_QUEST_GOAL_ID } from '../types/models';
import {
  AutoStartStatusInfo,
  DaemonStatusInfo,
  desktopBridge,
} from '../services/desktopBridge';
import { createDefaultOptimizationNotes } from '../services/defaultData';
import { LawEvaluationResult, evaluatePendingDays } from '../services/mountainLaws';
import { TabPurposeBanner } from '../components/TabPurposeBanner';

type SettingsSubTab = 'DAEMON_MOTTO' | 'CLEAR_DATA' | 'BACKUP_RESET';

interface SettingsViewProps {
  db: MonkDatabaseSchema;
  todayStr: string;
  daemonStatus: DaemonStatusInfo | null;
  autoStartStatus: AutoStartStatusInfo | null;
  confirmResetMode: 'NONE' | 'KEEP_RITUAL_FRAMES' | 'TOTAL_WIPE';
  globalMottoDraft: string;
  todayTaskModsCount: number;
  maxDailyTaskMods: number;
  onSetConfirmResetMode: (mode: 'NONE' | 'KEEP_RITUAL_FRAMES' | 'TOTAL_WIPE') => void;
  onChangeGlobalMottoDraft: (val: string) => void;
  onPersistDb: (updater: (prev: MonkDatabaseSchema) => MonkDatabaseSchema) => void;
  onReplaceDb: (next: MonkDatabaseSchema) => void;
  onSetAutoStartStatus: (status: AutoStartStatusInfo) => void;
  onAnnounceLawVerdict: (res: LawEvaluationResult) => void;
  onResetSelectedStateAfterWipe: (fresh: MonkDatabaseSchema) => void;
  onPlayTempleBell: (vol?: number) => void;
  onShowMessage: (title: string, msg: string, type?: 'danger' | 'info' | 'seal') => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  db,
  todayStr,
  daemonStatus,
  autoStartStatus,
  confirmResetMode,
  globalMottoDraft,
  todayTaskModsCount,
  maxDailyTaskMods,
  onSetConfirmResetMode,
  onChangeGlobalMottoDraft,
  onPersistDb,
  onReplaceDb,
  onSetAutoStartStatus,
  onAnnounceLawVerdict,
  onResetSelectedStateAfterWipe,
  onPlayTempleBell,
  onShowMessage,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>('DAEMON_MOTTO');
  const [includeApiKeysInBackup, setIncludeApiKeysInBackup] = useState(false);
  const [isCleaningProofs, setIsCleaningProofs] = useState(false);
  const [isExportingPortable, setIsExportingPortable] = useState(false);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  const accumulatedStats = useMemo(() => {
    const mountainStrikes = db.dailyStrikes.filter((s) => s.goalId !== SIDE_QUEST_GOAL_ID);
    const sideQuests = db.dailyStrikes.filter((s) => s.goalId === SIDE_QUEST_GOAL_ID);
    const totalPomoMins = mountainStrikes.reduce((sum, s) => sum + (s.completedPomodoroMins || 0), 0);
    let totalProofPhotos = 0;
    for (const s of db.dailyStrikes) {
      if (s.proofPhotosList && s.proofPhotosList.length > 0) totalProofPhotos += s.proofPhotosList.length;
      else if (s.proofPhotoUri) totalProofPhotos += 1;
    }
    let totalRitualCheckMarks = 0;
    for (const g of db.ritualGroups || []) {
      for (const it of g.items || []) {
        totalRitualCheckMarks += Object.keys(it.completedDates || {}).length;
      }
    }
    let completedMilestones = 0;
    for (const g of db.peakGoals) {
      completedMilestones += (g.milestones || []).filter((m) => m.isCompleted).length;
    }
    const restDaysCount = (db.session.restDays || []).length;
    const totalOptApplied = (db.optimizationNotes || []).reduce((s, n) => s + (n.appliedCount || 0), 0);
    return {
      mountainStrikesCount: mountainStrikes.length,
      sideQuestsCount: sideQuests.length,
      totalPomoMins,
      totalProofPhotos,
      totalRitualCheckMarks,
      completedMilestones,
      restDaysCount,
      totalOptApplied,
    };
  }, [db]);

  return (
    <section className="module-block">
      <div className="section-header-row">
        <div style={{ flex: '1 1 100%' }}>
          <span className="zen-tag-red">TRUNG TÂM CÀI ĐẶT & QUẢN LÝ DỮ LIỆU CÁ NHÂN</span>
          <h2 className="section-title">⚙️ Cài Đặt Hệ Thống & Xóa Dữ Liệu (Reset Data)</h2>
          <TabPurposeBanner
            purpose="Cấu hình chạy nền Windows, đổi câu Tâm Niệm Sống, dọn dẹp dữ liệu tích lũy (Heatmap, Pomodoro, ảnh PoW...) và sao lưu file JSON."
            steps={[
              'Kiểm tra Daemon 24/7 & Auto-Start',
              'Chọn mục cần Reset / Xóa ở tab Dọn Dữ Liệu',
              'Xuất file .json định kỳ để dự phòng',
            ]}
          />
        </div>
      </div>

      {/* Sub-tabs Bar */}
      <div className="laws-subtabs-bar" role="tablist" style={{ marginBottom: 18 }}>
        <button
          type="button"
          role="tab"
          aria-selected={activeSubTab === 'DAEMON_MOTTO'}
          className={`laws-subtab-btn ${activeSubTab === 'DAEMON_MOTTO' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('DAEMON_MOTTO')}
        >
          <div className="laws-subtab-top">
            <Power size={16} />
            <span className="laws-subtab-name">Chạy Nền &amp; Tâm Niệm</span>
          </div>
          <span className={`laws-subtab-pill ${daemonStatus?.ok ? 'pill-ok' : 'pill-neutral'}`}>
            {daemonStatus?.ok ? 'Daemon Online' : 'Chưa kết nối'}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSubTab === 'CLEAR_DATA'}
          className={`laws-subtab-btn ${activeSubTab === 'CLEAR_DATA' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('CLEAR_DATA')}
        >
          <div className="laws-subtab-top">
            <Trash2 size={16} />
            <span className="laws-subtab-name">Dọn Dữ Liệu &amp; Reset Heatmap</span>
          </div>
          <span className="laws-subtab-pill pill-gold">
            {accumulatedStats.totalPomoMins}p • {db.dailyStrikes.length} todo
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSubTab === 'BACKUP_RESET'}
          className={`laws-subtab-btn ${activeSubTab === 'BACKUP_RESET' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('BACKUP_RESET')}
        >
          <div className="laws-subtab-top">
            <Download size={16} />
            <span className="laws-subtab-name">Sao Lưu JSON &amp; Reset Toàn Bộ</span>
          </div>
          <span className="laws-subtab-pill pill-neutral">Backup / Wipe</span>
        </button>
      </div>

      <div key={activeSubTab} className="settings-grid-layout page-fade-in">
        {activeSubTab === 'DAEMON_MOTTO' && (
        /* CARD 0: CHẠY NỀN 24/7 & AUTO START */
        <div className="zen-card settings-daemon-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
              marginBottom: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Power size={22} color="#5BAE93" />
              <h3 className="zen-subcard-title" style={{ margin: 0 }}>
                0. Chạy Nền 24/7 & Tự Khởi Động Cùng Windows
              </h3>
            </div>
            <span className={`daemon-live-pill ${daemonStatus?.ok ? 'online' : 'offline'}`}>
              {daemonStatus?.ok ? `ĐANG CHẠY NỀN (PID ${daemonStatus.pid})` : 'CHƯA KẾT NỐI DAEMON'}
            </span>
          </div>

          <p className="zen-muted-text" style={{ marginBottom: 14 }}>
            Khi bật máy, hệ thống tự động chạy ngầm ở khay <strong>System Tray</strong> (góc dưới bên
            phải thanh Taskbar Windows) và lưu dấu mốc hoạt động cuối cùng (<code>Heartbeat</code>
            ). Nếu bạn tắt máy trước giờ chốt ngày khi vẫn còn việc chưa xong, lần mở máy tiếp theo
            app sẽ đối soát mốc thời gian tắt máy với hạn chót để xét duyệt và truy thu vi phạm tự
            động.
          </p>

          <div className="daemon-stats-grid">
            <div className="daemon-stat-item">
              <span className="zen-muted-text">Lần ghi nhận gần nhất</span>
              <strong>
                {db.session.lastActiveAt
                  ? new Date(db.session.lastActiveAt).toLocaleString('vi-VN')
                  : 'Đang theo dõi'}
              </strong>
            </div>
            <div className="daemon-stat-item">
              <span className="zen-muted-text">Ngày đã xét duyệt gần nhất</span>
              <strong>{db.session.lastEvaluatedDate || '—'}</strong>
            </div>
            <div className="daemon-stat-item">
              <span className="zen-muted-text">Kho lưu trữ ảnh PoW</span>
              <strong style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <ImageIcon size={14} color="#5BAE93" />
                {daemonStatus?.ok ? 'data/proofs/*.jpg (Gọn nhẹ)' : 'Bộ nhớ đệm trình duyệt'}
              </strong>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            <label className="settings-toggle-row">
              <input
                type="checkbox"
                checked={
                  autoStartStatus?.ok
                    ? autoStartStatus.enabled
                    : db.session.autoStartWithWindows !== false
                }
                onChange={async (e) => {
                  const next = e.target.checked;
                  const res = await desktopBridge.setAutoStart(next);
                  onSetAutoStartStatus(res);
                  onPersistDb((prev) => ({
                    ...prev,
                    session: { ...prev.session, autoStartWithWindows: next },
                  }));
                  onShowMessage(
                    next ? '✅ ĐÃ BẬT TỰ KHỞI ĐỘNG CÙNG WINDOWS' : 'ĐÃ TẮT TỰ KHỞI ĐỘNG CÙNG WINDOWS',
                    next
                      ? 'Mỗi khi bạn mở máy, trình chạy nền Lên Núi sẽ tự khởi động ẩn và tự đối soát ngày cũ.'
                      : 'Bạn đã tắt tự chạy khi khởi động Windows.',
                    'seal'
                  );
                }}
              />
              <div>
                <strong>Tự động bật tiến trình chạy nền khi mở máy Windows</strong>
                <div className="zen-muted-text" style={{ fontSize: 12.5 }}>
                  Đăng ký khởi động ẩn qua Windows Startup Registry (HKCU Run) — không hiện cửa sổ
                  CMD.
                </div>
              </div>
            </label>

            <label className="settings-toggle-row">
              <input
                type="checkbox"
                checked={db.session.autoOpenOnViolation !== false}
                onChange={(e) => {
                  const next = e.target.checked;
                  onPersistDb((prev) => ({
                    ...prev,
                    session: { ...prev.session, autoOpenOnViolation: next },
                  }));
                }}
              />
              <div>
                <strong>Tự bật cửa sổ cảnh báo khi phát hiện tắt máy né chốt ngày</strong>
                <div className="zen-muted-text" style={{ fontSize: 12.5 }}>
                  Khi bật máy lại sau giờ chốt mà ngày cũ chưa hoàn thành, app tự mở lên để bạn đối
                  mặt ngay.
                </div>
              </div>
            </label>

            <label className="settings-toggle-row">
              <input
                type="checkbox"
                checked={Boolean(db.session.reduceMotion)}
                onChange={(e) => {
                  const next = e.target.checked;
                  onPersistDb((prev) => ({
                    ...prev,
                    session: { ...prev.session, reduceMotion: next },
                  }));
                  onShowMessage(
                    next ? '⚡ ĐÃ BẬT CHẾ ĐỘ TIẾT KIỆM CPU/PIN' : '✨ ĐÃ BẬT LẠI HIỆU ỨNG SƯƠNG MÙ',
                    next
                      ? 'Đã tắt hiệu ứng canvas sương mù chuyển động trên nền.'
                      : 'Hiệu ứng tranh thủy mặc chuyển động nhẹ đã được khôi phục.',
                    'info'
                  );
                }}
              />
              <div>
                <strong>Chế độ tiết kiệm CPU / Pin (Tắt hiệu ứng sương mù chuyển động)</strong>
                <div className="zen-muted-text" style={{ fontSize: 12.5 }}>
                  Giữ nguyên nền tranh thủy mặc tĩnh, giảm tối đa mức tiêu thụ GPU/Pin khi mở app cả
                  ngày.
                </div>
              </div>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            <button
              type="button"
              className="zen-btn zen-btn-outline"
              onClick={async () => {
                await desktopBridge.pingHeartbeat();
                const latest = await desktopBridge.fetchServerDatabase();
                if (latest) {
                  const res = evaluatePendingDays(latest, todayStr, Date.now());
                  onReplaceDb(res.db);
                  if (res.changed) await desktopBridge.saveDatabase(res.db);
                  onAnnounceLawVerdict(res);
                  onShowMessage(
                    'ĐÃ ĐỐI SOÁT HỆ THỐNG CHẠY NỀN',
                    res.changed
                      ? `Đã cập nhật xét duyệt ${res.evaluatedDays.length} ngày.`
                      : 'Mọi ngày trước đã được xét duyệt đầy đủ, không có ngày bị sót.',
                    'info'
                  );
                }
              }}
            >
              <RefreshCw size={14} /> Đối soát & Chốt bù ngay
            </button>

            {daemonStatus?.ok && (
              <button
                type="button"
                className="zen-btn zen-btn-ghost"
                onClick={() => window.close()}
                title="Đóng cửa sổ giao diện — tiến trình chạy nền vẫn hoạt động ở khay System Tray"
              >
                Thu về chạy nền ở System Tray
              </button>
            )}
          </div>
        </div>
        )}

        {activeSubTab === 'BACKUP_RESET' && (
        /* CARD 1: FULL RESET */
        <div className="zen-card settings-danger-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Trash2 size={22} color="#ff5252" />
            <h3 className="zen-subcard-title" style={{ color: '#ff8a80', margin: 0 }}>
              1. Xóa Toàn Bộ Dữ Liệu — Bắt Đầu Lại Từ Đầu (Reset Data)
            </h3>
          </div>
          <p className="zen-muted-text" style={{ marginBottom: 16 }}>
            Dùng khi bạn muốn xóa toàn bộ dữ liệu nháp/thử nghiệm để bắt đầu hành trình chính thức từ
            con số 0. Bạn có thể chọn giữ lại 3 khung nhóm Nghi Thức gợi ý (để đỡ phải gõ lại tiêu đề
            buổi sáng/chiều/tối) hoặc xóa trắng 100%.
          </p>

          {confirmResetMode === 'NONE' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="settings-action-box">
                <div>
                  <strong style={{ color: '#F4F1EA', fontSize: 14.5 }}>
                    Phương án A (Khuyên dùng): Xóa sạch dữ liệu & Giữ 3 khung tiêu đề Nghi Thức trống
                  </strong>
                  <p className="zen-muted-text" style={{ fontSize: 12.5, marginTop: 4 }}>
                    Xóa sạch mọi Đỉnh Núi, Todo Công Phá, Nhật Ký Tự Vấn, Tàng Kinh Các, Vi Phạm và
                    đưa Streak về 0. Giữ lại 3 khung tên nhóm Nghi Thức trống để bạn thêm checkbox
                    nhanh.
                  </p>
                </div>
                <button
                  type="button"
                  className="zen-btn zen-btn-seal"
                  onClick={() => onSetConfirmResetMode('KEEP_RITUAL_FRAMES')}
                >
                  <RefreshCw size={15} />
                  <span>Reset Về Mới Tinh (Giữ Khung Nghi Thức)</span>
                </button>
              </div>

              <div className="settings-action-box">
                <div>
                  <strong style={{ color: '#ff8a80', fontSize: 14.5 }}>
                    Phương án B: Xóa Trắng 100% Tất Cả (Kể cả các nhóm Nghi Thức)
                  </strong>
                  <p className="zen-muted-text" style={{ fontSize: 12.5, marginTop: 4 }}>
                    Xóa trắng hoàn toàn 100% mọi bảng dữ liệu về trạng thái rỗng tuyệt đối, không giữ
                    lại bất kỳ nhóm Nghi Thức nào.
                  </p>
                </div>
                <button
                  type="button"
                  className="zen-btn zen-btn-danger"
                  onClick={() => onSetConfirmResetMode('TOTAL_WIPE')}
                >
                  <Trash2 size={15} />
                  <span>Xóa Trắng 100% Toàn Bộ</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="settings-confirm-alert">
              <h4 style={{ color: '#ff8a80', fontSize: 16, marginBottom: 8 }}>
                ⚠️ XÁC NHẬN XÓA DỮ LIỆU (KHÔNG THỂ HOÀN TÁC):
              </h4>
              <p style={{ fontSize: 13.5, color: '#F4F1EA', marginBottom: 14 }}>
                {confirmResetMode === 'KEEP_RITUAL_FRAMES'
                  ? 'Bạn có chắc chắn muốn xóa toàn bộ Đỉnh Núi, Todo, Nhật Ký, Tàng Kinh Các, Vi Phạm và đưa hệ thống về trạng thái mới tinh (chỉ giữ lại 3 tiêu đề nhóm Nghi Thức trống)?'
                  : 'Bạn có chắc chắn muốn XÓA TRẮNG 100% toàn bộ dữ liệu (bao gồm cả mọi nhóm Nghi Thức)?'}
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="zen-btn zen-btn-danger"
                  onClick={async () => {
                    const keepFrames = confirmResetMode === 'KEEP_RITUAL_FRAMES';
                    const fresh = await desktopBridge.resetDatabase(keepFrames);
                    onResetSelectedStateAfterWipe(fresh);
                    onSetConfirmResetMode('NONE');
                    onPlayTempleBell(0.8);
                    onShowMessage(
                      'ĐÃ RESET DỮ LIỆU THÀNH CÔNG!',
                      'Toàn bộ dữ liệu cũ đã được xóa sạch. Bạn có thể bắt đầu hành trình mới ngay bây giờ!',
                      'seal'
                    );
                  }}
                >
                  <Check size={15} />
                  <span>Đồng Ý Xóa Ngay Lập Tức</span>
                </button>
                <button
                  type="button"
                  className="zen-btn zen-btn-outline"
                  onClick={() => onSetConfirmResetMode('NONE')}
                >
                  <span>Hủy Bỏ</span>
                </button>
              </div>
            </div>
          )}
        </div>
        )}

        {activeSubTab === 'CLEAR_DATA' && (
        /* CARD 2: SELECTIVE CLEAR */
        <div className="zen-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <ShieldAlert size={20} color="#A8D8C6" />
            <h3 className="zen-subcard-title" style={{ margin: 0 }}>
              2. Xóa Nhanh Từng Phần Riêng Biệt (Không Ảnh Hưởng Các Mục Khác)
            </h3>
          </div>
          <p className="zen-muted-text" style={{ marginBottom: 14 }}>
            Nếu bạn chỉ muốn dọn dẹp một phần dữ liệu hoặc làm mới các chỉ số tích lũy (Heatmap, giờ
            Pomodoro, ảnh PoW, lịch sử Nghi thức, Việc vặt...) mà <strong>vẫn giữ nguyên các Đỉnh Núi</strong>:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              className="settings-selective-row"
              style={{
                borderColor: 'rgba(91, 174, 147, 0.45)',
                background: 'rgba(62, 138, 114, 0.08)',
              }}
            >
              <div>
                <strong style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#a8d8c6' }}>
                  <Calendar size={15} /> Reset Dữ Liệu Bản Đồ Nhiệt Kỷ Luật (Heatmap)
                </strong>
                <small className="zen-muted-text" style={{ display: 'block', marginTop: 2 }}>
                  Xóa trắng toàn bộ các ô màu tích lũy cũ trên Heatmap (đặt mốc Heatmap bắt đầu lại từ{' '}
                  {todayStr}, xóa vi phạm/thẻ nghỉ cũ &amp; bỏ đánh dấu Nghi thức cũ). Vẫn giữ nguyên các
                  Đỉnh Núi và mẫu Nghi Thức!
                </small>
              </div>
              <button
                type="button"
                className="zen-btn zen-btn-seal"
                onClick={() => {
                  const now = Date.now();
                  onPlayTempleBell(0.7);
                  onPersistDb((prev) => ({
                    ...prev,
                    session: {
                      ...prev.session,
                      currentStreak: 0,
                      violationCount: 0,
                      restDays: [],
                      heatmapResetDate: todayStr,
                      heatmapResetAt: now,
                    },
                    violations: [],
                    ritualGroups: (prev.ritualGroups || []).map((g) => ({
                      ...g,
                      items: g.items.map((it) => ({ ...it, completedDates: {} })),
                    })),
                  }));
                  onShowMessage(
                    '🗓️ ĐÃ RESET DỮ LIỆU BẢN ĐỒ NHIỆT (HEATMAP)',
                    `Toàn bộ ô màu lịch sử trên Heatmap đã được làm sạch về mốc hôm nay (${todayStr}). Chuỗi kỷ luật mới bắt đầu tính lại từ 0!`,
                    'seal'
                  );
                }}
              >
                <RotateCcw size={14} /> Reset Data Heatmap
              </button>
            </div>

            <div className="settings-selective-row">
              <div>
                <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Flame size={15} color="#ff9800" /> Xóa Toàn Bộ Lịch Sử Tích Nghi Thức Cũ (
                  {accumulatedStats.totalRitualCheckMarks} lượt đã tích)
                </strong>
                <small className="zen-muted-text" style={{ display: 'block' }}>
                  Xóa sạch lịch sử check Nghi thức của tất cả các ngày trước đó nhưng vẫn giữ nguyên danh
                  sách các bước Nghi Thức
                </small>
              </div>
              <button
                type="button"
                className="zen-btn zen-btn-outline"
                onClick={() => {
                  onPersistDb((prev) => ({
                    ...prev,
                    ritualGroups: (prev.ritualGroups || []).map((g) => ({
                      ...g,
                      items: g.items.map((it) => ({ ...it, completedDates: {} })),
                    })),
                  }));
                  onShowMessage(
                    'ĐÃ XÓA LỊCH SỬ TÍCH NGHI THỨC',
                    'Toàn bộ dấu tích Nghi thức theo ngày đã được dọn sạch.',
                    'seal'
                  );
                }}
              >
                <Trash2 size={14} /> Clear Nghi Thức Cũ
              </button>
            </div>

            <div className="settings-selective-row">
              <div>
                <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={15} color="#7DBFA8" /> Reset Thời Gian Pomodoro Tích Lũy Các Đỉnh Núi (
                  {accumulatedStats.totalPomoMins} phút)
                </strong>
                <small className="zen-muted-text" style={{ display: 'block' }}>
                  Đưa toàn bộ số phút &amp; số hiệp Pomodoro tích lũy về 0 (giúp tính lại tỷ trọng cân
                  bằng giữa các Đỉnh Núi trên Lịch AI từ đầu)
                </small>
              </div>
              <button
                type="button"
                className="zen-btn zen-btn-outline"
                onClick={() => {
                  onPersistDb((prev) => ({
                    ...prev,
                    dailyStrikes: prev.dailyStrikes.map((s) =>
                      s.goalId === SIDE_QUEST_GOAL_ID
                        ? s
                        : {
                            ...s,
                            completedPomodoroMins: 0,
                            pomodoroSessionsCount: 0,
                            savedPomoSecondsLeft: null,
                            savedPomoTotalSeconds: null,
                            savedPomoSelectedMins: null,
                          }
                    ),
                  }));
                  onShowMessage(
                    'ĐÃ RESET GIỜ POMODORO TÍCH LŨY',
                    'Tổng phút tập trung tích lũy của các Đỉnh Núi đã được đưa về 0 phút.',
                    'seal'
                  );
                }}
              >
                <RotateCcw size={14} /> Reset Pomodoro Tích Lũy
              </button>
            </div>

            <div className="settings-selective-row">
              <div>
                <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Camera size={15} color="#a5d6a7" /> Xóa Toàn Bộ Ảnh Bằng Chứng PoW Đã Lưu (
                  {accumulatedStats.totalProofPhotos} ảnh)
                </strong>
                <small className="zen-muted-text" style={{ display: 'block' }}>
                  Xóa toàn bộ ảnh Proof-of-Work tích lũy trong các Todo (vẫn giữ lại Todo &amp; Đỉnh Núi)
                </small>
              </div>
              <button
                type="button"
                className="zen-btn zen-btn-outline"
                onClick={() => {
                  onPersistDb((prev) => ({
                    ...prev,
                    dailyStrikes: prev.dailyStrikes.map((s) => ({
                      ...s,
                      proofPhotoUri: null,
                      proofPhotoCaption: undefined,
                      proofPhotosList: [],
                      proofAnalysis: null,
                    })),
                  }));
                  onShowMessage(
                    'ĐÃ XÓA TOÀN BỘ ẢNH BẰNG CHỨNG POW',
                    'Tất cả ảnh bằng chứng tích lũy trong Todo đã được dọn sạch.',
                    'seal'
                  );
                }}
              >
                <Trash2 size={14} /> Clear Ảnh PoW
              </button>
            </div>

            <div className="settings-selective-row">
              <div>
                <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckSquare size={15} color="#f0c878" /> Đặt Lại Tiến Độ Checklist Mục Tiêu Con Về 0% (
                  {accumulatedStats.completedMilestones} mục đã tick)
                </strong>
                <small className="zen-muted-text" style={{ display: 'block' }}>
                  Bỏ tick toàn bộ các mục Checklist bên trong mỗi Đỉnh Núi để bắt đầu đo % tiến độ lại
                  từ 0%
                </small>
              </div>
              <button
                type="button"
                className="zen-btn zen-btn-outline"
                onClick={() => {
                  onPersistDb((prev) => ({
                    ...prev,
                    peakGoals: prev.peakGoals.map((g) => ({
                      ...g,
                      isCompleted: false,
                      completedAt: undefined,
                      currentMetric: 0,
                      progressPct: 0,
                      milestones: (g.milestones || []).map((m) => ({
                        ...m,
                        isCompleted: false,
                        completedAt: undefined,
                      })),
                    })),
                  }));
                  onShowMessage(
                    'ĐÃ ĐẶT LẠI TIẾN ĐỘ CHECKLIST ĐỈNH NÚI',
                    'Tiến độ % và Checklist của tất cả Đỉnh Núi đã quay về 0%.',
                    'seal'
                  );
                }}
              >
                <RotateCcw size={14} /> Reset Tiến Độ %
              </button>
            </div>

            <div className="settings-selective-row">
              <div>
                <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={15} color="#7DBFA8" /> Xóa Toàn Bộ Việc Vặt &amp; Lịch Sử Việc Vặt (
                  {accumulatedStats.sideQuestsCount} việc)
                </strong>
                <small className="zen-muted-text" style={{ display: 'block' }}>
                  Làm sạch danh sách &amp; thống kê giờ Việc Vặt (không ảnh hưởng Todo Công Phá của Đỉnh Núi)
                </small>
              </div>
              <button
                type="button"
                className="zen-btn zen-btn-outline"
                onClick={() => {
                  onPersistDb((prev) => ({
                    ...prev,
                    dailyStrikes: prev.dailyStrikes.filter((s) => s.goalId !== SIDE_QUEST_GOAL_ID),
                  }));
                  onShowMessage(
                    'ĐÃ XÓA TOÀN BỘ VIỆC VẶT',
                    'Danh sách và lịch sử Việc Vặt đã được dọn sạch.',
                    'seal'
                  );
                }}
              >
                <Trash2 size={14} /> Clear Việc Vặt
              </button>
            </div>

            <div className="settings-selective-row">
              <div>
                <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Coffee size={15} color="#f0c878" /> Xóa Lịch Sử Thẻ Ngày Nghỉ Có Phép (
                  {accumulatedStats.restDaysCount} ngày đã đăng ký)
                </strong>
                <small className="zen-muted-text" style={{ display: 'block' }}>
                  Làm trống sổ đăng ký ngày nghỉ phép và hoàn lại hạn ngạch thẻ trong tháng
                </small>
              </div>
              <button
                type="button"
                className="zen-btn zen-btn-outline"
                onClick={() => {
                  onPersistDb((prev) => ({
                    ...prev,
                    session: { ...prev.session, restDays: [] },
                  }));
                  onShowMessage(
                    'ĐÃ XÓA LỊCH SỬ THẺ NGÀY NGHỈ',
                    'Toàn bộ thẻ Ngày Nghỉ Có Phép đã được xóa và hoàn lại hạn ngạch.',
                    'seal'
                  );
                }}
              >
                <Trash2 size={14} /> Clear Ngày Nghỉ
              </button>
            </div>

            <div className="settings-selective-row">
              <div>
                <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Bot size={15} color="#a8d8c6" /> Xóa Bảng Kế Hoạch Lịch Trình AI 7 Ngày Hiện Tại (
                  {db.climbingSchedulePlan ? 'Đang có lịch' : 'Trống'})
                </strong>
                <small className="zen-muted-text" style={{ display: 'block' }}>
                  Xóa kế hoạch 7 ngày hiện tại để lập lịch AI lại từ đầu (vẫn giữ lại API Key đã nhập)
                </small>
              </div>
              <button
                type="button"
                className="zen-btn zen-btn-outline"
                onClick={() => {
                  onPersistDb((prev) => {
                    if (!prev.climbingSchedulePlan) return prev;
                    const preservedKeys = prev.climbingSchedulePlan.externalApiKeys;
                    const preservedGemini = prev.climbingSchedulePlan.geminiApiKey;
                    const preservedProvider = prev.climbingSchedulePlan.aiProvider;
                    const preservedEngine = prev.climbingSchedulePlan.aiEngineMode;
                    return {
                      ...prev,
                      climbingSchedulePlan:
                        preservedKeys || preservedGemini
                          ? {
                              ...prev.climbingSchedulePlan,
                              days: [],
                              aiReasoningSummary: '',
                              aiCoachingTips: [],
                              externalApiKeys: preservedKeys,
                              geminiApiKey: preservedGemini,
                              aiProvider: preservedProvider,
                              aiEngineMode: preservedEngine,
                            }
                          : null,
                    };
                  });
                  onShowMessage(
                    'ĐÃ XÓA KẾ HOẠCH LỊCH TRÌNH AI',
                    'Bảng lịch 7 ngày đã được làm trống (API Key của bạn vẫn được giữ lại).',
                    'seal'
                  );
                }}
              >
                <Trash2 size={14} /> Clear Lịch Trình AI
              </button>
            </div>

            <div className="settings-selective-row">
              <div>
                <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Lightbulb size={15} color="#f0c878" /> Reset Thống Kê Áp Dụng Sổ Bí Kíp &amp; Ý Tưởng (
                  {accumulatedStats.totalOptApplied} lượt đã áp dụng)
                </strong>
                <small className="zen-muted-text" style={{ display: 'block' }}>
                  Đặt lại bộ đếm số lần áp dụng bí kíp về 0 (hoặc giữ nguyên các ghi chú của bạn)
                </small>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="zen-btn zen-btn-outline"
                  onClick={() => {
                    onPersistDb((prev) => ({
                      ...prev,
                      optimizationNotes: (prev.optimizationNotes || []).map((n) => ({
                        ...n,
                        appliedCount: 0,
                        lastAppliedDate: undefined,
                      })),
                    }));
                    onShowMessage(
                      'ĐÃ RESET LƯỢT ÁP DỤNG BÍ KÍP',
                      'Số lần áp dụng của các ghi chú trong Sổ Bí Kíp đã đưa về 0.',
                      'seal'
                    );
                  }}
                >
                  <RotateCcw size={14} /> Reset Lượt Áp Dụng
                </button>
                <button
                  type="button"
                  className="zen-btn zen-btn-outline"
                  onClick={() => {
                    onPersistDb((prev) => ({
                      ...prev,
                      optimizationNotes: createDefaultOptimizationNotes(Date.now()),
                    }));
                    onShowMessage(
                      'ĐÃ KHÔI PHỤC SỔ BÍ KÍP MẶC ĐỊNH',
                      'Sổ Bí Kíp đã quay về danh sách mẫu tối ưu ban đầu.',
                      'info'
                    );
                  }}
                >
                  <Trash2 size={14} /> Clear Bí Kíp Về Mặc Định
                </button>
              </div>
            </div>

            <div className="settings-selective-row">
              <div>
                <strong>Xóa toàn bộ Lịch Sử Vi Phạm Luật Núi ({db.violations.length} lần)</strong>
                <small className="zen-muted-text" style={{ display: 'block' }}>
                  Đưa số lần vi phạm về 0 và xóa sạch sổ án giới luật
                </small>
              </div>
              <button
                type="button"
                className="zen-btn zen-btn-outline"
                onClick={() => {
                  onPersistDb((prev) => ({
                    ...prev,
                    session: { ...prev.session, violationCount: 0 },
                    violations: [],
                  }));
                  onShowMessage(
                    'ĐÃ XÓA LỊCH SỬ VI PHẠM',
                    'Số lần vi phạm Luật Núi đã được đặt lại về 0.',
                    'seal'
                  );
                }}
              >
                <Trash2 size={14} /> Xóa Vi Phạm
              </button>
            </div>

            <div className="settings-selective-row">
              <div>
                <strong>
                  Xóa toàn bộ Todo Công Phá ({accumulatedStats.mountainStrikesCount} Todo Đỉnh Núi)
                </strong>
                <small className="zen-muted-text" style={{ display: 'block' }}>
                  Xóa tất cả Todo trong các ngọn núi nhưng vẫn giữ nguyên danh sách Đỉnh Núi
                </small>
              </div>
              <button
                type="button"
                className="zen-btn zen-btn-outline"
                onClick={() => {
                  onPersistDb((prev) => ({
                    ...prev,
                    dailyStrikes: prev.dailyStrikes.filter((s) => s.goalId === SIDE_QUEST_GOAL_ID),
                  }));
                  onShowMessage(
                    'ĐÃ XÓA TOÀN BỘ TODO CÔNG PHÁ',
                    'Tất cả các mũi công phá Đỉnh Núi đã được làm sạch.',
                    'seal'
                  );
                }}
              >
                <Trash2 size={14} /> Xóa Todo
              </button>
            </div>

            <div className="settings-selective-row">
              <div>
                <strong>Xóa toàn bộ Nhật Ký Tự Vấn ({db.reflectionJournals.length} bài)</strong>
                <small className="zen-muted-text" style={{ display: 'block' }}>
                  Làm trống danh sách các bản tự vấn cuối ngày
                </small>
              </div>
              <button
                type="button"
                className="zen-btn zen-btn-outline"
                onClick={() => {
                  onPersistDb((prev) => ({ ...prev, reflectionJournals: [] }));
                  onShowMessage(
                    'ĐÃ XÓA NHẬT KÝ TỰ VẤN',
                    'Toàn bộ bản ghi tự vấn đã được xóa.',
                    'seal'
                  );
                }}
              >
                <Trash2 size={14} /> Xóa Tự Vấn
              </button>
            </div>

            <div className="settings-selective-row">
              <div>
                <strong>
                  Xóa các cuộn chứng nhận trong Tàng Kinh Các ({db.sacredScrolls.length} cuộn)
                </strong>
                <small className="zen-muted-text" style={{ display: 'block' }}>
                  Làm trống kệ sách Tàng Kinh Các
                </small>
              </div>
              <button
                type="button"
                className="zen-btn zen-btn-outline"
                onClick={() => {
                  onPersistDb((prev) => ({ ...prev, sacredScrolls: [] }));
                  onShowMessage(
                    'ĐÃ LÀM TRỐNG TÀNG KINH CÁC',
                    'Các cuộn chứng nhận thử nghiệm đã được xóa.',
                    'seal'
                  );
                }}
              >
                <Trash2 size={14} /> Xóa Tàng Kinh Các
              </button>
            </div>

            <div className="settings-selective-row">
              <div>
                <strong>Bỏ tích toàn bộ Checkbox Nghi Thức hôm nay ({todayStr})</strong>
                <small className="zen-muted-text" style={{ display: 'block' }}>
                  Đặt lại trạng thái hoàn thành Nghi Thức chỉ riêng ngày hôm nay về 0%
                </small>
              </div>
              <button
                type="button"
                className="zen-btn zen-btn-outline"
                onClick={() => {
                  onPersistDb((prev) => ({
                    ...prev,
                    ritualGroups: (prev.ritualGroups || []).map((g) => ({
                      ...g,
                      items: g.items.map((it) => {
                        const nextDates = { ...(it.completedDates || {}) };
                        delete nextDates[todayStr];
                        return { ...it, completedDates: nextDates };
                      }),
                    })),
                  }));
                  onShowMessage(
                    'ĐÃ ĐẶT LẠI NGHI THỨC HÔM NAY',
                    'Tất cả checkbox nghi thức hôm nay đã được bỏ tích.',
                    'info'
                  );
                }}
              >
                <RotateCcw size={14} /> Đặt Lại Hôm Nay
              </button>
            </div>

            <div className="settings-selective-row">
              <div>
                <strong>
                  Đặt lại hạn ngạch sửa/hủy Todo hôm nay ({todayTaskModsCount}/{maxDailyTaskMods} đã
                  dùng)
                </strong>
                <small className="zen-muted-text" style={{ display: 'block' }}>
                  Khôi phục lại {maxDailyTaskMods} lượt sửa/hủy Todo cho ngày {todayStr}
                </small>
              </div>
              <button
                type="button"
                className="zen-btn zen-btn-outline"
                onClick={() => {
                  onPersistDb((prev) => ({
                    ...prev,
                    taskModificationLogs: (prev.taskModificationLogs || []).filter(
                      (l) => l.date !== todayStr
                    ),
                  }));
                  onShowMessage(
                    'ĐÃ ĐẶT LẠI HẠN NGẠCH SỬA/HỦY TODO',
                    `Hôm nay bạn đã có lại đầy đủ ${maxDailyTaskMods}/${maxDailyTaskMods} lượt sửa/hủy Todo.`,
                    'seal'
                  );
                }}
              >
                <RefreshCw size={14} /> Khôi Phục Lượt Sửa
              </button>
            </div>

            <div className="settings-selective-row">
              <div>
                <strong>
                  Xóa Nhật Ký Phiên Tập Trung &amp; Thống Kê Quỹ Thời Gian (
                  {(db.focusSessionLogs || []).length} phiên ghi sổ)
                </strong>
                <small className="zen-muted-text" style={{ display: 'block' }}>
                  Làm sạch log phiên bấm giờ thủ công &amp; Pomodoro chi tiết (vẫn giữ Đỉnh Núi)
                </small>
              </div>
              <button
                type="button"
                className="zen-btn zen-btn-outline"
                onClick={() => {
                  onPersistDb((prev) => ({ ...prev, focusSessionLogs: [] }));
                  onShowMessage(
                    'ĐÃ XÓA NHẬT KÝ PHIÊN THỜI GIAN',
                    'Toàn bộ bản ghi chi tiết từng phiên tập trung đã được dọn sạch.',
                    'seal'
                  );
                }}
              >
                <Trash2 size={14} /> Xóa Log Thời Gian
              </button>
            </div>

            <div className="settings-selective-row">
              <div>
                <strong>Dọn Ảnh Bằng Chứng Mồ Côi Trên Ổ Đĩa (data/proofs/)</strong>
                <small className="zen-muted-text" style={{ display: 'block' }}>
                  Quét &amp; xóa các file ảnh cũ không còn gắn với Todo hay Cuộn Chứng Nhận nào để
                  giải phóng dung lượng SSD
                </small>
              </div>
              <button
                type="button"
                className="zen-btn zen-btn-outline"
                disabled={isCleaningProofs}
                onClick={async () => {
                  setIsCleaningProofs(true);
                  try {
                    const res = await desktopBridge.cleanupOrphanProofs();
                    if (!res.ok) {
                      onShowMessage(
                        'CHƯA KẾT NỐI DAEMON ĐỂ DỌN Ổ ĐĨA',
                        'Tính năng dọn tệp trong data/proofs/ cần daemon chạy nền đang hoạt động.',
                        'info'
                      );
                      return;
                    }
                    const freedKb = Math.round((res.freedBytes || 0) / 1024);
                    onShowMessage(
                      '🧹 ĐÃ DỌN DẸP THƯ MỤC ẢNH BẰNG CHỨNG!',
                      res.removedCount
                        ? `Đã xóa ${res.removedCount} ảnh mồ côi (${freedKb} KB giải phóng). Còn lại ${res.remainingCount ?? 0} ảnh đang sử dụng.`
                        : 'Không phát hiện ảnh mồ côi nào — thư mục data/proofs/ hoàn toàn sạch sẽ!',
                      'seal'
                    );
                  } finally {
                    setIsCleaningProofs(false);
                  }
                }}
              >
                <ImageIcon size={14} />{' '}
                {isCleaningProofs ? 'Đang quét đĩa...' : 'Dọn Ảnh Mồ Côi'}
              </button>
            </div>
          </div>
        </div>
        )}

        {activeSubTab === 'DAEMON_MOTTO' && (
        /* CARD 3: TÂM NIỆM & STREAK */
        <div className="zen-card">
          <h3 className="zen-subcard-title" style={{ marginBottom: 8 }}>
            3. Tâm Niệm Sống Mặc Định & Chuỗi Ngày Kỷ Luật
          </h3>
          <p className="zen-muted-text" style={{ marginBottom: 12 }}>
            Câu tâm niệm hiển thị trên thanh tiêu đề trên cùng khi bạn ở màn hình chính:
          </p>
          <label className="zen-label">Câu Tâm Niệm Sống Của Bạn</label>
          <textarea
            className="zen-textarea"
            rows={2}
            value={globalMottoDraft}
            onChange={(e) => onChangeGlobalMottoDraft(e.target.value)}
            placeholder="Nhập câu tâm niệm nhắc nhở bản thân mỗi ngày..."
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 12,
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <button
              type="button"
              className="zen-btn zen-btn-seal"
              onClick={() => {
                if (!globalMottoDraft.trim()) return;
                onPersistDb((prev) => ({
                  ...prev,
                  session: { ...prev.session, mottoText: globalMottoDraft.trim() },
                }));
                onShowMessage(
                  'ĐÃ LƯU TÂM NIỆM SỐNG',
                  'Câu tâm niệm mới đã được cập nhật lên bảng chỉ huy.',
                  'seal'
                );
              }}
            >
              <Check size={15} /> Lưu Tâm Niệm Sống
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="zen-muted-text" style={{ fontSize: 13 }}>
                Streak hiện tại: <strong>{db.session.currentStreak} ngày</strong>
              </span>
              <button
                type="button"
                className="zen-btn zen-btn-outline"
                style={{ padding: '5px 10px', fontSize: 12 }}
                onClick={() =>
                  onPersistDb((prev) => ({
                    ...prev,
                    session: { ...prev.session, currentStreak: prev.session.currentStreak + 1 },
                  }))
                }
              >
                +1 ngày
              </button>
              <button
                type="button"
                className="zen-btn zen-btn-outline"
                style={{ padding: '5px 10px', fontSize: 12 }}
                onClick={() =>
                  onPersistDb((prev) => ({
                    ...prev,
                    session: { ...prev.session, currentStreak: 0 },
                  }))
                }
              >
                Về 0
              </button>
            </div>
          </div>
        </div>
        )}

        {activeSubTab === 'BACKUP_RESET' && (
        /* CARD 4: EXPORT / IMPORT JSON */
        <div className="zen-card">
          <h3 className="zen-subcard-title" style={{ marginBottom: 8 }}>
            4. Sao Lưu Dự Phòng & Khôi Phục Dữ Liệu (Backup / Restore Toàn Diện)
          </h3>
          <p className="zen-muted-text" style={{ marginBottom: 12 }}>
            Ảnh bằng chứng Proof-of-Work được tách ra thư mục <code>data/proofs/</code>. Bạn có thể
            chọn <strong>Xuất file .json nhẹ</strong> (chỉ dữ liệu) hoặc{' '}
            <strong>Xuất Gói Đầy Đủ</strong> (đóng gói kèm toàn bộ ảnh PoW để khôi phục sang máy
            khác không bị mất ảnh).
          </p>

          <label className="settings-toggle-row" style={{ marginBottom: 14 }}>
            <input
              type="checkbox"
              checked={includeApiKeysInBackup}
              onChange={(e) => setIncludeApiKeysInBackup(e.target.checked)}
            />
            <div>
              <strong>Kèm API Key AI (Gemini / Groq / OpenRouter) trong file xuất</strong>
              <div className="zen-muted-text" style={{ fontSize: 12 }}>
                Mặc định TẮT để bảo mật tuyệt đối API Key cá nhân khi gửi hoặc lưu file sao lưu.
              </div>
            </div>
          </label>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="zen-btn zen-btn-outline"
              onClick={() => {
                const cloned: MonkDatabaseSchema = JSON.parse(JSON.stringify(db));
                if (!includeApiKeysInBackup) {
                  if (cloned.climbingSchedulePlan) {
                    delete cloned.climbingSchedulePlan.geminiApiKey;
                    delete cloned.climbingSchedulePlan.externalApiKeys;
                  }
                  if (Array.isArray(cloned.savedScheduleProfiles)) {
                    for (const p of cloned.savedScheduleProfiles) {
                      if (p?.plan) {
                        delete p.plan.geminiApiKey;
                        delete p.plan.externalApiKeys;
                      }
                    }
                  }
                }
                const dataStr = JSON.stringify(cloned, null, 2);
                const blob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `len-nui-backup-${todayStr}.json`;
                a.click();
                URL.revokeObjectURL(url);
                onShowMessage(
                  'ĐÃ XUẤT FILE SAO LƯU NHẸ (.JSON)',
                  `File len-nui-backup-${todayStr}.json đã được tải về (${includeApiKeysInBackup ? 'đã kèm API Key' : 'đã ẩn API Key an toàn'}).`,
                  'seal'
                );
              }}
            >
              <Download size={15} />
              <span>Xuất Nhẹ (.JSON)</span>
            </button>

            <button
              type="button"
              className="zen-btn zen-btn-seal"
              disabled={isExportingPortable}
              onClick={async () => {
                setIsExportingPortable(true);
                try {
                  const bundle = await desktopBridge.fetchPortableBackup(includeApiKeysInBackup);
                  if (!bundle) {
                    onShowMessage(
                      'CHƯA THỂ XUẤT GÓI KÈM ẢNH',
                      'Cần daemon chạy nền để gom ảnh từ thư mục data/proofs/. Bạn có thể dùng nút "Xuất Nhẹ (.JSON)" bên cạnh.',
                      'danger'
                    );
                    return;
                  }
                  const dataStr = JSON.stringify(bundle);
                  const blob = new Blob([dataStr], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `len-nui-full-backup-${todayStr}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  const photosCount = Object.keys(bundle.embeddedProofs || {}).length;
                  onShowMessage(
                    '📦 ĐÃ XUẤT GÓI SAO LƯU ĐẦY ĐỦ!',
                    `Đã đóng gói ${bundle.db?.peakGoals?.length || 0} Đỉnh Núi và ${photosCount} ảnh bằng chứng PoW vào 1 file duy nhất.`,
                    'seal'
                  );
                } finally {
                  setIsExportingPortable(false);
                }
              }}
            >
              <Download size={15} />
              <span>
                {isExportingPortable
                  ? 'Đang đóng gói ảnh PoW...'
                  : '📦 Xuất Gói Đầy Đủ (Kèm Ảnh PoW)'}
              </span>
            </button>

            <button
              type="button"
              className="zen-btn zen-btn-outline"
              onClick={() => backupFileInputRef.current?.click()}
            >
              <Upload size={15} />
              <span>Khôi Phục Từ File (.JSON / Full Bundle)</span>
            </button>

            <input
              ref={backupFileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async () => {
                  try {
                    const rawParsed = JSON.parse(String(reader.result));
                    if (
                      rawParsed?.format === 'LEN_NUI_PORTABLE_BACKUP_V1' &&
                      rawParsed?.db?.session &&
                      Array.isArray(rawParsed.db.peakGoals)
                    ) {
                      const res = await desktopBridge.restorePortableBackup({
                        db: rawParsed.db,
                        embeddedProofs: rawParsed.embeddedProofs,
                      });
                      const restoredDb = (res.db || rawParsed.db) as MonkDatabaseSchema;
                      onReplaceDb(restoredDb);
                      await desktopBridge.saveDatabase(restoredDb, true);
                      onChangeGlobalMottoDraft(restoredDb.session.mottoText || '');
                      onShowMessage(
                        '📦 KHÔI PHỤC GÓI ĐẦY ĐỦ THÀNH CÔNG!',
                        `Đã nạp ${restoredDb.peakGoals.length} Đỉnh Núi, ${
                          restoredDb.dailyStrikes?.length || 0
                        } Todo và khôi phục ${
                          res.restoredProofsCount ??
                          Object.keys(rawParsed.embeddedProofs || {}).length
                        } ảnh bằng chứng PoW.`,
                        'seal'
                      );
                      return;
                    }

                    const parsed = rawParsed as MonkDatabaseSchema;
                    if (!parsed || !parsed.session || !Array.isArray(parsed.peakGoals)) {
                      onShowMessage(
                        'FILE SAO LƯU KHÔNG HỢP LỆ',
                        'File JSON này không đúng cấu trúc dữ liệu của hệ thống Lên Núi.',
                        'danger'
                      );
                      return;
                    }
                    onReplaceDb(parsed);
                    await desktopBridge.saveDatabase(parsed, true);
                    onChangeGlobalMottoDraft(parsed.session.mottoText || '');
                    onShowMessage(
                      'KHÔI PHỤC DỮ LIỆU THÀNH CÔNG!',
                      `Đã nạp thành công ${parsed.peakGoals.length} Đỉnh Núi và ${
                        parsed.dailyStrikes?.length || 0
                      } Todo từ bản sao lưu.`,
                      'seal'
                    );
                  } catch {
                    onShowMessage(
                      'LỖI ĐỌC FILE JSON',
                      'Không thể phân tích cú pháp file JSON.',
                      'danger'
                    );
                  }
                };
                reader.readAsText(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>
        )}
      </div>
    </section>
  );
};
