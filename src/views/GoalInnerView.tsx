import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Camera,
  Check,
  CheckSquare,
  Clock,
  Edit2,
  Eye,
  Flame,
  History,
  Play,
  Plus,
  Sparkles,
  Square,
  Target,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  DailyStrikeTodoEntity,
  MonkDatabaseSchema,
  PeakGoalEntity,
  ReflectionJournalEntity,
  TodoActivityType,
} from '../types/models';
import { resolveProofImageUrl } from '../services/desktopBridge';
import { analyzeReflectionText } from '../utils/proofOfWork';
import { RitualsView } from './RitualsView';
import { TabPurposeBanner } from '../components/TabPurposeBanner';
import {
  ACTIVITY_TYPE_META,
  ALL_ACTIVITY_TYPES,
  inferTodoActivityType,
} from '../services/timeAuditEngine';

export type InnerGoalTab = 'DAILY_STRIKES' | 'REFLECTION' | 'MOUNTAIN_HISTORY' | 'RITUALS';

interface GoalInnerViewProps {
  db: MonkDatabaseSchema;
  selectedGoal: PeakGoalEntity;
  innerTab: InnerGoalTab;
  todayStr: string;
  nowTick: number;
  remainingTaskMods: number;
  maxDailyTaskMods: number;
  ritualStatsToday: { totalItems: number; completedItems: number; pct: number; groupCount: number };
  draggingRitualItem: { groupId: string; itemId: string; itemIndex: number } | null;
  dragOverTargetIndex: { groupId: string; itemIndex: number } | null;
  onChangeInnerTab: (tab: InnerGoalTab) => void;
  onPersistDb: (updater: (prev: MonkDatabaseSchema) => MonkDatabaseSchema) => void;
  onToggleMilestone: (goalId: string, milestoneId: string) => void;
  onQuickAddChecklistItem: (goalId: string, rawTitle: string) => void;
  onDeleteChecklistItem: (goalId: string, itemId: string) => void;
  onEnterFocusStrike: (strike: DailyStrikeTodoEntity) => void;
  onCompleteStrikeAction: (strike: DailyStrikeTodoEntity) => void;
  onToggleStrikeRequiresPhoto: (strikeId: string) => void;
  onOpenProofModal: (strike: DailyStrikeTodoEntity, markCompleteAfterProof: boolean) => void;
  onRequestEditStrike: (strike: DailyStrikeTodoEntity) => void;
  onRequestDeleteStrike: (strike: DailyStrikeTodoEntity) => void;
  onLaunchConquerCeremony: (goal: PeakGoalEntity) => void;
  onZoomPhoto: (photo: { uri: string; title: string; caption: string; dateStr: string }) => void;
  onPlayWoodenFish: (volume?: number) => void;
  onPlayWoodblockStamp: () => void;
  onShowMessage: (title: string, msg: string, type?: 'danger' | 'info' | 'seal') => void;
  onRequestDeleteRitualGroup: (group: { id: string; title: string; items: unknown[] }) => void;
  onDragStartRitualItem: (
    groupId: string,
    itemId: string,
    itemIndex: number,
    e: React.DragEvent
  ) => void;
  onDragOverRitualItem: (groupId: string, itemIndex: number, e: React.DragEvent) => void;
  onDropRitualItem: (groupId: string, targetIndex: number, e: React.DragEvent) => void;
  onDragEndRitualItem: () => void;
  onMoveRitualItem: (groupId: string, fromIndex: number, direction: 'UP' | 'DOWN') => void;
}

