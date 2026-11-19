import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  CheckCheck,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Edit3,
  GripVertical,
  Plus,
  Square,
  Trash2,
} from 'lucide-react';
import { MonkDatabaseSchema, RitualCheckItem, RitualGroupEntity } from '../types/models';
import {
  getLawConfig,
  getRitualDayEvaluation,
  isRitualScheduledForDate,
} from '../services/mountainLaws';
import { TabPurposeBanner } from '../components/TabPurposeBanner';

const WEEKDAY_PILLS: Array<{ day: number; short: string; label: string }> = [
  { day: 1, short: 'T2', label: 'Thứ 2' },
  { day: 2, short: 'T3', label: 'Thứ 3' },
  { day: 3, short: 'T4', label: 'Thứ 4' },
  { day: 4, short: 'T5', label: 'Thứ 5' },
  { day: 5, short: 'T6', label: 'Thứ 6' },
  { day: 6, short: 'T7', label: 'Thứ 7' },
  { day: 0, short: 'CN', label: 'Chủ Nhật' },
];

export function formatRitualScheduleLabel(daysOfWeek?: number[]): string {
  if (!daysOfWeek || daysOfWeek.length === 0 || daysOfWeek.length === 7) {
    return 'Hằng ngày';
  }
  const sorted = [...daysOfWeek].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
  if (sorted.length === 5 && sorted.join(',') === '1,2,3,4,5') return 'T2–T6 (Ngày thường)';
  if (sorted.length === 2 && sorted.join(',') === '6,0') return 'T7–CN (Cuối tuần)';
  return sorted.map((d) => WEEKDAY_PILLS.find((p) => p.day === d)?.short || '').join(', ');
}

interface RitualsViewProps {
  db: MonkDatabaseSchema;
  todayStr: string;
  ritualStatsToday: { totalItems: number; completedItems: number; pct: number; groupCount: number };
  draggingRitualItem: { groupId: string; itemId: string; itemIndex: number } | null;
  dragOverTargetIndex: { groupId: string; itemIndex: number } | null;
  onPersistDb: (updater: (prev: MonkDatabaseSchema) => MonkDatabaseSchema) => void;
  onPlayWoodenFish: (volume?: number) => void;
  onRequestDeleteGroup: (group: RitualGroupEntity) => void;
  onDragStartItem: (groupId: string, itemId: string, itemIndex: number, e: React.DragEvent) => void;
  onDragOverItem: (groupId: string, itemIndex: number, e: React.DragEvent) => void;
  onDropItem: (groupId: string, targetIndex: number, e: React.DragEvent) => void;
  onDragEndItem: () => void;
  onMoveItem: (groupId: string, fromIndex: number, direction: 'UP' | 'DOWN') => void;
}

