import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  Edit3,
  Lightbulb,
  Pin,
  PinOff,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  MonkDatabaseSchema,
  OptimizationCategory,
  OptimizationNoteEntity,
} from '../types/models';
import { TabPurposeBanner } from '../components/TabPurposeBanner';

type OptVaultSubTab = 'VAULT_LIST' | 'EDITOR';

export const OPTIMIZATION_CATEGORY_META: Record<
  OptimizationCategory,
  { label: string; shortLabel: string; badgeIcon: string; description: string }
> = {
  COMBO_TIME_SAVER: {
    label: '⚡ 1 Công Đôi Việc / Tiết Kiệm Thời Gian',
    shortLabel: '1 Công Đôi Việc',
    badgeIcon: '⚡',
    description: 'Kết hợp 2 việc song song (VD: vừa tập thể dục vừa luyện nghe/đọc tiếng Trung).',
  },
  LEARNING_HACK: {
    label: '🧠 Cách Học Nhanh & Nạp Kiến Thức Tối Ưu',
    shortLabel: 'Cách Học Nhanh',
    badgeIcon: '🧠',
    description: 'Phương pháp nhớ lâu, đọc nhanh, rút ngắn thời gian học từ vựng / kỹ năng.',
  },
  LIFE_TRICK: {
    label: '🛠️ Trick Nhỏ Tối Ưu Cuộc Sống Hàng Ngày',
    shortLabel: 'Trick Cuộc Sống',
    badgeIcon: '🛠️',
    description: 'Mẹo sắp xếp sinh hoạt, tự động hóa thói quen để bớt ma sát và tiết kiệm sức.',
  },
  IDEA_INSIGHT: {
    label: '💡 Ý Tưởng & Sáng Kiến Chợt Nảy Ra',
    shortLabel: 'Ý Tưởng Mới',
    badgeIcon: '💡',
    description: 'Lưu ngay ý tưởng hay vừa nghĩ ra trước khi bị quên mất.',
  },
};

interface OptimizationVaultViewProps {
  db: MonkDatabaseSchema;
  todayStr: string;
  onPersistDb: (updater: (prev: MonkDatabaseSchema) => MonkDatabaseSchema) => void;
  onPlayWoodenFish: (volume?: number) => void;
  onPlayWoodblockStamp: () => void;
  onShowMessage: (title: string, msg: string, type?: 'danger' | 'info' | 'seal') => void;
}