export const GoalInnerView: React.FC<GoalInnerViewProps> = ({
  db,
  selectedGoal,
  innerTab,
  todayStr,
  nowTick,
  remainingTaskMods,
  maxDailyTaskMods,
  ritualStatsToday,
  draggingRitualItem,
  dragOverTargetIndex,
  onChangeInnerTab,
  onPersistDb,
  onToggleMilestone,
  onQuickAddChecklistItem,
  onDeleteChecklistItem,
  onEnterFocusStrike,
  onCompleteStrikeAction,
  onToggleStrikeRequiresPhoto,
  onOpenProofModal,
  onRequestEditStrike,
  onRequestDeleteStrike,
  onLaunchConquerCeremony,
  onZoomPhoto,
  onPlayWoodenFish,
  onPlayWoodblockStamp,
  onShowMessage,
  onRequestDeleteRitualGroup,
  onDragStartRitualItem,
  onDragOverRitualItem,
  onDropRitualItem,
  onDragEndRitualItem,
  onMoveRitualItem,
}) => {
  const [quickChecklistInput, setQuickChecklistInput] = useState('');
  const [newStrikeTitle, setNewStrikeTitle] = useState('');
  const [newStrikeNotes, setNewStrikeNotes] = useState('');
  const [newStrikePomo, setNewStrikePomo] = useState(25);
  const [newStrikeRequiresPhoto, setNewStrikeRequiresPhoto] = useState(true);
  const [customNewActivityType, setCustomNewActivityType] = useState<TodoActivityType | null>(null);
  const [strikeFilterMode, setStrikeFilterMode] = useState<'TODAY_AND_PENDING' | 'ALL_HISTORY'>(
    'TODAY_AND_PENDING'
  );

  const [journalDraft, setJournalDraft] = useState('');
  const [repentanceDraft, setRepentanceDraft] = useState('');
  const [focusRatingDraft, setFocusRatingDraft] = useState(5);

  const goalsMap = useMemo(() => new Map([[selectedGoal.id, selectedGoal]]), [selectedGoal]);
  const defaultGoalActivityType = useMemo(
    () => inferTodoActivityType({ goalId: selectedGoal.id, title: newStrikeTitle }, goalsMap),
    [selectedGoal.id, newStrikeTitle, goalsMap]
  );
  const effectiveNewActivityType = customNewActivityType || defaultGoalActivityType;

  const journalAnalysis = useMemo(() => analyzeReflectionText(journalDraft), [journalDraft]);

  const handleSubmitJournal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!journalDraft.trim()) {
      onShowMessage(
        'CHƯA NHẬP NỘI DUNG TỰ VẤN',
        'Hãy viết lại những suy ngẫm, bài học và nỗ lực của bạn trong ngày trước khi lưu.',
        'danger'
      );
      return;
    }
    const entry: ReflectionJournalEntity = {
      id: `journal-${Date.now()}`,
      sessionId: db.session.id,
      goalId: selectedGoal.id,
      date: todayStr,
      content: journalDraft.trim(),
      validWordCount: journalAnalysis.validWordCount,
      lexicalDiversityScore: journalAnalysis.lexicalDiversityScore,
      submittedAt: Date.now(),
      focusRating: focusRatingDraft,
      repentanceNote:
        repentanceDraft.trim() || 'Giữ vững kỷ luật, tiến thêm một bước vững chắc tới đỉnh núi.',
    };
    onPlayWoodblockStamp();
    onPersistDb((prev) => ({
      ...prev,
      reflectionJournals: [entry, ...prev.reflectionJournals],
    }));
    setJournalDraft('');
    setRepentanceDraft('');
    onShowMessage(
      '✍️ ĐÃ LƯU NHẬT KÝ TỰ VẤN VÀO LỊCH SỬ ĐỈNH NÚI',
      `Bản ghi Tự Vấn (${entry.validWordCount} từ) đã được lưu vĩnh viễn vào hành trình của Đỉnh Núi.`,
      'seal'
    );
  };

  return (
    <>
      {innerTab === 'DAILY_STRIKES' && (
        <section className="module-block">
          <div className="zen-card module-column-card">
            <div className="section-header-row" style={{ marginBottom: 14 }}>
              <div style={{ flex: '1 1 380px', minWidth: 0 }}>
                <span className="zen-tag-red">
                  CÔNG PHÁ TRONG NGÀY — {selectedGoal.title.toUpperCase()}
                </span>
                <h2 className="section-title" style={{ marginTop: 6 }}>
                  ⚔️ Danh Sách To-Do Cần Công Phá (Ấn Vào Từng To-Do Để Tập Trung Pomodoro)
                </h2>
                <TabPurposeBanner
                  purpose="Lên To-Do cụ thể cho Đỉnh Núi này, bấm trực tiếp vào từng To-Do để vào buồng Tập Trung Pomodoro và tự động chấm điểm Quỹ Thời Gian."
                  steps={[
                    'Chọn loại việc & thêm To-Do Công Phá',
                    'Bấm vào To-Do để chạy Pomodoro',
                    'Gửi ảnh PoW (nếu bật) để đóng ấn hoàn thành',
                  ]}
                />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className={`zen-btn ${
                    strikeFilterMode === 'TODAY_AND_PENDING' ? 'zen-btn-seal' : 'zen-btn-outline'
                  }`}
                  style={{ fontSize: 12.5 }}
                  onClick={() => setStrikeFilterMode('TODAY_AND_PENDING')}
                >
                  <Target size={14} /> Hôm nay & Đang thực hiện
                </button>
                <button
                  type="button"
                  className={`zen-btn ${
                    strikeFilterMode === 'ALL_HISTORY' ? 'zen-btn-seal' : 'zen-btn-outline'
                  }`}
                  style={{ fontSize: 12.5 }}
                  onClick={() => setStrikeFilterMode('ALL_HISTORY')}
                >
                  <History size={14} /> Toàn bộ lịch sử Todo của Đỉnh Núi
                </button>
              </div>
            </div>

            {/* GOAL CHECKLIST PANEL */}
            <div className="goal-checklist-panel">
              <div className="goal-checklist-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckSquare size={18} color="#5BAE93" />
                  <h4 className="goal-checklist-title">
                    Checklist Mục Tiêu (
                    {(selectedGoal.milestones || []).filter((m) => m.isCompleted).length}/
                    {(selectedGoal.milestones || []).length} mục — {selectedGoal.progressPct}%)
                  </h4>
                </div>
                <span className="zen-muted-text" style={{ fontSize: 12.5 }}>
                  Tick hoàn thành từng mục tiêu nhỏ để tự động tính % đỉnh núi
                </span>
              </div>

              <div className="zen-progress-track" style={{ marginBottom: 12 }}>
                <div
                  className="zen-progress-fill"
                  style={{ width: `${selectedGoal.progressPct}%` }}
                />
              </div>

              {(selectedGoal.milestones || []).length > 0 ? (
                <div className="goal-checklist-items">
                  {(selectedGoal.milestones || []).map((item) => (
                    <div
                      key={item.id}
                      className={`goal-checklist-row ${item.isCompleted ? 'done' : ''}`}
                      onClick={() => onToggleMilestone(selectedGoal.id, item.id)}
                    >
                      {item.isCompleted ? (
                        <CheckSquare size={18} color="#66bb6a" />
                      ) : (
                        <Square size={18} color="#B8B4A9" />
                      )}
                      <span className="goal-checklist-item-text">{item.title}</span>
                      {item.completedAt && (
                        <span className="goal-checklist-date">
                          ✓ {new Date(item.completedAt).toLocaleDateString('vi-VN')}
                        </span>
                      )}
                      <button
                        type="button"
                        className="zen-btn zen-btn-ghost"
                        style={{ padding: '2px 6px' }}
                        title="Xóa mục checklist này"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteChecklistItem(selectedGoal.id, item.id);
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="zen-muted-text" style={{ fontSize: 13, marginBottom: 10 }}>
                  Chưa có mục nào trong Checklist của mục tiêu này. Hãy thêm checklist các đầu việc
                  cần đạt bên dưới.
                </p>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input
                  type="text"
                  className="zen-input"
                  style={{ flex: 1, padding: '7px 12px', fontSize: 13.5 }}
                  placeholder="+ Thêm đầu việc vào Checklist mục tiêu này (nhấn Enter hoặc bấm Thêm)..."
                  value={quickChecklistInput}
                  onChange={(e) => setQuickChecklistInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (!quickChecklistInput.trim()) return;
                      onQuickAddChecklistItem(selectedGoal.id, quickChecklistInput);
                      setQuickChecklistInput('');
                    }
                  }}
                />
                <button
                  type="button"
                  className="zen-btn zen-btn-outline"
                  onClick={() => {
                    if (!quickChecklistInput.trim()) return;
                    onQuickAddChecklistItem(selectedGoal.id, quickChecklistInput);
                    setQuickChecklistInput('');
                  }}
                >
                  <Plus size={14} /> Thêm Checklist
                </button>
              </div>
            </div>

            {/* Add New Todo Form */}
            <form
              className="inline-add-box"
              style={{ marginTop: 0, marginBottom: 18, borderColor: '#3E8A72' }}
              onSubmit={(e) => {
                e.preventDefault();
                if (!newStrikeTitle.trim()) return;
                const created: DailyStrikeTodoEntity = {
                  id: `strike-${Date.now()}`,
                  goalId: selectedGoal.id,
                  date: todayStr,
                  title: newStrikeTitle.trim(),
                  notes: newStrikeNotes.trim(),
                  activityType: effectiveNewActivityType,
                  status: 'PENDING',
                  requiredPomodoroMins: Math.max(5, newStrikePomo),
                  completedPomodoroMins: 0,
                  pomodoroSessionsCount: 0,
                  requiresPhoto: newStrikeRequiresPhoto,
                  proofPhotoUri: null,
                  proofPhotosList: [],
                  proofAnalysis: null,
                  createdAt: Date.now(),
                };
                onPlayWoodenFish(0.6);
                onPersistDb((prev) => ({
                  ...prev,
                  dailyStrikes: [created, ...prev.dailyStrikes],
                }));
                setNewStrikeTitle('');
                setNewStrikeNotes('');
                setCustomNewActivityType(null);
              }}
            >
              <div className="inline-add-header">
                + Thêm To-Do Công Phá Mới Cho Đỉnh Núi "{selectedGoal.title}":
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.9fr 0.9fr', gap: 10 }}>
                <input
                  type="text"
                  className="zen-input"
                  placeholder="Nhập việc cụ thể cần hoàn thành hôm nay (VD: Viết 1 bài luận HSK 6 đề số 6...)"
                  value={newStrikeTitle}
                  onChange={(e) => setNewStrikeTitle(e.target.value)}
                  required
                />
                <input
                  type="text"
                  className="zen-input"
                  placeholder="Ghi chú bước làm (tùy chọn)..."
                  value={newStrikeNotes}
                  onChange={(e) => setNewStrikeNotes(e.target.value)}
                />
                <select
                  className="zen-input"
                  value={effectiveNewActivityType}
                  onChange={(e) => setCustomNewActivityType(e.target.value as TodoActivityType)}
                  title="Phân loại hoạt động để thống kê Quỹ Thời Gian"
                >
                  {ALL_ACTIVITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ACTIVITY_TYPE_META[t].icon} {ACTIVITY_TYPE_META[t].shortLabel}
                    </option>
                  ))}
                </select>
              </div>

              <div className="inline-add-controls">
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Flame size={14} color="#A8D8C6" />
                    <span>Thời lượng Pomodoro (phút):</span>
                    <input
                      type="number"
                      className="zen-input"
                      style={{ width: 72, padding: '5px 8px' }}
                      min={5}
                      max={180}
                      value={newStrikePomo}
                      onChange={(e) => setNewStrikePomo(Number(e.target.value))}
                    />
                  </label>

                  <button
                    type="button"
                    className={`pow-toggle-switch ${newStrikeRequiresPhoto ? 'on' : 'off'}`}
                    onClick={() => setNewStrikeRequiresPhoto((v) => !v)}
                  >
                    {newStrikeRequiresPhoto ? (
                      <>
                        <ToggleRight size={20} color="#66bb6a" />
                        <span>Live PoW (Yêu cầu ảnh bằng chứng): BẬT</span>
                      </>
                    ) : (
                      <>
                        <ToggleLeft size={20} color="#B8B4A9" />
                        <span>Live PoW (Yêu cầu ảnh bằng chứng): TẮT</span>
                      </>
                    )}
                  </button>
                </div>

                <button type="submit" className="zen-btn zen-btn-seal">
                  <Plus size={16} />
                  <span>Thêm Vào Danh Sách Công Phá</span>
                </button>
              </div>
            </form>

            {/* Daily Modification Quota Badge */}
            <div className="task-mods-quota-badge">
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <AlertTriangle
                  size={15}
                  color={remainingTaskMods > 0 ? '#5BAE93' : '#ff5252'}
                />
                <span>
                  Hạn ngạch sửa tên / hủy Todo hôm nay:{' '}
                  <strong
                    style={{
                      color: remainingTaskMods > 0 ? '#5BAE93' : '#ff5252',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {remainingTaskMods}/{maxDailyTaskMods} lượt
                  </strong>
                </span>
              </div>
              <span style={{ color: '#B8B4A9', fontSize: 12 }}>
                (Kỷ luật thép: Giới hạn tối đa {maxDailyTaskMods} lần/ngày để tránh việc tạo bừa rồi
                trốn tránh)
              </span>
            </div>

            {/* List of Strikes */}
            <div className="rituals-list">
              {db.dailyStrikes
                .filter((s) => {
                  if (s.goalId !== selectedGoal.id) return false;
                  if (strikeFilterMode === 'TODAY_AND_PENDING') {
                    return s.date === todayStr || s.status !== 'COMPLETED';
                  }
                  return true;
                })
                .map((strike) => {
                  const isDone = strike.status === 'COMPLETED';
                  const hasPhoto =
                    Boolean(strike.proofPhotoUri) ||
                    Boolean(strike.proofPhotosList && strike.proofPhotosList.length > 0);
                  const resolvedThumb = resolveProofImageUrl(strike.proofPhotoUri);
                  const actType = inferTodoActivityType(strike, goalsMap);
                  const actMeta = ACTIVITY_TYPE_META[actType];

                  return (
                    <div
                      key={strike.id}
                      className={`task-interactive-row clickable-strike-row ${
                        isDone ? 'row-completed' : ''
                      }`}
                      onClick={() => onEnterFocusStrike(strike)}
                    >
                      <div
                        className="task-check-col"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCompleteStrikeAction(strike);
                        }}
                      >
                        <button
                          type="button"
                          className={`checkbox-square-btn ${isDone ? 'checked' : ''}`}
                          title={
                            isDone
                              ? 'Đã hoàn thành (Bấm để mở lại nếu cần)'
                              : strike.requiresPhoto && !hasPhoto
                              ? 'Bấm để tải ảnh bằng chứng & hoàn thành'
                              : 'Bấm để đánh dấu hoàn thành'
                          }
                        >
                          {isDone ? <CheckSquare size={22} /> : <Square size={22} />}
                        </button>
                      </div>

                      <div className="task-body-col">
                        <div className="ritual-meta-tags">
                          <span
                            className="activity-type-pill"
                            style={{ borderColor: actMeta.color, color: actMeta.color }}
                          >
                            {actMeta.icon} {actMeta.shortLabel}
                          </span>
                          <span className="time-window-pill">Ngày: {strike.date}</span>
                          {strike.scheduledTime && (
                            <span className="time-window-pill" style={{ borderColor: '#f0c878', color: '#f0c878' }}>
                              ⏰ Khung giờ: {strike.scheduledTime}
                            </span>
                          )}
                          <span className="pomo-pill">
                            <Flame size={12} /> Mục tiêu: {strike.requiredPomodoroMins}p &bull; Thực tế:{' '}
                            {strike.completedPomodoroMins || 0}p
                          </span>
                          {strike.savedPomoSecondsLeft != null &&
                            strike.savedPomoTotalSeconds != null &&
                            strike.savedPomoSecondsLeft < strike.savedPomoTotalSeconds && (
                              <span
                                className="time-window-pill"
                                style={{
                                  borderColor: '#ffb74d',
                                  color: '#ffe0b2',
                                  background: 'rgba(255, 152, 0, 0.16)',
                                }}
                              >
                                ⏸ Đang bảo lưu:{' '}
                                {String(Math.floor(strike.savedPomoSecondsLeft / 60)).padStart(2, '0')}:
                                {String(strike.savedPomoSecondsLeft % 60).padStart(2, '0')} /{' '}
                                {strike.savedPomoSelectedMins || Math.round(strike.savedPomoTotalSeconds / 60)}p
                              </span>
                            )}

                          <button
                            type="button"
                            className={`pow-pill-toggle ${
                              strike.requiresPhoto ? 'pow-on' : 'pow-off'
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleStrikeRequiresPhoto(strike.id);
                            }}
                            title="Bấm để Bật / Tắt yêu cầu ảnh bằng chứng (Live PoW) cho Todo này"
                          >
                            <Camera size={12} />
                            <span>Live PoW: {strike.requiresPhoto ? 'BẬT' : 'TẮT'}</span>
                          </button>

                          {hasPhoto && (
                            <span
                              className="time-window-pill"
                              style={{
                                borderColor: '#4caf50',
                                color: '#81c784',
                                background: 'rgba(76, 175, 80, 0.15)',
                              }}
                            >
                              ✓ Đã có ảnh bằng chứng
                            </span>
                          )}
                        </div>

                        <div
                          className="task-row-title"
                          style={{
                            textDecoration: isDone ? 'line-through' : 'none',
                            color: isDone ? '#9E9A8E' : '#F6F4EE',
                          }}
                        >
                          {strike.title}
                        </div>

                        {strike.notes && (
                          <div
                            style={{
                              fontSize: 12.5,
                              color: '#B8B4A9',
                              marginTop: 4,
                              whiteSpace: 'pre-line',
                            }}
                          >
                            {strike.notes}
                          </div>
                        )}

                        {isDone && strike.completedAt && (
                          <div className="task-done-caption">
                            ✓ Đã hoàn thành & lưu vào lịch sử Đỉnh Núi lúc{' '}
                            {new Date(strike.completedAt).toLocaleString('vi-VN')}
                          </div>
                        )}

                        {resolvedThumb && (
                          <div
                            className="inline-proof-thumb"
                            onClick={(e) => {
                              e.stopPropagation();
                              onZoomPhoto({
                                uri: resolvedThumb,
                                title: strike.title,
                                caption: strike.proofPhotoCaption || strike.title,
                                dateStr: strike.date,
                              });
                            }}
                          >
                            <img src={resolvedThumb} alt={strike.title} />
                            <div>
                              <strong style={{ color: '#A8D8C6' }}>
                                📷 Ảnh bằng chứng đã lưu Tàng Kinh Các
                              </strong>
                              <div style={{ fontSize: 12, color: '#d0ccc0' }}>
                                “{strike.proofPhotoCaption || strike.title}”
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="task-actions-col" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="zen-btn zen-btn-seal"
                          style={{ padding: '7px 12px', fontSize: 12.5 }}
                          onClick={() => onEnterFocusStrike(strike)}
                        >
                          <Play size={14} />
                          <span>
                            {strike.savedPomoSecondsLeft != null &&
                            strike.savedPomoTotalSeconds != null &&
                            strike.savedPomoSecondsLeft < strike.savedPomoTotalSeconds
                              ? 'Tiếp Tục Pomodoro Đã Lưu'
                              : 'Vào Tập Trung Pomodoro'}
                          </span>
                        </button>

                        <button
                          type="button"
                          className="zen-btn zen-btn-outline"
                          style={{ padding: '6px 10px', fontSize: 12 }}
                          onClick={() => onOpenProofModal(strike, !isDone)}
                        >
                          <Upload size={13} />
                          <span>{hasPhoto ? 'Thêm / Đổi Ảnh PoW' : 'Up Ảnh PoW'}</span>
                        </button>

                        <button
                          type="button"
                          className="zen-btn zen-btn-ghost"
                          style={{ padding: '6px 9px', fontSize: 12 }}
                          title={
                            remainingTaskMods > 0
                              ? `Sửa tiêu đề / Pomodoro (Còn ${remainingTaskMods}/${maxDailyTaskMods} lượt hôm nay)`
                              : `Đã hết lượt sửa/hủy hôm nay (0/${maxDailyTaskMods})`
                          }
                          onClick={() => onRequestEditStrike(strike)}
                        >
                          <Edit2 size={13} />
                          <span>Sửa</span>
                        </button>

                        <button
                          type="button"
                          className="zen-btn zen-btn-ghost"
                          style={{ padding: '6px 9px', color: '#ff8a80' }}
                          title={
                            remainingTaskMods > 0
                              ? `Hủy Todo này (Còn ${remainingTaskMods}/${maxDailyTaskMods} lượt hôm nay)`
                              : `Đã hết lượt sửa/hủy hôm nay (0/${maxDailyTaskMods})`
                          }
                          onClick={() => onRequestDeleteStrike(strike)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </section>
      )}

      {innerTab === 'REFLECTION' && (
        <section className="module-block">
          <div className="reflection-layout">
            <div className="zen-card reflection-editor-card">
              <div className="section-header-row" style={{ marginBottom: 12 }}>
                <div>
                  <span className="zen-tag-red">
                    NHẬT KÝ TỰ VẤN — GẮN VỚI ĐỈNH NÚI: {selectedGoal.title.toUpperCase()}
                  </span>
                  <h2 className="section-title" style={{ marginTop: 6 }}>
                    ✍️ Tự Vấn & Đúc Kết Hành Trình Leo Núi Mỗi Ngày
                  </h2>
                  <p className="zen-muted-text" style={{ fontSize: 13 }}>
                    Mọi dòng Tự Vấn bạn viết tại đây đều được lưu trữ vĩnh viễn trong hồ sơ lịch sử
                    của Đỉnh Núi <strong>"{selectedGoal.title}"</strong> và xuất hiện trong Tàng
                    Kinh Các khi bạn chạm đỉnh.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmitJournal}>
                <textarea
                  className="zen-textarea reflection-textarea"
                  rows={6}
                  placeholder={`Hôm nay bạn đã nỗ lực như thế nào cho mục tiêu "${selectedGoal.title}"? Có khoảnh khắc nào bạn chiến thắng sự lười biếng của bản thân? Ngày mai bạn cam kết sẽ làm gì tốt hơn?`}
                  value={journalDraft}
                  onChange={(e) => setJournalDraft(e.target.value)}
                />

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 12,
                    marginTop: 10,
                    alignItems: 'center',
                  }}
                >
                  <input
                    type="text"
                    className="zen-input"
                    placeholder="Bài học cốt lõi / Lời hứa cho ngày mai..."
                    value={repentanceDraft}
                    onChange={(e) => setRepentanceDraft(e.target.value)}
                  />
                  <label style={{ fontSize: 13, color: '#B8B4A9' }}>
                    Độ tập trung:{' '}
                    <select
                      className="zen-input"
                      value={focusRatingDraft}
                      onChange={(e) => setFocusRatingDraft(Number(e.target.value))}
                    >
                      <option value={5}>5/5 ⭐ — Tuyệt đối tập trung</option>
                      <option value={4}>4/5 ⭐ — Tập trung tốt</option>
                      <option value={3}>3/5 ⭐ — Đạt yêu cầu</option>
                      <option value={2}>2/5 ⭐ — Còn xao nhãng</option>
                      <option value={1}>1/5 ⭐ — Cần nghiêm khắc chấn chỉnh</option>
                    </select>
                  </label>
                </div>

                <div className="lexical-inspector-bar">
                  <div className="lexical-metric">
                    <span>Số từ đã viết:</span>
                    <strong style={{ color: '#81c784' }}>{journalAnalysis.validWordCount} từ</strong>
                  </div>
                  <div className="lexical-metric">
                    <span>Độ sâu từ vựng (Lexical Diversity):</span>
                    <strong>{journalAnalysis.lexicalDiversityScore}</strong>
                  </div>
                </div>

                <div className="reflection-actions-row">
                  <button
                    type="button"
                    className="zen-btn zen-btn-outline"
                    onClick={() => {
                      setJournalDraft(
                        `Hôm nay trên hành trình chinh phục "${selectedGoal.title}", tôi đã hoàn thành nghiêm túc các phiên tập trung Pomodoro mà không để bản thân bị cuốn vào sự trì hoãn. Nhìn vào những bức ảnh bằng chứng thực tế vừa tải lên, tôi hiểu rằng thành quả lớn luôn được kết tinh từ những giờ phút âm thầm nỗ lực như thế này. Tương lai nhìn lại chắc chắn tôi sẽ mỉm cười biết ơn ngày hôm nay.`
                      );
                      setRepentanceDraft(
                        'Giữ vững 100% kỷ luật, ngày mai tiếp tục công phá đúng kế hoạch.'
                      );
                    }}
                  >
                    <Sparkles size={15} />
                    <span>Gợi ý mẫu Tự Vấn sâu sắc</span>
                  </button>

                  <div style={{ flex: 1 }} />

                  <button type="submit" className="zen-btn zen-btn-seal">
                    <Check size={16} />
                    <span>Đóng Ấn Lưu Tự Vấn Vào Lịch Sử Đỉnh Núi</span>
                  </button>
                </div>
              </form>
            </div>

            <div className="zen-card reflection-history-card">
              <h3>
                Nhật Trình Tự Vấn Của Đỉnh Núi Này (
                {
                  db.reflectionJournals.filter(
                    (j) => !j.goalId || j.goalId === selectedGoal.id
                  ).length
                }{' '}
                bài)
              </h3>
              <div className="journal-history-list">
                {db.reflectionJournals
                  .filter((j) => !j.goalId || j.goalId === selectedGoal.id)
                  .map((j) => (
                    <div key={j.id} className="journal-history-item">
                      <div className="journal-item-header">
                        <strong>Ngày {j.date}</strong>
                        <span className="zen-tag-red">
                          {j.validWordCount} từ &bull; Tập trung: {j.focusRating}/5 ⭐
                        </span>
                      </div>
                      <p>{j.content}</p>
                      <div className="journal-item-footer">
                        <span>{j.repentanceNote}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {innerTab === 'MOUNTAIN_HISTORY' && (
        <section className="module-block">
          <div className="zen-card">
            <div className="section-header-row">
              <div>
                <span className="zen-tag-red">
                  SỔ GHI CHÉP HÀNH TRÌNH & DÒNG THỜI GIAN BẰNG CHỨNG (TIMELINE)
                </span>
                <h2 className="section-title" style={{ marginTop: 6 }}>
                  🏔️ Toàn Bộ Lịch Sử Nỗ Lực Chinh Phục: {selectedGoal.title}
                </h2>
                <p className="zen-muted-text">
                  Mọi việc bạn đã làm, mọi bức ảnh bằng chứng bạn đã tải lên và mọi mục trong
                  Checklist trên ngọn núi này đều được lưu giữ nguyên vẹn theo dòng thời gian. Khi
                  bạn chinh phục xong ngọn núi, toàn bộ hồ sơ này sẽ được đóng dấu Mộc Đỏ Chu Sa vào{' '}
                  <strong>Tàng Kinh Các</strong>.
                </p>
              </div>

              <button
                type="button"
                className="zen-btn zen-btn-seal btn-large-ceremony"
                onClick={() => onLaunchConquerCeremony(selectedGoal)}
              >
                <Award size={18} />
                <span>🏆 Đóng Dấu Chinh Phục Đỉnh Núi & Lưu Vào Tàng Kinh Các</span>
              </button>
            </div>

            <div className="history-sub-block">
              <h3 style={{ color: '#A8D8C6', marginBottom: 10 }}>
                1. Checklist Mục Tiêu ({selectedGoal.progressPct}% Hoàn Thành)
              </h3>
              {(selectedGoal.milestones || []).length === 0 ? (
                <p className="zen-muted-text" style={{ fontSize: 13.5 }}>
                  Ngọn núi này chưa tạo mục nào trong Checklist. Bạn có thể thêm ở tab Công Phá hoặc
                  Sửa Ngọn Núi.
                </p>
              ) : (
                <div className="milestones-interactive-grid">
                  {(selectedGoal.milestones || []).map((m) => (
                    <div
                      key={m.id}
                      className={`milestone-card-box ${m.isCompleted ? 'done' : ''}`}
                      onClick={() => onToggleMilestone(selectedGoal.id, m.id)}
                    >
                      {m.isCompleted ? (
                        <CheckSquare size={20} color="#66bb6a" />
                      ) : (
                        <Square size={20} color="#B8B4A9" />
                      )}
                      <div>
                        <strong>{m.title}</strong>
                        {m.completedAt && (
                          <div style={{ fontSize: 11.5, color: '#81c784', marginTop: 2 }}>
                            ✓ Đạt được ngày {new Date(m.completedAt).toLocaleDateString('vi-VN')}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="history-sub-block" style={{ marginTop: 24 }}>
              <h3 style={{ color: '#A8D8C6', marginBottom: 10 }}>
                2. Dòng Thời Gian Ảnh Bằng Chứng Nỗ Lực (Visual Proof Timeline)
              </h3>
              {(() => {
                const goalStrikes = db.dailyStrikes.filter((s) => s.goalId === selectedGoal.id);
                const photos: Array<{
                  id: string;
                  uri: string;
                  taskTitle: string;
                  caption: string;
                  date: string;
                  timestamp: number;
                  pomoMins: number;
                }> = [];
                for (const s of goalStrikes) {
                  if (s.proofPhotosList && s.proofPhotosList.length > 0) {
                    for (const p of s.proofPhotosList) {
                      photos.push({
                        id: p.id,
                        uri: resolveProofImageUrl(p.uri),
                        taskTitle: s.title,
                        caption: p.caption || s.title,
                        date: s.date,
                        timestamp: p.capturedAt,
                        pomoMins:
                          p.pomodoroMins ?? (s.completedPomodoroMins || 0),
                      });
                    }
                  } else if (s.proofPhotoUri) {
                    photos.push({
                      id: `p-${s.id}`,
                      uri: resolveProofImageUrl(s.proofPhotoUri),
                      taskTitle: s.title,
                      caption: s.proofPhotoCaption || s.title,
                      date: s.date,
                      timestamp: s.completedAt || s.createdAt || nowTick,
                      pomoMins: s.completedPomodoroMins || 0,
                    });
                  }
                }
                photos.sort((a, b) => b.timestamp - a.timestamp);

                if (photos.length === 0) {
                  return (
                    <div className="zen-alert-box alert-warning">
                      <Camera size={18} />
                      <span>
                        Chưa có ảnh bằng chứng nào cho ngọn núi này. Hãy bật Live PoW ở mục Công Phá
                        và tải ảnh lên khi hoàn thành Todo!
                      </span>
                    </div>
                  );
                }

                return (
                  <div className="photo-timeline-grid">
                    {photos.map((p, idx) => (
                      <div
                        key={p.id}
                        className="photo-timeline-card"
                        onClick={() =>
                          onZoomPhoto({
                            uri: p.uri,
                            title: p.taskTitle,
                            caption: p.caption,
                            dateStr: new Date(p.timestamp).toLocaleString('vi-VN'),
                          })
                        }
                      >
                        <div className="pt-card-img-wrap">
                          <img src={p.uri} alt={p.taskTitle} />
                          <span className="pt-step-badge">
                            Mốc #{photos.length - idx} &bull; {p.date}
                          </span>
                        </div>
                        <div className="pt-card-body">
                          <div className="pt-time-str">
                            <Clock size={12} /> {new Date(p.timestamp).toLocaleString('vi-VN')}{' '}
                            &bull; <strong>{p.pomoMins}p Pomodoro</strong>
                          </div>
                          <strong className="pt-task-title">{p.taskTitle}</strong>
                          <p className="pt-caption">“{p.caption}”</p>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div className="history-sub-block" style={{ marginTop: 24 }}>
              <h3 style={{ color: '#A8D8C6', marginBottom: 10 }}>
                3. Sổ Ghi Chép Toàn Bộ Nhiệm Vụ Công Phá Đã Lưu Của Ngọn Núi
              </h3>
              <div className="rituals-list">
                {db.dailyStrikes
                  .filter((s) => s.goalId === selectedGoal.id)
                  .map((s, idx, arr) => (
                    <div
                      key={s.id}
                      className={`task-interactive-row ${
                        s.status === 'COMPLETED' ? 'row-completed' : ''
                      }`}
                    >
                      <div className="task-body-col">
                        <div className="ritual-meta-tags">
                          <span className="zen-tag-red">#{arr.length - idx}</span>
                          <span className="time-window-pill">Ngày: {s.date}</span>
                          <span className="pomo-pill">
                            Thực tế: {s.completedPomodoroMins || 0} phút (Mục tiêu {s.requiredPomodoroMins}p)
                          </span>
                          <span
                            className="time-window-pill"
                            style={{ color: s.status === 'COMPLETED' ? '#81c784' : '#ffd54f' }}
                          >
                            {s.status === 'COMPLETED' ? '✓ ĐÃ HOÀN THÀNH' : 'ĐANG THỰC HIỆN'}
                          </span>
                        </div>
                        <div className="task-row-title">{s.title}</div>
                        {s.notes && (
                          <p style={{ fontSize: 12.5, color: '#B8B4A9', marginTop: 4 }}>
                            Ghi chú: {s.notes}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        className="zen-btn zen-btn-outline"
                        style={{ fontSize: 12 }}
                        onClick={() => {
                          onChangeInnerTab('DAILY_STRIKES');
                          onEnterFocusStrike(s);
                        }}
                      >
                        <Eye size={14} /> Chi tiết
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {innerTab === 'RITUALS' && (
        <RitualsView
          db={db}
          todayStr={todayStr}
          ritualStatsToday={ritualStatsToday}
          draggingRitualItem={draggingRitualItem}
          dragOverTargetIndex={dragOverTargetIndex}
          onPersistDb={onPersistDb}
          onPlayWoodenFish={onPlayWoodenFish}
          onRequestDeleteGroup={onRequestDeleteRitualGroup}
          onDragStartItem={onDragStartRitualItem}
          onDragOverItem={onDragOverRitualItem}
          onDropItem={onDropRitualItem}
          onDragEndItem={onDragEndRitualItem}
          onMoveItem={onMoveRitualItem}
        />
      )}
    </>
  );
};