export const RitualsView: React.FC<RitualsViewProps> = ({
  db,
  todayStr,
  ritualStatsToday,
  draggingRitualItem,
  dragOverTargetIndex,
  onPersistDb,
  onPlayWoodenFish,
  onRequestDeleteGroup,
  onDragStartItem,
  onDragOverItem,
  onDropItem,
  onDragEndItem,
  onMoveItem,
}) => {
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupTitleDraft, setGroupTitleDraft] = useState('');
  const [groupSubtitleDraft, setGroupSubtitleDraft] = useState('');
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [newGroupSubtitle, setNewGroupSubtitle] = useState('');
  const [addingNewGroup, setAddingNewGroup] = useState(false);
  const [newCheckItemTextByGroup, setNewCheckItemTextByGroup] = useState<Record<string, string>>({});
  const [newItemScheduleByGroup, setNewItemScheduleByGroup] = useState<Record<string, number[]>>({});
  const [scheduleEditorKey, setScheduleEditorKey] = useState<string | null>(null);
  const [editingCheckItem, setEditingCheckItem] = useState<{
    groupId: string;
    itemId: string;
    text: string;
  } | null>(null);

  const lawEvalToday = useMemo(() => {
    const cfg = getLawConfig(db);
    return getRitualDayEvaluation(db, todayStr, cfg);
  }, [db, todayStr]);

  const toggleDayInList = (current: number[] | undefined, day: number): number[] => {
    const base = !current || current.length === 0 ? [1, 2, 3, 4, 5, 6, 0] : [...current];
    const next = base.includes(day) ? base.filter((d) => d !== day) : [...base, day];
    // Nếu chọn đủ 7 ngày hoặc rỗng hoàn toàn thì chuẩn hóa về [] (= hằng ngày)
    if (next.length === 7 || next.length === 0) return [];
    return next;
  };

  return (
    <section className="module-block">
      <div className="zen-card module-column-card">
        <div className="section-header-row">
          <div style={{ flex: '1 1 380px', minWidth: 0 }}>
            <span className="zen-tag-red">NGHI THỨC KỶ LUẬT HẰNG NGÀY & THEO THỨ (RITUAL CHECKLIST)</span>
            <h2 className="section-title" style={{ marginTop: 6 }}>
              🔥 Bảng Nghi Thức Cố Định Hằng Ngày ({ritualStatsToday.completedItems}/
              {ritualStatsToday.totalItems} bước áp dụng hôm nay)
            </h2>
            <TabPurposeBanner
              purpose="Bảng checklist các thói quen cố định hằng ngày (hoặc theo ngày thường T2–T6 / cuối tuần T7–CN) để giữ nhịp kỷ luật và đạt chuẩn Luật Núi."
              steps={[
                'Tạo nhóm thói quen (Sáng / Chiều / Tối)',
                'Tick hoàn thành mỗi ngày (đạt ngưỡng Luật)',
                'Kéo thả sắp xếp thứ tự ưu tiên',
              ]}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="ritual-overall-badge">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong>{ritualStatsToday.pct}% hôm nay</strong>
                  <span
                    style={{
                      fontSize: 11,
                      padding: '2px 7px',
                      borderRadius: 3,
                      background:
                        lawEvalToday.needMoreCount === 0
                          ? 'rgba(76, 175, 80, 0.22)'
                          : 'rgba(240, 200, 120, 0.16)',
                      color: lawEvalToday.needMoreCount === 0 ? '#a5d6a7' : '#f0c878',
                      border:
                        lawEvalToday.needMoreCount === 0
                          ? '1px solid rgba(76, 175, 80, 0.5)'
                          : '1px solid rgba(240, 200, 120, 0.45)',
                    }}
                  >
                    {lawEvalToday.totalCount === 0
                      ? 'Chưa có bước nào'
                      : lawEvalToday.needMoreCount === 0
                      ? `✓ Đạt chuẩn Luật (≥${lawEvalToday.thresholdPct}%)`
                      : `Cần +${lawEvalToday.needMoreCount} bước để đạt ${lawEvalToday.thresholdPct}%`}
                  </span>
                </div>
                <div className="zen-progress-track" style={{ width: '100%', minWidth: 180 }}>
                  <div className="zen-progress-fill" style={{ width: `${ritualStatsToday.pct}%` }} />
                </div>
              </div>
            </div>

            <button
              type="button"
              className="zen-btn zen-btn-seal"
              onClick={() => setAddingNewGroup((v) => !v)}
            >
              <Plus size={16} />
              <span>Thêm Nhóm Mới</span>
            </button>
          </div>
        </div>

        {/* Form to Create a New Ritual Group */}
        {addingNewGroup && (
          <div className="inline-add-box" style={{ marginBottom: 18 }}>
            <div className="inline-add-header">Tạo Nhóm Nghi Thức Thời Điểm Mới:</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 10,
                alignItems: 'center',
              }}
            >
              <input
                type="text"
                className="zen-input"
                placeholder="VD: 🌙 4. Trước khi đi ngủ..."
                value={newGroupTitle}
                onChange={(e) => setNewGroupTitle(e.target.value)}
              />
              <input
                type="text"
                className="zen-input"
                placeholder="Mô tả ngắn (VD: Đọc sách giấy, cất điện thoại...)"
                value={newGroupSubtitle}
                onChange={(e) => setNewGroupSubtitle(e.target.value)}
              />
              <button
                type="button"
                className="zen-btn zen-btn-seal"
                onClick={() => {
                  if (!newGroupTitle.trim()) return;
                  onPersistDb((prev) => ({
                    ...prev,
                    ritualGroups: [
                      ...(prev.ritualGroups || []),
                      {
                        id: `rg-${Date.now()}`,
                        title: newGroupTitle.trim(),
                        subtitle:
                          newGroupSubtitle.trim() ||
                          'Nhóm nghi thức thói quen rèn luyện bản thân mỗi ngày.',
                        items: [],
                        createdAt: Date.now(),
                      },
                    ],
                  }));
                  setNewGroupTitle('');
                  setNewGroupSubtitle('');
                  setAddingNewGroup(false);
                }}
              >
                <Check size={15} /> Lưu Nhóm
              </button>
            </div>
          </div>
        )}

        {/* Ritual Groups Grid */}
        <div className="ritual-groups-grid">
          {(db.ritualGroups || []).map((group) => {
            const isEditingGroup = editingGroupId === group.id;
            const scheduledItems = group.items.filter((it) => isRitualScheduledForDate(it, todayStr));
            const groupDone = scheduledItems.filter((it) => it.completedDates?.[todayStr]).length;
            const groupPct =
              scheduledItems.length > 0 ? Math.round((groupDone / scheduledItems.length) * 100) : 100;
            const groupAllCompleted = scheduledItems.length > 0 && groupPct === 100;
            const draftDays = newItemScheduleByGroup[group.id] || [];

            return (
              <div
                key={group.id}
                className={`ritual-group-card ${groupAllCompleted ? 'group-all-completed' : ''}`}
              >
                <div className="ritual-group-header">
                  {isEditingGroup ? (
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        flex: 1,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      <input
                        type="text"
                        className="zen-input"
                        value={groupTitleDraft}
                        onChange={(e) => setGroupTitleDraft(e.target.value)}
                        style={{ minWidth: 240 }}
                      />
                      <input
                        type="text"
                        className="zen-input"
                        value={groupSubtitleDraft}
                        onChange={(e) => setGroupSubtitleDraft(e.target.value)}
                        style={{ flex: 1, minWidth: 260 }}
                      />
                      <button
                        type="button"
                        className="zen-btn zen-btn-seal"
                        onClick={() => {
                          if (!groupTitleDraft.trim()) return;
                          onPersistDb((prev) => ({
                            ...prev,
                            ritualGroups: (prev.ritualGroups || []).map((g) =>
                              g.id === group.id
                                ? {
                                    ...g,
                                    title: groupTitleDraft.trim(),
                                    subtitle: groupSubtitleDraft.trim(),
                                  }
                                : g
                            ),
                          }));
                          setEditingGroupId(null);
                        }}
                      >
                        <Check size={14} /> Lưu
                      </button>
                      <button
                        type="button"
                        className="zen-btn zen-btn-ghost"
                        onClick={() => setEditingGroupId(null)}
                      >
                        Hủy
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <h3 className="ritual-group-title">{group.title}</h3>
                          <span
                            className={`status-pill-tag ${
                              groupPct === 100 && scheduledItems.length > 0 ? 'done' : 'pending'
                            }`}
                          >
                            {groupDone}/{scheduledItems.length} hôm nay
                          </span>
                        </div>
                        <p className="ritual-group-subtitle">
                          {group.subtitle}
                        </p>
                      </div>

                      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                        {scheduledItems.length > 0 && groupDone < scheduledItems.length && (
                          <button
                            type="button"
                            className="zen-btn zen-btn-outline"
                            style={{ padding: '4px 9px', fontSize: 11.5 }}
                            title="Đánh dấu hoàn thành toàn bộ các bước hôm nay trong nhóm này"
                            onClick={() => {
                              onPlayWoodenFish(0.8);
                              const ts = Date.now();
                              onPersistDb((prev) => ({
                                ...prev,
                                ritualGroups: (prev.ritualGroups || []).map((g) =>
                                  g.id === group.id
                                    ? {
                                        ...g,
                                        items: g.items.map((x) =>
                                          isRitualScheduledForDate(x, todayStr)
                                            ? {
                                                ...x,
                                                completedDates: {
                                                  ...(x.completedDates || {}),
                                                  [todayStr]: x.completedDates?.[todayStr] || ts,
                                                },
                                              }
                                            : x
                                        ),
                                      }
                                    : g
                                ),
                              }));
                            }}
                          >
                            <CheckCheck size={13} /> Tích xong nhóm
                          </button>
                        )}
                        <button
                          type="button"
                          className="zen-btn zen-btn-ghost"
                          style={{ padding: '5px 8px' }}
                          title="Sửa tiêu đề nhóm Nghi Thức"
                          onClick={() => {
                            setEditingGroupId(group.id);
                            setGroupTitleDraft(group.title);
                            setGroupSubtitleDraft(group.subtitle || '');
                          }}
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          type="button"
                          className="zen-btn zen-btn-ghost"
                          style={{ padding: '5px 8px', color: '#ff8a80' }}
                          title="Xóa nhóm Nghi Thức này"
                          onClick={() => onRequestDeleteGroup(group)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <div className="ritual-group-progress-row">
                  <div className="zen-progress-track">
                    <div className="zen-progress-fill" style={{ width: `${groupPct}%` }} />
                  </div>
                  <span className="ritual-group-pct-text">{groupPct}%</span>
                </div>

                {/* Checklist Items inside this Group (Draggable + Scheduled) */}
                <div className="ritual-check-items-list">
                  {group.items.map((item: RitualCheckItem, itemIdx: number) => {
                    const checked = Boolean(item.completedDates?.[todayStr]);
                    const scheduledToday = isRitualScheduledForDate(item, todayStr);
                    const scheduleLabel = formatRitualScheduleLabel(item.daysOfWeek);
                    const itemEditorId = `${group.id}:${item.id}`;
                    const isEditingSchedule = scheduleEditorKey === itemEditorId;
                    const isEditingThis =
                      editingCheckItem?.groupId === group.id &&
                      editingCheckItem?.itemId === item.id;
                    const isDraggingThis =
                      draggingRitualItem?.groupId === group.id &&
                      draggingRitualItem?.itemId === item.id;
                    const isDragTarget =
                      dragOverTargetIndex?.groupId === group.id &&
                      dragOverTargetIndex?.itemIndex === itemIdx &&
                      draggingRitualItem?.itemId !== item.id;

                    return (
                      <div key={item.id}>
                        <div
                          className={`ritual-check-row ${
                            checked ? 'checked' : !scheduledToday ? 'off-schedule' : ''
                          } ${isDraggingThis ? 'is-dragging' : ''} ${
                            isDragTarget ? 'is-drag-over' : ''
                          }`}
                          draggable={!isEditingThis}
                          onDragStart={(e) => onDragStartItem(group.id, item.id, itemIdx, e)}
                          onDragOver={(e) => onDragOverItem(group.id, itemIdx, e)}
                          onDrop={(e) => onDropItem(group.id, itemIdx, e)}
                          onDragEnd={onDragEndItem}
                        >
                          <span
                            className="ritual-drag-handle"
                            title="Kéo thả để thay đổi thứ tự bước Nghi Thức"
                          >
                            <GripVertical size={16} />
                          </span>

                          {isEditingThis ? (
                            <div
                              style={{ display: 'flex', gap: 8, flex: 1, alignItems: 'center' }}
                            >
                              <input
                                type="text"
                                className="zen-input"
                                style={{ flex: 1, padding: '6px 10px' }}
                                value={editingCheckItem.text}
                                onChange={(e) =>
                                  setEditingCheckItem({
                                    ...editingCheckItem,
                                    text: e.target.value,
                                  })
                                }
                                autoFocus
                              />
                              <button
                                type="button"
                                className="zen-btn zen-btn-seal"
                                style={{ padding: '6px 10px', fontSize: 12 }}
                                onClick={() => {
                                  if (!editingCheckItem.text.trim()) return;
                                  onPersistDb((prev) => ({
                                    ...prev,
                                    ritualGroups: (prev.ritualGroups || []).map((g) =>
                                      g.id === group.id
                                        ? {
                                            ...g,
                                            items: g.items.map((x) =>
                                              x.id === item.id
                                                ? { ...x, title: editingCheckItem.text.trim() }
                                                : x
                                            ),
                                          }
                                        : g
                                    ),
                                  }));
                                  setEditingCheckItem(null);
                                }}
                              >
                                <Check size={13} /> Lưu
                              </button>
                              <button
                                type="button"
                                className="zen-btn zen-btn-ghost"
                                style={{ padding: '6px 8px', fontSize: 12 }}
                                onClick={() => setEditingCheckItem(null)}
                              >
                                Hủy
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="ritual-check-label"
                                onClick={() => {
                                  onPlayWoodenFish(0.65);
                                  onPersistDb((prev) => ({
                                    ...prev,
                                    ritualGroups: (prev.ritualGroups || []).map((g) =>
                                      g.id === group.id
                                        ? {
                                            ...g,
                                            items: g.items.map((x) => {
                                              if (x.id !== item.id) return x;
                                              const nextDates = { ...(x.completedDates || {}) };
                                              if (nextDates[todayStr]) {
                                                delete nextDates[todayStr];
                                              } else {
                                                nextDates[todayStr] = Date.now();
                                              }
                                              return { ...x, completedDates: nextDates };
                                            }),
                                          }
                                        : g
                                    ),
                                  }));
                                }}
                              >
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    color: checked ? '#5BAE93' : '#d8d3c5',
                                    flexShrink: 0,
                                  }}
                                >
                                  {checked ? <CheckSquare size={19} /> : <Square size={19} />}
                                </span>
                                <span
                                  style={{
                                    flex: 1,
                                    minWidth: 0,
                                    textDecoration: checked ? 'line-through' : 'none',
                                    color: checked
                                      ? '#9E9A8E'
                                      : scheduledToday
                                      ? '#F6F4EE'
                                      : '#9E9A8E',
                                    lineHeight: 1.4,
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  {item.title}
                                </span>
                              </button>

                              {checked && item.completedDates?.[todayStr] && (
                                <span className="ritual-done-time">
                                  ✓{' '}
                                  {new Date(item.completedDates[todayStr]).toLocaleTimeString(
                                    'vi-VN',
                                    { hour: '2-digit', minute: '2-digit' }
                                  )}
                                </span>
                              )}

                              <button
                                type="button"
                                className={`ritual-schedule-badge ${
                                  scheduledToday ? 'on-today' : 'off-today'
                                }`}
                                onClick={() =>
                                  setScheduleEditorKey(isEditingSchedule ? null : itemEditorId)
                                }
                                title="Bấm để cấu hình lặp lại theo Thứ trong tuần"
                              >
                                <Calendar size={11} />
                                <span>
                                  {scheduleLabel}
                                  {!scheduledToday ? ' • Nghỉ hôm nay' : ''}
                                </span>
                              </button>

                              <div className="ritual-item-actions">
                                <button
                                  type="button"
                                  className="ritual-mini-icon-btn"
                                  title="Di chuyển lên"
                                  disabled={itemIdx === 0}
                                  onClick={() => onMoveItem(group.id, itemIdx, 'UP')}
                                >
                                  <ChevronUp size={13} />
                                </button>
                                <button
                                  type="button"
                                  className="ritual-mini-icon-btn"
                                  title="Di chuyển xuống"
                                  disabled={itemIdx === group.items.length - 1}
                                  onClick={() => onMoveItem(group.id, itemIdx, 'DOWN')}
                                >
                                  <ChevronDown size={13} />
                                </button>
                                <button
                                  type="button"
                                  className="ritual-mini-icon-btn"
                                  title="Sửa tên bước Nghi Thức"
                                  onClick={() =>
                                    setEditingCheckItem({
                                      groupId: group.id,
                                      itemId: item.id,
                                      text: item.title,
                                    })
                                  }
                                >
                                  <Edit3 size={13} />
                                </button>
                                <button
                                  type="button"
                                  className="ritual-mini-icon-btn"
                                  style={{ color: '#ff8a80' }}
                                  title="Xóa bước này"
                                  onClick={() => {
                                    onPersistDb((prev) => ({
                                      ...prev,
                                      ritualGroups: (prev.ritualGroups || []).map((g) =>
                                        g.id === group.id
                                          ? {
                                              ...g,
                                              items: g.items.filter((x) => x.id !== item.id),
                                            }
                                          : g
                                      ),
                                    }));
                                  }}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </>
                          )}
                        </div>

                        {isEditingSchedule && !isEditingThis && (
                          <div className="ritual-schedule-editor-bar">
                            <span style={{ fontSize: 12, color: '#A8D8C6', fontWeight: 600 }}>
                              Lịch lặp theo Thứ:
                            </span>
                            <button
                              type="button"
                              className={`ritual-day-pill ${
                                !item.daysOfWeek || item.daysOfWeek.length === 0 ? 'active' : ''
                              }`}
                              onClick={() =>
                                onPersistDb((prev) => ({
                                  ...prev,
                                  ritualGroups: (prev.ritualGroups || []).map((g) =>
                                    g.id === group.id
                                      ? {
                                          ...g,
                                          items: g.items.map((x) =>
                                            x.id === item.id ? { ...x, daysOfWeek: [] } : x
                                          ),
                                        }
                                      : g
                                  ),
                                }))
                              }
                            >
                              Hằng ngày
                            </button>
                            <button
                              type="button"
                              className={`ritual-day-pill ${
                                scheduleLabel === 'T2–T6 (Ngày thường)' ? 'active' : ''
                              }`}
                              onClick={() =>
                                onPersistDb((prev) => ({
                                  ...prev,
                                  ritualGroups: (prev.ritualGroups || []).map((g) =>
                                    g.id === group.id
                                      ? {
                                          ...g,
                                          items: g.items.map((x) =>
                                            x.id === item.id
                                              ? { ...x, daysOfWeek: [1, 2, 3, 4, 5] }
                                              : x
                                          ),
                                        }
                                      : g
                                  ),
                                }))
                              }
                            >
                              T2–T6
                            </button>
                            <button
                              type="button"
                              className={`ritual-day-pill ${
                                scheduleLabel === 'T7–CN (Cuối tuần)' ? 'active' : ''
                              }`}
                              onClick={() =>
                                onPersistDb((prev) => ({
                                  ...prev,
                                  ritualGroups: (prev.ritualGroups || []).map((g) =>
                                    g.id === group.id
                                      ? {
                                          ...g,
                                          items: g.items.map((x) =>
                                            x.id === item.id ? { ...x, daysOfWeek: [6, 0] } : x
                                          ),
                                        }
                                      : g
                                  ),
                                }))
                              }
                            >
                              T7–CN
                            </button>
                            <span style={{ opacity: 0.35 }}>|</span>
                            {WEEKDAY_PILLS.map((d) => {
                              const active =
                                !item.daysOfWeek ||
                                item.daysOfWeek.length === 0 ||
                                item.daysOfWeek.includes(d.day);
                              return (
                                <button
                                  key={d.day}
                                  type="button"
                                  className={`ritual-day-pill ${active ? 'active' : ''}`}
                                  title={d.label}
                                  onClick={() => {
                                    const nextDays = toggleDayInList(item.daysOfWeek, d.day);
                                    onPersistDb((prev) => ({
                                      ...prev,
                                      ritualGroups: (prev.ritualGroups || []).map((g) =>
                                        g.id === group.id
                                          ? {
                                              ...g,
                                              items: g.items.map((x) =>
                                                x.id === item.id
                                                  ? { ...x, daysOfWeek: nextDays }
                                                  : x
                                              ),
                                            }
                                          : g
                                      ),
                                    }));
                                  }}
                                >
                                  {d.short}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Quick Add New Checkbox Item to This Group */}
                <form
                  className="ritual-add-item-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const text = (newCheckItemTextByGroup[group.id] || '').trim();
                    if (!text) return;
                    const chosenDays =
                      draftDays.length > 0 && draftDays.length < 7 ? draftDays : undefined;
                    onPlayWoodenFish(0.5);
                    onPersistDb((prev) => ({
                      ...prev,
                      ritualGroups: (prev.ritualGroups || []).map((g) =>
                        g.id === group.id
                          ? {
                              ...g,
                              items: [
                                ...g.items,
                                {
                                  id: `rcheck-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                                  title: text,
                                  completedDates: {},
                                  createdAt: Date.now(),
                                  daysOfWeek: chosenDays,
                                },
                              ],
                            }
                          : g
                      ),
                    }));
                    setNewCheckItemTextByGroup((prev) => ({ ...prev, [group.id]: '' }));
                  }}
                >
                  <input
                    type="text"
                    className="zen-input"
                    style={{ flex: 1, minWidth: 180, padding: '7px 12px', fontSize: 13 }}
                    placeholder={`+ Thêm bước Nghi Thức mới vào "${group.title}"...`}
                    value={newCheckItemTextByGroup[group.id] || ''}
                    onChange={(e) =>
                      setNewCheckItemTextByGroup((prev) => ({
                        ...prev,
                        [group.id]: e.target.value,
                      }))
                    }
                  />
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={`ritual-day-pill ${draftDays.length === 0 ? 'active' : ''}`}
                      onClick={() =>
                        setNewItemScheduleByGroup((prev) => ({ ...prev, [group.id]: [] }))
                      }
                    >
                      Hằng ngày
                    </button>
                    <button
                      type="button"
                      className={`ritual-day-pill ${
                        draftDays.join(',') === '1,2,3,4,5' ? 'active' : ''
                      }`}
                      onClick={() =>
                        setNewItemScheduleByGroup((prev) => ({
                          ...prev,
                          [group.id]: [1, 2, 3, 4, 5],
                        }))
                      }
                    >
                      T2–T6
                    </button>
                    <button
                      type="button"
                      className={`ritual-day-pill ${
                        draftDays.join(',') === '6,0' ? 'active' : ''
                      }`}
                      onClick={() =>
                        setNewItemScheduleByGroup((prev) => ({ ...prev, [group.id]: [6, 0] }))
                      }
                    >
                      T7–CN
                    </button>
                  </div>
                  <button type="submit" className="zen-btn zen-btn-outline" style={{ fontSize: 12.5 }}>
                    <Plus size={14} /> Thêm bước
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
