import React, { useState } from 'react';
import {
  Camera,
  Check,
  CheckSquare,
  Clock,
  Edit3,
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
  X,
} from 'lucide-react';
import { DailyStrikeTodoEntity, TodoActivityType } from '../types/models';
import { resolveProofImageUrl } from '../services/desktopBridge';
import { TabPurposeBanner } from '../components/TabPurposeBanner';
import {
  ACTIVITY_TYPE_META,
  ALL_ACTIVITY_TYPES,
  inferTodoActivityType,
} from '../services/timeAuditEngine';

export interface SideQuestTemplate {
  title: string;
  mins: number;
}

export interface SideQuestStats {
  all: DailyStrikeTodoEntity[];
  today: DailyStrikeTodoEntity[];
  doneToday: DailyStrikeTodoEntity[];
  pending: DailyStrikeTodoEntity[];
  focusMinsToday: number;
}

interface SideQuestsViewProps {
  todayStr: string;
  templates: SideQuestTemplate[];
  stats: SideQuestStats;
  sideQuestTitle: string;
  sideQuestPomo: number;
  sideQuestActivityType: TodoActivityType;
  sideQuestRequiresPhoto: boolean;
  sideQuestShowHistory: boolean;
  onChangeTitle: (v: string) => void;
  onChangePomo: (v: number) => void;
  onChangeActivityType: (v: TodoActivityType) => void;
  onToggleRequiresPhoto: () => void;
  onChangeShowHistory: (v: boolean) => void;
  onCreateSideQuest: (title: string, mins: number, startFocusNow: boolean) => void;
  onUpdateSideQuest: (
    strikeId: string,
    patch: {
      title: string;
      notes?: string;
      activityType: TodoActivityType;
      requiredPomodoroMins: number;
      requiresPhoto: boolean;
    }
  ) => void;
  onEnterFocusStrike: (strike: DailyStrikeTodoEntity, autoStart?: boolean) => void;
  onCompleteStrikeAction: (strike: DailyStrikeTodoEntity) => void;
  onDeleteSideQuest: (strikeId: string) => void;
  onZoomPhoto: (photo: { uri: string; title: string; caption: string; dateStr: string }) => void;
}

