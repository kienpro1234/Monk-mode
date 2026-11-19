import React, { useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Coffee,
  Image as ImageIcon,
  Lightbulb,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ToggleLeft,
  ToggleRight,
  Upload,
  Volume2,
  Zap,
} from 'lucide-react';
import {
  DailyStrikeTodoEntity,
  OptimizationCategory,
  OptimizationNoteEntity,
  TodoActivityType,
} from '../types/models';
import { WoodblockSealSvg } from '../components/WoodblockSealSvg';
import { resolveProofImageUrl } from '../services/desktopBridge';
import { ACTIVITY_TYPE_META, ALL_ACTIVITY_TYPES } from '../services/timeAuditEngine';
import { AmbientSoundMode } from '../utils/soundEngine';

interface FocusChamberViewProps {
  focusedStrike: DailyStrikeTodoEntity;
  focusIsSideQuest: boolean;
  focusContextTitle: string;
  pomoSecondsLeft: number;
  pomoTotalSeconds: number;
  pomoRunning: boolean;
  pomoSelectedMins: number;
  activityType: TodoActivityType;
  ambientMode: AmbientSoundMode;
  ambientVolume: number;
  breakSecondsLeft: number | null;
  breakTotalSeconds: number;
  pinnedOptimizationNotes: OptimizationNoteEntity[];
  onExitFocus: () => void;
  onSelectDuration: (mins: number) => void;
  onToggleRun: () => void;
  onResetTimer: () => void;
  onFinishActualSession: () => void;
  onChangeActivityType: (t: TodoActivityType) => void;
  onChangeAmbientMode: (m: AmbientSoundMode) => void;
  onChangeAmbientVolume: (v: number) => void;
  onStartBreak: (mins: number) => void;
  onCancelBreak: () => void;
  onUpdateNotes: (strikeId: string, notes: string) => void;
  onSaveQuickOptimizationNote: (params: {
    title: string;
    content: string;
    category: OptimizationCategory;
    timeSavedHint?: string;
  }) => void;
  onApplyOptimizationNote: (note: OptimizationNoteEntity) => void;
  onToggleRequiresPhoto: (strikeId: string) => void;
  onOpenProofModal: (strike: DailyStrikeTodoEntity, markCompleteAfterProof: boolean) => void;
  onCompleteStrikeAction: (strike: DailyStrikeTodoEntity) => void;
  onZoomPhoto: (photo: { uri: string; title: string; caption: string; dateStr: string }) => void;
}