export const OptimizationVaultView: React.FC<OptimizationVaultViewProps> = ({
  db,
  todayStr,
  onPersistDb,
  onPlayWoodenFish,
  onPlayWoodblockStamp,
  onShowMessage,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<OptVaultSubTab>('VAULT_LIST');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [categoryDraft, setCategoryDraft] = useState<OptimizationCategory>('COMBO_TIME_SAVER');
  const [goalIdDraft, setGoalIdDraft] = useState<string>('');
  const [timeSavedDraft, setTimeSavedDraft] = useState('');
  const [contentDraft, setContentDraft] = useState('');
  const [isPinnedDraft, setIsPinnedDraft] = useState(true);

  const [filterCategory, setFilterCategory] = useState<'ALL' | 'PINNED' | OptimizationCategory>('ALL');
  const [filterGoalId, setFilterGoalId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const notes = db.optimizationNotes || [];
  const goalsById = useMemo(() => new Map(db.peakGoals.map((g) => [g.id, g])), [db.peakGoals]);

  const stats = useMemo(() => {
    const comboCount = notes.filter((n) => n.category === 'COMBO_TIME_SAVER').length;
    const pinnedCount = notes.filter((n) => n.isPinned).length;
    const totalApplied = notes.reduce((sum, n) => sum + (n.appliedCount || 0), 0);
    return {
      total: notes.length,
      comboCount,
      pinnedCount,
      totalApplied,
    };
  }, [notes]);

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...notes]
      .filter((n) => {
        if (filterCategory === 'PINNED' && !n.isPinned) return false;
        if (
          filterCategory !== 'ALL' &&
          filterCategory !== 'PINNED' &&
          n.category !== filterCategory
        ) {
          return false;
        }
        if (filterGoalId !== 'ALL') {
          if (filterGoalId === 'GENERAL' && n.goalId) return false;
          if (filterGoalId !== 'GENERAL' && n.goalId !== filterGoalId) return false;
        }
        if (q) {
          const hay = `${n.title} ${n.content} ${n.timeSavedHint || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
          return a.isPinned ? -1 : 1;
        }
        return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt);
      });
  }, [notes, filterCategory, filterGoalId, searchQuery]);

  const resetForm = () => {
    setEditingNoteId(null);
    setTitleDraft('');
    setCategoryDraft('COMBO_TIME_SAVER');
    setGoalIdDraft('');
    setTimeSavedDraft('');
    setContentDraft('');
    setIsPinnedDraft(true);
  };

  const handleSubmitNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleDraft.trim() || !contentDraft.trim()) return;
    const now = Date.now();

    if (editingNoteId) {
      onPlayWoodblockStamp();
      onPersistDb((prev) => ({
        ...prev,
        optimizationNotes: (prev.optimizationNotes || []).map((n) =>
          n.id === editingNoteId
            ? {
                ...n,
                title: titleDraft.trim(),
                content: contentDraft.trim(),
                category: categoryDraft,
                goalId: goalIdDraft || undefined,
                timeSavedHint: timeSavedDraft.trim() || undefined,
                isPinned: isPinnedDraft,
                updatedAt: now,
              }
            : n
        ),
      }));
      onShowMessage(
        '✏️ ĐÃ CẬP NHẬT BÍ KÍP TỐI ƯU',
        `Đã lưu thay đổi cho bí kíp "${titleDraft.trim()}".`,
        'seal'
      );
      resetForm();
      setActiveSubTab('VAULT_LIST');
      return;
    }

    const created: OptimizationNoteEntity = {
      id: `opt-${now}-${Math.random().toString(36).slice(2, 6)}`,
      title: titleDraft.trim(),
      content: contentDraft.trim(),
      category: categoryDraft,
      goalId: goalIdDraft || undefined,
      timeSavedHint: timeSavedDraft.trim() || undefined,
      isPinned: isPinnedDraft,
      appliedCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    onPlayWoodblockStamp();
    onPersistDb((prev) => ({
      ...prev,
      optimizationNotes: [created, ...(prev.optimizationNotes || [])],
    }));
    onShowMessage(
      '💡 ĐÃ LƯU VÀO SỔ BÍ KÍP TỐI ƯU',
      `Đã lưu "${created.title}". Hãy áp dụng thường xuyên để tiết kiệm thời gian mỗi ngày!`,
      'seal'
    );
    resetForm();
    setActiveSubTab('VAULT_LIST');
  };

  const handleStartEdit = (note: OptimizationNoteEntity) => {
    onPlayWoodenFish(0.5);
    setEditingNoteId(note.id);
    setTitleDraft(note.title);
    setCategoryDraft(note.category);
    setGoalIdDraft(note.goalId || '');
    setTimeSavedDraft(note.timeSavedHint || '');
    setContentDraft(note.content);
    setIsPinnedDraft(Boolean(note.isPinned));
    setActiveSubTab('EDITOR');
  };

  const handleTogglePin = (noteId: string) => {
    onPlayWoodenFish(0.5);
    onPersistDb((prev) => ({
      ...prev,
      optimizationNotes: (prev.optimizationNotes || []).map((n) =>
        n.id === noteId ? { ...n, isPinned: !n.isPinned, updatedAt: Date.now() } : n
      ),
    }));
  };

  const handleApplyToday = (note: OptimizationNoteEntity) => {
    onPlayWoodenFish(0.8);
    const nextCount = (note.appliedCount || 0) + 1;
    onPersistDb((prev) => ({
      ...prev,
      optimizationNotes: (prev.optimizationNotes || []).map((n) =>
        n.id === note.id
          ? {
              ...n,
              appliedCount: nextCount,
              lastAppliedDate: todayStr,
              updatedAt: Date.now(),
            }
          : n
      ),
    }));
    onShowMessage(
      '⚡ ĐÃ ÁP DỤNG BÍ KÍP TỐI ƯU!',
      `Tuyệt vời! Bạn đã áp dụng "${note.title}" (${nextCount} lần). Một công đôi việc giúp tiến gần đỉnh núi nhanh hơn!`,
      'seal'
    );
  };

  const handleDeleteNote = (noteId: string) => {
    onPlayWoodenFish(0.5);
    onPersistDb((prev) => ({
      ...prev,
      optimizationNotes: (prev.optimizationNotes || []).filter((n) => n.id !== noteId),
    }));
    if (editingNoteId === noteId) resetForm();
  };

  return (
    <section className="module-block">
      <div className="zen-card">
        <div className="section-header-row" style={{ marginBottom: 10 }}>
          <div style={{ flex: '1 1 420px', minWidth: 0 }}>
            <span className="zen-tag-red">
              SỔ BÍ KÍP TỐI ƯU &amp; Ý TƯỞNG HỌC NHANH (OPTIMIZATION VAULT)
            </span>
            <h2 className="section-title" style={{ marginTop: 6 }}>
              💡 Bí Kíp Học Nhanh, Trick Cuộc Sống &amp; Ý Tưởng 1 Công Đôi Việc
            </h2>
          </div>

          <div className="side-quest-stats">
            <div>
              <strong>{stats.total}</strong>
              <span>Tổng bí kíp</span>
            </div>
            <div>
              <strong>{stats.comboCount}</strong>
              <span>1 công đôi việc</span>
            </div>
            <div>
              <strong>{stats.pinnedCount}</strong>
              <span>Đang ghim</span>
            </div>
            <div>
              <strong>{stats.totalApplied}</strong>
              <span>Lượt áp dụng</span>
            </div>
          </div>
        </div>

        <TabPurposeBanner
          purpose="Lưu lại các mẹo học nhanh, trick tiết kiệm thời gian và ý tưởng kết hợp 1 công đôi việc (VD: vừa tập thể dục vừa luyện nghe/đọc tiếng Trung). Mẹo được ghim sẽ hiện trong phòng Pomodoro và được AI tham khảo xếp lịch."
          steps={[
            'Ghi bí kíp & ghim lên đầu',
            'Áp dụng ngay trong giờ tập trung Pomodoro',
            'Bấm (+1) để theo dõi số lần thực hành',
          ]}
        />

        {/* SUB-TABS NAVIGATION */}
        <div className="laws-subtabs-bar" role="tablist" aria-label="Phân mục Sổ Bí Kíp">
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === 'VAULT_LIST'}
            className={`laws-subtab-btn ${activeSubTab === 'VAULT_LIST' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('VAULT_LIST')}
          >
            <div className="laws-subtab-top">
              <BookOpen size={16} />
              <span className="laws-subtab-name">1. Kho Bí Kíp &amp; Ý Tưởng</span>
            </div>
            <span className="laws-subtab-pill pill-ok">
              {notes.length} mẹo • {stats.pinnedCount} đang ghim
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === 'EDITOR'}
            className={`laws-subtab-btn ${activeSubTab === 'EDITOR' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('EDITOR')}
          >
            <div className="laws-subtab-top">
              <Plus size={16} />
              <span className="laws-subtab-name">
                {editingNoteId ? '2. Đang Sửa Bí Kíp' : '2. Ghi Bí Kíp / Ý Tưởng Mới'}
              </span>
            </div>
            <span className={`laws-subtab-pill ${editingNoteId ? 'pill-gold' : 'pill-neutral'}`}>
              {editingNoteId ? 'Đang chỉnh sửa' : 'Soạn ghi chú mới'}
            </span>
          </button>
        </div>

        {activeSubTab === 'EDITOR' && (
          <div className="laws-tabpanel page-fade-in">
            <form
              className="zen-card opt-vault-form-card"
              style={{ maxWidth: 820, margin: '0 auto' }}
              onSubmit={handleSubmitNote}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="zen-subcard-title" style={{ margin: 0, borderBottom: 'none', paddingBottom: 0 }}>
                  {editingNoteId ? '✏️ Chỉnh Sửa Bí Kíp / Ý Tưởng' : '✍️ Ghi Nhanh Ý Tưởng & Bí Kíp Mới'}
                </h3>
                {editingNoteId && (
                  <button
                    type="button"
                    className="zen-btn zen-btn-ghost"
                    style={{ fontSize: 12 }}
                    onClick={() => {
                      resetForm();
                      setActiveSubTab('VAULT_LIST');
                    }}
                  >
                    Hủy sửa &amp; Quay lại kho
                  </button>
                )}
              </div>

              <div>
                <label className="zen-label">Tiêu đề ý tưởng / mẹo tối ưu *</label>
                <input
                  type="text"
                  className="zen-input"
                  style={{ width: '100%' }}
                  placeholder="VD: Vừa chạy bộ / tập tạ vừa nghe Podcast tiếng Trung & note từ giữa hiệp..."
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="zen-label">Phân loại</label>
                  <select
                    className="zen-input"
                    style={{ width: '100%' }}
                    value={categoryDraft}
                    onChange={(e) => setCategoryDraft(e.target.value as OptimizationCategory)}
                  >
                    {(Object.keys(OPTIMIZATION_CATEGORY_META) as OptimizationCategory[]).map((cat) => (
                      <option key={cat} value={cat}>
                        {OPTIMIZATION_CATEGORY_META[cat].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="zen-label">Gắn với Đỉnh Núi (tùy chọn)</label>
                  <select
                    className="zen-input"
                    style={{ width: '100%' }}
                    value={goalIdDraft}
                    onChange={(e) => setGoalIdDraft(e.target.value)}
                  >
                    <option value="">🌐 Áp dụng chung mọi lúc</option>
                    {db.peakGoals.map((g, idx) => (
                      <option key={g.id} value={g.id}>
                        ⛰️ Núi #{idx + 1}: {g.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="zen-label">Lợi ích / Thời gian tiết kiệm (tùy chọn)</label>
                <input
                  type="text"
                  className="zen-input"
                  style={{ width: '100%' }}
                  placeholder="VD: Tiết kiệm 45 phút/ngày, nhớ từ vựng gấp 2 lần..."
                  value={timeSavedDraft}
                  onChange={(e) => setTimeSavedDraft(e.target.value)}
                />
              </div>

              <div>
                <label className="zen-label">Cách thực hiện chi tiết *</label>
                <textarea
                  className="zen-textarea"
                  rows={5}
                  style={{ width: '100%' }}
                  placeholder="Mô tả rõ cách kết hợp hoặc các bước áp dụng để khi mở lại có thể làm ngay..."
                  value={contentDraft}
                  onChange={(e) => setContentDraft(e.target.value)}
                  required
                />
              </div>

              <label className="settings-toggle-row" style={{ padding: '8px 12px' }}>
                <input
                  type="checkbox"
                  checked={isPinnedDraft}
                  onChange={(e) => setIsPinnedDraft(e.target.checked)}
                />
                <span>📌 Ghim bí kíp này lên đầu (hiển thị cả trong phòng Tập Trung Pomodoro)</span>
              </label>

              <button type="submit" className="zen-btn zen-btn-seal" style={{ width: '100%', padding: '11px' }}>
                {editingNoteId ? <Check size={16} /> : <Plus size={16} />}
                <span>{editingNoteId ? 'Lưu Thay Đổi Bí Kíp' : 'Lưu Vào Sổ Bí Kíp & Ý Tưởng'}</span>
              </button>
            </form>
          </div>
        )}

        {activeSubTab === 'VAULT_LIST' && (
          <div className="laws-tabpanel page-fade-in">
            <div className="opt-vault-list-col">
              <div className="opt-vault-filter-bar">
                <div className="opt-search-wrap">
                  <Search size={15} color="#9E9A8E" />
                  <input
                    type="text"
                    className="zen-input"
                    style={{ width: '100%', paddingLeft: 34 }}
                    placeholder="Tìm nhanh bí kíp, trick, từ khóa..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <select
                  className="zen-input"
                  value={filterGoalId}
                  onChange={(e) => setFilterGoalId(e.target.value)}
                >
                  <option value="ALL">Tất cả Đỉnh Núi</option>
                  <option value="GENERAL">🌐 Mẹo chung cuộc sống</option>
                  {db.peakGoals.map((g, idx) => (
                    <option key={g.id} value={g.id}>
                      ⛰️ Núi #{idx + 1}: {g.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="opt-category-pills">
                <button
                  type="button"
                  className={`pomo-preset-btn ${filterCategory === 'ALL' ? 'active' : ''}`}
                  onClick={() => setFilterCategory('ALL')}
                >
                  Tất cả ({notes.length})
                </button>
                <button
                  type="button"
                  className={`pomo-preset-btn ${filterCategory === 'PINNED' ? 'active' : ''}`}
                  onClick={() => setFilterCategory('PINNED')}
                >
                  📌 Đang ghim ({stats.pinnedCount})
                </button>
                {(Object.keys(OPTIMIZATION_CATEGORY_META) as OptimizationCategory[]).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`pomo-preset-btn ${filterCategory === cat ? 'active' : ''}`}
                    onClick={() => setFilterCategory(cat)}
                  >
                    {OPTIMIZATION_CATEGORY_META[cat].badgeIcon}{' '}
                    {OPTIMIZATION_CATEGORY_META[cat].shortLabel} (
                    {notes.filter((n) => n.category === cat).length})
                  </button>
                ))}
              </div>

              {filteredNotes.length === 0 ? (
                <div className="empty-state-box" style={{ padding: '36px 20px', textAlign: 'center' }}>
                  <Lightbulb size={36} color="#f0c878" style={{ margin: '0 auto 10px' }} />
                  <p style={{ fontSize: 14.5, color: '#F6F4EE' }}>
                    Chưa có bí kíp nào khớp bộ lọc hiện tại.
                  </p>
                  <button
                    type="button"
                    className="zen-btn zen-btn-seal"
                    style={{ marginTop: 12 }}
                    onClick={() => setActiveSubTab('EDITOR')}
                  >
                    <Plus size={14} /> Thêm Bí Kíp Mới →
                  </button>
                </div>
              ) : (
                <div className="opt-notes-grid">
                  {filteredNotes.map((note) => {
                    const meta = OPTIMIZATION_CATEGORY_META[note.category];
                    const linkedGoal = note.goalId ? goalsById.get(note.goalId) : null;
                    const appliedToday = note.lastAppliedDate === todayStr;

                    return (
                      <div
                        key={note.id}
                        className={`opt-note-card ${note.isPinned ? 'is-pinned' : ''}`}
                      >
                        <div className="opt-note-card-top">
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span className="zen-tag-red">
                              {meta.badgeIcon} {meta.shortLabel}
                            </span>
                            {note.isPinned && (
                              <span className="opt-pinned-badge">
                                <Pin size={11} /> Đang ghim
                              </span>
                            )}
                            {note.timeSavedHint && (
                              <span className="opt-timesaved-pill">
                                <Sparkles size={11} /> {note.timeSavedHint}
                              </span>
                            )}
                            {linkedGoal && (
                              <span className="time-window-pill">⛰️ {linkedGoal.title}</span>
                            )}
                          </div>

                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              type="button"
                              className="ritual-mini-icon-btn"
                              title={note.isPinned ? 'Bỏ ghim' : 'Ghim lên đầu'}
                              onClick={() => handleTogglePin(note.id)}
                            >
                              {note.isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                            </button>
                            <button
                              type="button"
                              className="ritual-mini-icon-btn"
                              title="Chỉnh sửa bí kíp"
                              onClick={() => handleStartEdit(note)}
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              type="button"
                              className="ritual-mini-icon-btn"
                              style={{ color: '#ff8a80' }}
                              title="Xóa bí kíp"
                              onClick={() => handleDeleteNote(note.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <h4 className="opt-note-title">{note.title}</h4>
                        <p className="opt-note-content">{note.content}</p>

                        <div className="opt-note-footer">
                          <span className="zen-muted-text" style={{ fontSize: 11.5 }}>
                            Đã áp dụng:{' '}
                            <strong style={{ color: '#A8D8C6' }}>{note.appliedCount || 0} lần</strong>
                            {appliedToday ? ' (Đã dùng hôm nay ✓)' : ''}
                          </span>

                          <button
                            type="button"
                            className={`zen-btn ${appliedToday ? 'zen-btn-outline' : 'zen-btn-seal'}`}
                            style={{ padding: '5px 11px', fontSize: 12 }}
                            onClick={() => handleApplyToday(note)}
                          >
                            <Zap size={13} />
                            <span>Đã áp dụng hôm nay (+1)</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