export const SideQuestsView: React.FC<SideQuestsViewProps> = ({
  todayStr,
  templates,
  stats,
  sideQuestTitle,
  sideQuestPomo,
  sideQuestActivityType,
  sideQuestRequiresPhoto,
  sideQuestShowHistory,
  onChangeTitle,
  onChangePomo,
  onChangeActivityType,
  onToggleRequiresPhoto,
  onChangeShowHistory,
  onCreateSideQuest,
  onUpdateSideQuest,
  onEnterFocusStrike,
  onCompleteStrikeAction,
  onDeleteSideQuest,
  onZoomPhoto,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitleDraft, setEditTitleDraft] = useState('');
  const [editNotesDraft, setEditNotesDraft] = useState('');
  const [editActivityTypeDraft, setEditActivityTypeDraft] = useState<TodoActivityType>('CHORE');
  const [editPomoDraft, setEditPomoDraft] = useState(15);
  const [editRequiresPhotoDraft, setEditRequiresPhotoDraft] = useState(false);

  const list = sideQuestShowHistory
    ? stats.all
    : stats.all.filter((s) => s.date === todayStr || s.status !== 'COMPLETED');

  const startEditing = (strike: DailyStrikeTodoEntity) => {
    setEditingId(strike.id);
    setEditTitleDraft(strike.title);
    setEditNotesDraft(strike.notes || '');
    setEditActivityTypeDraft(inferTodoActivityType(strike, new Map()));
    setEditPomoDraft(strike.requiredPomodoroMins || 15);
    setEditRequiresPhotoDraft(Boolean(strike.requiresPhoto));
  };

  const handleSaveEdit = (strikeId: string) => {
    const cleanTitle = editTitleDraft.trim();
    if (!cleanTitle) return;
    onUpdateSideQuest(strikeId, {
      title: cleanTitle,
      notes: editNotesDraft.trim(),
      activityType: editActivityTypeDraft,
      requiredPomodoroMins: Math.max(5, Math.min(180, editPomoDraft || 15)),
      requiresPhoto: editRequiresPhotoDraft,
    });
    setEditingId(null);
  };

  return (
    <section className="module-block">
      <div className="zen-card module-column-card side-quest-card">
        <div className="section-header-row" style={{ marginBottom: 10 }}>
          <div style={{ flex: '1 1 360px', minWidth: 0 }}>
            <span className="zen-tag-red">VIỆC VẶT HÀNG NGÀY (SIDE QUESTS — HÀNH ĐỘNG TỨC THÌ)</span>
            <h2 className="section-title" style={{ marginTop: 6 }}>
              🧹 Việc Vặt Trong Ngày — Làm Ngay, Không Trì Hoãn
            </h2>
          </div>

          <div className="side-quest-stats">
            <div>
              <strong>
                {stats.doneToday.length}/{stats.today.length}
              </strong>
              <span>Xong hôm nay</span>
            </div>
            <div>
              <strong>{stats.focusMinsToday}p</strong>
              <span>Tập trung</span>
            </div>
            <div>
              <strong>{stats.pending.length}</strong>
              <span>Việc chờ</span>
            </div>
          </div>
        </div>

        <TabPurposeBanner
          purpose="Xử lý dứt điểm các việc sinh hoạt nhỏ (tắm rửa, giặt đồ, rửa bát, dọn phòng...) với Pomodoro riêng mà không bị tính vào tiến độ Đỉnh Núi hay bị Luật Núi xử phạt."
          steps={[
            'Bấm mẫu nhanh hoặc thêm Việc Vặt mới',
            'Sửa tự do tên & số phút nếu cần',
            'Bấm ⚡ Làm Ngay để bắt tay vào làm liền',
          ]}
        />

        {/* Templates */}
        <div className="side-quest-templates">
          <span className="side-quest-templates-label">
            <Sparkles size={13} style={{ display: 'inline', marginRight: 5 }} />
            Bấm làm ngay:
          </span>
          {templates.map((tpl) => (
            <button
              key={tpl.title}
              type="button"
              className="side-quest-chip"
              onClick={() => onCreateSideQuest(tpl.title, tpl.mins, true)}
              title={`Tạo "${tpl.title}" và chạy ngay Pomodoro ${tpl.mins} phút`}
            >
              <span>{tpl.title}</span>
              <small>{tpl.mins}p</small>
              <Play size={11} />
            </button>
          ))}
        </div>

        {/* Form */}
        <form
          className="inline-add-box"
          style={{ marginTop: 14, marginBottom: 18, borderColor: '#3E8A72' }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!sideQuestTitle.trim()) return;
            onCreateSideQuest(sideQuestTitle, sideQuestPomo, false);
            onChangeTitle('');
          }}
        >
          <div className="inline-add-header">+ Thêm Việc Vặt / Hoạt Động Cần Làm Ngay:</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) 0.7fr auto', gap: 10 }}>
            <input
              type="text"
              className="zen-input"
              placeholder="VD: Dọn bàn học, đi đổ rác, phơi đồ, chơi game 30p có kiểm soát..."
              value={sideQuestTitle}
              onChange={(e) => onChangeTitle(e.target.value)}
              required
            />
            <select
              className="zen-input"
              value={sideQuestActivityType}
              onChange={(e) => onChangeActivityType(e.target.value as TodoActivityType)}
              title="Phân loại hoạt động cho bảng Quỹ Thời Gian"
            >
              {ALL_ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACTIVITY_TYPE_META[t].icon} {ACTIVITY_TYPE_META[t].shortLabel}
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Flame size={14} color="#A8D8C6" />
              <input
                type="number"
                className="zen-input"
                style={{ width: 68, padding: '6px 8px' }}
                min={5}
                max={120}
                value={sideQuestPomo}
                onChange={(e) => onChangePomo(Number(e.target.value))}
              />
              <span className="zen-muted-text" style={{ fontSize: 13 }}>
                phút
              </span>
            </div>
          </div>

          <div className="inline-add-controls">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {[5, 10, 15, 25, 30].map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`pomo-preset-btn ${sideQuestPomo === m ? 'active' : ''}`}
                    onClick={() => onChangePomo(m)}
                  >
                    {m}p
                  </button>
                ))}
              </div>

              <button
                type="button"
                className={`pow-toggle-switch ${sideQuestRequiresPhoto ? 'on' : 'off'}`}
                onClick={onToggleRequiresPhoto}
              >
                {sideQuestRequiresPhoto ? (
                  <>
                    <ToggleRight size={20} color="#66bb6a" />
                    <span>Live PoW: BẬT</span>
                  </>
                ) : (
                  <>
                    <ToggleLeft size={20} color="#B8B4A9" />
                    <span>Live PoW: TẮT</span>
                  </>
                )}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="zen-btn zen-btn-outline">
                <Plus size={15} />
                <span>Thêm Vào Danh Sách</span>
              </button>
              <button
                type="button"
                className="zen-btn zen-btn-seal"
                onClick={() => {
                  if (!sideQuestTitle.trim()) return;
                  onCreateSideQuest(sideQuestTitle, sideQuestPomo, true);
                  onChangeTitle('');
                }}
              >
                <Play size={15} />
                <span>⚡ Làm Ngay</span>
              </button>
            </div>
          </div>
        </form>

        {/* Filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            className={`zen-btn ${!sideQuestShowHistory ? 'zen-btn-seal' : 'zen-btn-outline'}`}
            style={{ fontSize: 12.5 }}
            onClick={() => onChangeShowHistory(false)}
          >
            <Target size={14} /> Hôm nay &amp; Đang chờ
          </button>
          <button
            type="button"
            className={`zen-btn ${sideQuestShowHistory ? 'zen-btn-seal' : 'zen-btn-outline'}`}
            style={{ fontSize: 12.5 }}
            onClick={() => onChangeShowHistory(true)}
          >
            <History size={14} /> Toàn bộ lịch sử việc vặt ({stats.all.length})
          </button>
        </div>

        {/* Side Quest List */}
        <div className="rituals-list">
          {list.length === 0 ? (
            <div className="empty-state-box" style={{ padding: '28px 20px', textAlign: 'center' }}>
              Chưa có việc vặt nào. Khi thấy bản thân sắp cầm điện thoại lên thay vì đi tắm / giặt
              đồ — hãy bấm một nút <strong>⚡</strong> ở trên ngay lập tức!
            </div>
          ) : (
            list.map((strike) => {
              const isDone = strike.status === 'COMPLETED';
              const isCarriedOver = !isDone && strike.date !== todayStr;
              const isEditingThis = editingId === strike.id;
              const resolvedThumb = resolveProofImageUrl(strike.proofPhotoUri);

              if (isEditingThis) {
                return (
                  <div key={strike.id} className="side-quest-inline-edit-box">
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 10,
                      }}
                    >
                      <strong style={{ color: '#A8D8C6', fontSize: 13.5 }}>
                        ✏️ Chỉnh Sửa To-Do Việc Vặt
                      </strong>
                      <button
                        type="button"
                        className="zen-btn zen-btn-ghost"
                        style={{ padding: '3px 8px', fontSize: 12 }}
                        onClick={() => setEditingId(null)}
                      >
                        <X size={14} /> Đóng
                      </button>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.2fr 0.9fr 0.8fr',
                        gap: 10,
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <label className="zen-label">Tên Việc Vặt *</label>
                        <input
                          type="text"
                          className="zen-input"
                          style={{ width: '100%' }}
                          value={editTitleDraft}
                          onChange={(e) => setEditTitleDraft(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="zen-label">Ghi chú (tùy chọn)</label>
                        <input
                          type="text"
                          className="zen-input"
                          style={{ width: '100%' }}
                          placeholder="Ghi chú nhanh..."
                          value={editNotesDraft}
                          onChange={(e) => setEditNotesDraft(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="zen-label">Loại hoạt động</label>
                        <select
                          className="zen-input"
                          style={{ width: '100%' }}
                          value={editActivityTypeDraft}
                          onChange={(e) =>
                            setEditActivityTypeDraft(e.target.value as TodoActivityType)
                          }
                        >
                          {ALL_ACTIVITY_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {ACTIVITY_TYPE_META[t].icon} {ACTIVITY_TYPE_META[t].shortLabel}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 10,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 12.5, color: '#B8B4A9' }}>Pomodoro:</span>
                          <input
                            type="number"
                            className="zen-input"
                            style={{ width: 66, padding: '4px 8px' }}
                            min={5}
                            max={180}
                            value={editPomoDraft}
                            onChange={(e) => setEditPomoDraft(Number(e.target.value))}
                          />
                          {[5, 10, 15, 25, 30, 45].map((m) => (
                            <button
                              key={m}
                              type="button"
                              className={`pomo-preset-btn ${editPomoDraft === m ? 'active' : ''}`}
                              onClick={() => setEditPomoDraft(m)}
                            >
                              {m}p
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          className={`pow-toggle-switch ${editRequiresPhotoDraft ? 'on' : 'off'}`}
                          onClick={() => setEditRequiresPhotoDraft((v) => !v)}
                        >
                          {editRequiresPhotoDraft ? (
                            <>
                              <ToggleRight size={18} color="#66bb6a" />
                              <span>Live PoW: BẬT</span>
                            </>
                          ) : (
                            <>
                              <ToggleLeft size={18} color="#B8B4A9" />
                              <span>Live PoW: TẮT</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          className="zen-btn zen-btn-ghost"
                          onClick={() => setEditingId(null)}
                        >
                          Hủy
                        </button>
                        <button
                          type="button"
                          className="zen-btn zen-btn-seal"
                          onClick={() => handleSaveEdit(strike.id)}
                        >
                          <Check size={14} /> Lưu Thay Đổi
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

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
                      title={isDone ? 'Đã xong (bấm để mở lại)' : 'Bấm để đánh dấu đã xong'}
                    >
                      {isDone ? <CheckSquare size={22} /> : <Square size={22} />}
                    </button>
                  </div>

                  <div className="task-body-col">
                    <div className="ritual-meta-tags">
                      {(() => {
                        const actType = inferTodoActivityType(strike, new Map());
                        const actMeta = ACTIVITY_TYPE_META[actType];
                        return (
                          <span
                            className="activity-type-pill"
                            style={{ borderColor: actMeta.color, color: actMeta.color }}
                          >
                            {actMeta.icon} {actMeta.shortLabel}
                          </span>
                        );
                      })()}
                      <span className="pomo-pill">
                        <Clock size={12} /> Mục tiêu: {strike.requiredPomodoroMins}p &bull; Thực tế:{' '}
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
                            {strike.savedPomoSelectedMins ||
                              Math.round(strike.savedPomoTotalSeconds / 60)}
                            p
                          </span>
                        )}
                      {isCarriedOver && (
                        <span className="time-window-pill side-quest-carry-pill">
                          ⏳ Tồn từ ngày {strike.date}
                        </span>
                      )}
                      {strike.requiresPhoto && (
                        <span className="time-window-pill">
                          <Camera size={11} /> Cần ảnh PoW
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
                      <div style={{ fontSize: 12.5, color: '#B8B4A9', marginTop: 3 }}>
                        {strike.notes}
                      </div>
                    )}
                    {isDone && strike.completedAt && (
                      <div className="task-done-caption">
                        ✓ Xong lúc {new Date(strike.completedAt).toLocaleString('vi-VN')}
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
                          <strong style={{ color: '#A8D8C6' }}>📷 Ảnh bằng chứng đã lưu</strong>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="task-actions-col" onClick={(e) => e.stopPropagation()}>
                    {!isDone && (
                      <button
                        type="button"
                        className="zen-btn zen-btn-seal"
                        style={{ padding: '7px 12px', fontSize: 12.5 }}
                        onClick={() => onEnterFocusStrike(strike, true)}
                      >
                        <Play size={14} />
                        <span>
                          {strike.savedPomoSecondsLeft != null &&
                          strike.savedPomoTotalSeconds != null &&
                          strike.savedPomoSecondsLeft < strike.savedPomoTotalSeconds
                            ? '⚡ Tiếp Tục Làm Ngay'
                            : '⚡ Làm Ngay'}
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="zen-btn zen-btn-outline"
                      style={{ padding: '5px 10px', fontSize: 12 }}
                      title="Chỉnh sửa tên, ghi chú hoặc thời lượng Pomodoro"
                      onClick={() => startEditing(strike)}
                    >
                      <Edit3 size={13} /> Sửa
                    </button>
                    <button
                      type="button"
                      className="zen-btn zen-btn-ghost"
                      style={{ padding: '6px 9px', color: '#ff8a80' }}
                      title="Xóa việc vặt này"
                      onClick={() => onDeleteSideQuest(strike.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
};