export const FocusChamberView: React.FC<FocusChamberViewProps> = ({
  focusedStrike,
  focusIsSideQuest,
  focusContextTitle,
  pomoSecondsLeft,
  pomoTotalSeconds,
  pomoRunning,
  pomoSelectedMins,
  activityType,
  ambientMode,
  ambientVolume,
  breakSecondsLeft,
  breakTotalSeconds,
  pinnedOptimizationNotes,
  onExitFocus,
  onSelectDuration,
  onToggleRun,
  onResetTimer,
  onFinishActualSession,
  onChangeActivityType,
  onChangeAmbientMode,
  onChangeAmbientVolume,
  onStartBreak,
  onCancelBreak,
  onUpdateNotes,
  onSaveQuickOptimizationNote,
  onApplyOptimizationNote,
  onToggleRequiresPhoto,
  onOpenProofModal,
  onCompleteStrikeAction,
  onZoomPhoto,
}) => {
  const [quickIdeaOpen, setQuickIdeaOpen] = useState(false);
  const [quickIdeaTitle, setQuickIdeaTitle] = useState('');
  const [quickIdeaContent, setQuickIdeaContent] = useState('');
  const [quickIdeaCategory, setQuickIdeaCategory] =
    useState<OptimizationCategory>('COMBO_TIME_SAVER');
  const [quickIdeaSavedHint, setQuickIdeaSavedHint] = useState('');

  const elapsedSeconds = Math.max(0, pomoTotalSeconds - pomoSecondsLeft);
  const elapsedActualMins =
    elapsedSeconds > 0 ? Math.max(1, Math.round(elapsedSeconds / 60)) : 0;
  const isPausedMidSession = !pomoRunning && elapsedSeconds > 0;
  return (
    <div className="zen-card single-task-focus-chamber">
      <div className="focus-chamber-topbar">
        <button type="button" className="zen-btn zen-btn-outline" onClick={onExitFocus}>
          <ArrowLeft size={16} />
          <span>Quay Lại Danh Sách Todo</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="zen-tag-red">CHẾ ĐỘ TẬP TRUNG ĐƠN NHIỆM (SINGLE-TASK FOCUS)</span>
          <span className="time-window-pill">
            {focusIsSideQuest ? '' : '⛰️ '}
            {focusContextTitle}
          </span>
        </div>
      </div>

      <div className="focus-chamber-grid">
        {/* Left Column: Task Info, Notes & Big Pomodoro Timer */}
        <div className="focus-chamber-left">
          <div className="focus-task-header-box">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span
                className={`status-pill-tag ${
                  focusedStrike.status === 'COMPLETED' ? 'done' : 'pending'
                }`}
              >
                {focusedStrike.status === 'COMPLETED'
                  ? '✓ ĐÃ HOÀN THÀNH'
                  : '🎯 ĐANG TẬP TRUNG THỰC HIỆN'}
              </span>
              <span className="time-window-pill">Ngày: {focusedStrike.date}</span>
              <span className="pomo-pill">
                Đã tích lũy: {focusedStrike.completedPomodoroMins || 0} phút (
                {focusedStrike.pomodoroSessionsCount || 0} hiệp)
              </span>
            </div>

            <h2 className="focus-task-big-title">{focusedStrike.title}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              <span style={{ fontSize: 11.5, color: '#B8B4A9' }}>Loại thời gian:</span>
              {ALL_ACTIVITY_TYPES.map((t) => {
                const m = ACTIVITY_TYPE_META[t];
                return (
                  <button
                    key={t}
                    type="button"
                    className={`pomo-preset-btn ${activityType === t ? 'active' : ''}`}
                    style={{ fontSize: 11.5, padding: '3px 8px' }}
                    onClick={() => onChangeActivityType(t)}
                    title={m.description}
                  >
                    {m.icon} {m.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Timestamp-Anchored Pomodoro Timer */}
          <div className="focus-pomodoro-arena">
            <div className="focus-pomo-duration-selector">
              <span>Chọn thời lượng hiệp Pomodoro:</span>
              {[5, 10, 15, 25, 35, 45, 50, 60, 90].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  className={`pomo-preset-btn ${pomoSelectedMins === mins ? 'active' : ''}`}
                  onClick={() => onSelectDuration(mins)}
                >
                  {mins}p
                </button>
              ))}
            </div>

            <div className="focus-pomo-circle">
              <div className="focus-pomo-digits">
                {String(Math.floor(pomoSecondsLeft / 60)).padStart(2, '0')}:
                {String(pomoSecondsLeft % 60).padStart(2, '0')}
              </div>
              <div className="focus-pomo-sub">
                {pomoRunning
                  ? `🔥 Đang tập trung tuyệt đối (đã chạy ${elapsedActualMins}p thực tế)!`
                  : isPausedMidSession
                  ? `⏸ Đang tạm dừng — Đã bảo lưu mốc ${String(Math.floor(pomoSecondsLeft / 60)).padStart(2, '0')}:${String(pomoSecondsLeft % 60).padStart(2, '0')} (thoát ra ngoài không bị reset)`
                  : 'Bấm Bắt đầu để bước vào hiệp Pomodoro cho riêng nhiệm vụ này'}
              </div>
              <div className="zen-progress-track" style={{ width: '82%', marginTop: 10 }}>
                <div
                  className="zen-progress-fill"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        ((pomoTotalSeconds - pomoSecondsLeft) / Math.max(1, pomoTotalSeconds)) * 100
                      )
                    )}%`,
                  }}
                />
              </div>
            </div>

            <div className="focus-pomo-controls">
              <button
                type="button"
                className="zen-btn zen-btn-seal btn-large-ceremony"
                onClick={onToggleRun}
              >
                {pomoRunning ? (
                  <>
                    <Pause size={18} />
                    <span>Tạm Dừng Đồng Hồ</span>
                  </>
                ) : (
                  <>
                    <Play size={18} />
                    <span>
                      {pomoSecondsLeft < pomoTotalSeconds
                        ? 'Tiếp Tục Pomodoro'
                        : `Bắt Đầu Pomodoro (${pomoSelectedMins} Phút)`}
                    </span>
                  </>
                )}
              </button>

              <button type="button" className="zen-btn zen-btn-outline" onClick={onResetTimer}>
                <RotateCcw size={15} />
                <span>Đặt Lại</span>
              </button>

              <button
                type="button"
                className="zen-btn zen-btn-outline"
                onClick={onFinishActualSession}
                title="Kết thúc hiệp này và chỉ cộng đúng số phút bạn đã thực sự tập trung vào lịch sử & hồ sơ"
              >
                <Check size={15} />
                <span>
                  {elapsedActualMins > 0
                    ? `Hoàn thành hiệp này (+${elapsedActualMins}p thực tế)`
                    : 'Hoàn thành hiệp này (0p thực tế)'}
                </span>
              </button>
            </div>

            {/* Auto-Break Banner or Quick Break Trigger + Offline Ambient Sound Bar */}
            {breakSecondsLeft !== null ? (
              <div className="focus-break-card">
                <div className="focus-break-top">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Coffee size={18} color="#f0c878" />
                    <strong style={{ color: '#f0c878', fontSize: 14.5 }}>
                      🍵 GIỜ NGHỈ NGẮN PHỤC HỒI ({String(Math.floor(breakSecondsLeft / 60)).padStart(2, '0')}:
                      {String(breakSecondsLeft % 60).padStart(2, '0')})
                    </strong>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="pomo-preset-btn"
                      onClick={() => onStartBreak(5)}
                    >
                      5p
                    </button>
                    <button
                      type="button"
                      className="pomo-preset-btn"
                      onClick={() => onStartBreak(10)}
                    >
                      10p
                    </button>
                    <button
                      type="button"
                      className="zen-btn zen-btn-ghost"
                      style={{ padding: '3px 8px', fontSize: 12 }}
                      onClick={onCancelBreak}
                    >
                      Bỏ qua nghỉ
                    </button>
                  </div>
                </div>
                <div className="zen-progress-track" style={{ height: 5, margin: '8px 0' }}>
                  <div
                    className="zen-progress-fill"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          ((breakTotalSeconds - breakSecondsLeft) / Math.max(1, breakTotalSeconds)) *
                            100
                        )
                      )}%`,
                      background: '#f0c878',
                    }}
                  />
                </div>
                {pinnedOptimizationNotes[0] && (
                  <div className="focus-break-trick">
                    <span>
                      💡 <strong>1 Công Đôi Việc lúc nghỉ:</strong> {pinnedOptimizationNotes[0].title}
                    </span>
                    <button
                      type="button"
                      className="zen-btn zen-btn-outline"
                      style={{ padding: '3px 8px', fontSize: 11.5 }}
                      onClick={() => onApplyOptimizationNote(pinnedOptimizationNotes[0])}
                    >
                      <Zap size={11} /> Áp dụng ngay
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            <div className="focus-ambient-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Volume2 size={14} color="#A8D8C6" />
                <span style={{ fontSize: 12, color: '#B8B4A9' }}>Âm thanh nền:</span>
                {(
                  [
                    { id: 'OFF', label: 'Tắt' },
                    { id: 'RAIN', label: '🌧️ Mưa rơi' },
                    { id: 'STREAM', label: '🌊 Suối chảy' },
                    { id: 'FIRE', label: '🔥 Lò sưởi' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`pomo-preset-btn ${ambientMode === item.id ? 'active' : ''}`}
                    style={{ fontSize: 11.5, padding: '3px 8px' }}
                    onClick={() => onChangeAmbientMode(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
                {ambientMode !== 'OFF' && (
                  <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={ambientVolume}
                    onChange={(e) => onChangeAmbientVolume(Number(e.target.value))}
                    style={{ width: 72, accentColor: '#5BAE93' }}
                    title={`Âm lượng nền: ${Math.round(ambientVolume * 100)}%`}
                  />
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {breakSecondsLeft === null && (
                  <button
                    type="button"
                    className="pomo-preset-btn"
                    style={{ fontSize: 11.5 }}
                    onClick={() => onStartBreak(5)}
                    title="Bắt đầu đồng hồ nghỉ 5 phút kèm gợi ý Bí Kíp"
                  >
                    🍵 Nghỉ 5p
                  </button>
                )}
                <span style={{ fontSize: 11, color: '#8e8a7e' }}>
                  Phím tắt: <code>Space</code> Chạy/Dừng &bull; <code>Esc</code> Thoát bảo lưu
                </span>
              </div>
            </div>
          </div>

          {/* Task Working Notes */}
          <div style={{ marginTop: 18 }}>
            <label
              style={{
                fontSize: 13,
                color: '#A8D8C6',
                fontWeight: 700,
                display: 'block',
                marginBottom: 6,
              }}
            >
              📝 Ghi chú thực hiện / Các bước nhỏ trong lúc làm Todo này (Tự động lưu vào lịch sử Đỉnh Núi):
            </label>
            <textarea
              className="zen-textarea"
              rows={4}
              style={{ width: '100%' }}
              placeholder="Ghi lại dàn ý, từ vựng vừa học, hoặc tiến độ giải quyết nhiệm vụ này..."
              value={focusedStrike.notes || ''}
              onChange={(e) => onUpdateNotes(focusedStrike.id, e.target.value)}
            />
          </div>

          {/* Quick Optimization Idea Capture & Pinned Tricks */}
          <div className="focus-quick-opt-box">
            <div className="focus-quick-opt-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Lightbulb size={16} color="#f0c878" />
                <strong style={{ fontSize: 13.5, color: '#F6F4EE' }}>
                  💡 Ý tưởng tối ưu / Cách học nhanh vừa nảy ra (Sổ Bí Kíp)
                </strong>
              </div>
              <button
                type="button"
                className="zen-btn zen-btn-outline"
                style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={() => setQuickIdeaOpen((v) => !v)}
              >
                <Plus size={13} />
                <span>{quickIdeaOpen ? 'Thu gọn' : 'Note Nhanh Bí Kíp Mới'}</span>
              </button>
            </div>

            {quickIdeaOpen && (
              <div className="focus-quick-opt-form">
                <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 8 }}>
                  <input
                    type="text"
                    className="zen-input"
                    placeholder="Tên mẹo / ý tưởng (VD: Nghỉ giữa hiệp thì nhẩm 5 từ tiếng Trung)..."
                    value={quickIdeaTitle}
                    onChange={(e) => setQuickIdeaTitle(e.target.value)}
                  />
                  <select
                    className="zen-input"
                    value={quickIdeaCategory}
                    onChange={(e) => setQuickIdeaCategory(e.target.value as OptimizationCategory)}
                  >
                    <option value="COMBO_TIME_SAVER">⚡ 1 Công Đôi Việc</option>
                    <option value="LEARNING_HACK">🧠 Cách Học Nhanh</option>
                    <option value="LIFE_TRICK">🛠️ Trick Cuộc Sống</option>
                    <option value="IDEA_INSIGHT">💡 Ý Tưởng Mới</option>
                  </select>
                </div>
                <textarea
                  className="zen-textarea"
                  rows={2}
                  style={{ width: '100%' }}
                  placeholder="Mô tả ngắn cách làm để áp dụng cho các lần sau..."
                  value={quickIdeaContent}
                  onChange={(e) => setQuickIdeaContent(e.target.value)}
                />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    className="zen-input"
                    style={{ flex: 1 }}
                    placeholder="Tiết kiệm được gì? (VD: Tiết kiệm 30p/ngày)"
                    value={quickIdeaSavedHint}
                    onChange={(e) => setQuickIdeaSavedHint(e.target.value)}
                  />
                  <button
                    type="button"
                    className="zen-btn zen-btn-seal"
                    style={{ padding: '6px 12px', fontSize: 12.5 }}
                    onClick={() => {
                      if (!quickIdeaTitle.trim()) return;
                      onSaveQuickOptimizationNote({
                        title: quickIdeaTitle.trim(),
                        content: quickIdeaContent.trim() || quickIdeaTitle.trim(),
                        category: quickIdeaCategory,
                        timeSavedHint: quickIdeaSavedHint.trim() || undefined,
                      });
                      setQuickIdeaTitle('');
                      setQuickIdeaContent('');
                      setQuickIdeaSavedHint('');
                      setQuickIdeaOpen(false);
                    }}
                  >
                    <Check size={14} /> Lưu vào Sổ Bí Kíp
                  </button>
                </div>
              </div>
            )}

            {pinnedOptimizationNotes.length > 0 && (
              <div className="focus-pinned-opt-strip">
                {pinnedOptimizationNotes.slice(0, 3).map((note) => (
                  <div key={note.id} className="focus-pinned-opt-chip">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <strong>⚡ {note.title}</strong>
                      {note.timeSavedHint && (
                        <small style={{ color: '#A8D8C6', marginLeft: 6 }}>
                          ({note.timeSavedHint})
                        </small>
                      )}
                    </div>
                    <button
                      type="button"
                      className="zen-btn zen-btn-outline"
                      style={{ padding: '3px 8px', fontSize: 11 }}
                      onClick={() => onApplyOptimizationNote(note)}
                    >
                      <Zap size={11} /> Áp dụng (+1)
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live PoW Toggle, Photo Upload & Complete Action */}
        <div className="focus-chamber-right">
          <div className="focus-pow-card">
            <div className="focus-pow-header">
              <div>
                <span className="zen-tag-red">BẰNG CHỨNG HOÀN THÀNH (LIVE PoW)</span>
                <h3 style={{ marginTop: 6, fontSize: 18 }}>
                  📷 Ảnh Minh Chứng & Lưu Trữ Tàng Kinh Các
                </h3>
              </div>

              <button
                type="button"
                className={`pow-toggle-switch ${focusedStrike.requiresPhoto ? 'on' : 'off'}`}
                onClick={() => onToggleRequiresPhoto(focusedStrike.id)}
              >
                {focusedStrike.requiresPhoto ? (
                  <>
                    <ToggleRight size={22} color="#66bb6a" />
                    <span>Live PoW: ĐANG BẬT</span>
                  </>
                ) : (
                  <>
                    <ToggleLeft size={22} color="#B8B4A9" />
                    <span>Live PoW: ĐANG TẮT</span>
                  </>
                )}
              </button>
            </div>

            <p className="zen-muted-text" style={{ fontSize: 13, marginTop: 6 }}>
              {focusedStrike.requiresPhoto
                ? 'Nhiệm vụ này đang BẬT yêu cầu ảnh bằng chứng. Bạn có thể thoải mái tải ảnh từ máy tính, kéo thả hoặc bấm Ctrl+V dán ảnh chụp màn hình.'
                : 'Nhiệm vụ này đang TẮT bắt buộc ảnh. Bạn vẫn có thể tải ảnh lên bất cứ lúc nào nếu muốn lưu kỷ niệm nỗ lực vào Tàng Kinh Các.'}
            </p>

            <button
              type="button"
              className="zen-btn zen-btn-seal"
              style={{ width: '100%', marginTop: 14, padding: '12px' }}
              onClick={() => onOpenProofModal(focusedStrike, false)}
            >
              <Upload size={17} />
              <span>Tải Ảnh Bằng Chứng Lên (Chọn File / Kéo Thả / Dán Ctrl+V)</span>
            </button>

            <div className="focus-uploaded-photos-list" style={{ marginTop: 16 }}>
              {focusedStrike.proofPhotosList && focusedStrike.proofPhotosList.length > 0 ? (
                focusedStrike.proofPhotosList.map((p, idx) => {
                  const imgSrc = resolveProofImageUrl(p.uri);
                  return (
                    <div key={p.id} className="focus-photo-item">
                      <img
                        src={imgSrc}
                        alt={p.caption}
                        onClick={() =>
                          onZoomPhoto({
                            uri: imgSrc,
                            title: focusedStrike.title,
                            caption: p.caption,
                            dateStr: new Date(p.capturedAt).toLocaleString('vi-VN'),
                          })
                        }
                        style={{ cursor: 'pointer' }}
                      />
                      <div className="focus-photo-meta">
                        <strong>
                          Ảnh #{idx + 1} &bull; {new Date(p.capturedAt).toLocaleTimeString('vi-VN')}
                        </strong>
                        <p>“{p.caption}”</p>
                      </div>
                    </div>
                  );
                })
              ) : focusedStrike.proofPhotoUri ? (
                (() => {
                  const imgSrc = resolveProofImageUrl(focusedStrike.proofPhotoUri);
                  return (
                    <div className="focus-photo-item">
                      <img
                        src={imgSrc}
                        alt={focusedStrike.title}
                        onClick={() =>
                          onZoomPhoto({
                            uri: imgSrc,
                            title: focusedStrike.title,
                            caption: focusedStrike.proofPhotoCaption || focusedStrike.title,
                            dateStr: focusedStrike.date,
                          })
                        }
                        style={{ cursor: 'pointer' }}
                      />
                      <div className="focus-photo-meta">
                        <strong>Ảnh bằng chứng đã nghiệm thu</strong>
                        <p>{focusedStrike.proofPhotoCaption || focusedStrike.title}</p>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="focus-no-photo-box">
                  <ImageIcon size={28} color="#9E9A8E" />
                  <span>Chưa có ảnh bằng chứng nào cho nhiệm vụ này.</span>
                </div>
              )}
            </div>
          </div>

          <div className="focus-complete-box">
            {focusedStrike.status === 'COMPLETED' ? (
              <div className="focus-already-done-banner">
                <WoodblockSealSvg
                  topText="CÔNG PHÁ"
                  middleText="ĐÃ XONG"
                  bottomText="GHI SỔ"
                  size={64}
                />
                <div>
                  <strong style={{ color: '#81c784', fontSize: 16 }}>
                    ✓ Nhiệm vụ này đã hoàn thành!
                  </strong>
                  <p style={{ fontSize: 12.5, color: '#B8B4A9', marginTop: 4 }}>
                    Đã được lưu vĩnh viễn vào lịch sử của: <strong>{focusContextTitle}</strong>.
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  className="zen-btn zen-btn-seal btn-large-ceremony"
                  style={{ width: '100%', padding: '15px 20px', fontSize: 16 }}
                  onClick={() => onCompleteStrikeAction(focusedStrike)}
                >
                  <CheckCircle2 size={20} />
                  <span>
                    {focusedStrike.requiresPhoto &&
                    !focusedStrike.proofPhotoUri &&
                    (!focusedStrike.proofPhotosList || focusedStrike.proofPhotosList.length === 0)
                      ? 'Tải Ảnh Bằng Chứng & Hoàn Thành Todo Này'
                      : 'Đóng Ấn Hoàn Thành Nhiệm Vụ Công Phá Này'}
                  </span>
                </button>
                <p className="zen-muted-text" style={{ fontSize: 12, marginTop: 8, textAlign: 'center' }}>
                  {elapsedActualMins > 0
                    ? `Khi đóng ấn hoàn thành ngay bây giờ, hệ thống sẽ chốt đúng ${
                        (focusedStrike.completedPomodoroMins || 0) + elapsedActualMins
                      } phút tập trung thực tế (${focusedStrike.completedPomodoroMins || 0}p đã lưu + ${elapsedActualMins}p hiệp hiện tại) vào lịch sử.`
                    : `Tổng thời gian tập trung đã ghi nhận: ${focusedStrike.completedPomodoroMins || 0} phút.`}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
