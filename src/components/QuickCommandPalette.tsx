import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  CornerDownLeft,
  Flame,
  Lightbulb,
  Mountain,
  PieChart,
  Scale,
  ScrollText,
  Search,
  Settings,
  Sparkles,
  Swords,
  X,
} from 'lucide-react';
import { DailyStrikeTodoEntity, MonkDatabaseSchema, SIDE_QUEST_GOAL_ID } from '../types/models';

export interface QuickCommandTarget {
  id: string;
  group: 'TAB' | 'MOUNTAIN' | 'STRIKE' | 'OPT_NOTE';
  title: string;
  subtitle: string;
  shortcut?: string;
  onSelect: () => void;
}

interface QuickCommandPaletteProps {
  isOpen: boolean;
  db: MonkDatabaseSchema;
  onClose: () => void;
  onSelectOuterTab: (
    tab:
      | 'GOALS_LIST'
      | 'AI_SCHEDULE'
      | 'TIME_AUDIT'
      | 'OPTIMIZATION_VAULT'
      | 'SIDE_QUESTS'
      | 'RITUALS'
      | 'LAWS'
      | 'TANG_KINH_CAC'
      | 'SETTINGS'
  ) => void;
  onSelectGoal: (goalId: string) => void;
  onEnterFocusStrike: (strike: DailyStrikeTodoEntity) => void;
}

export const QuickCommandPalette: React.FC<QuickCommandPaletteProps> = ({
  isOpen,
  db,
  onClose,
  onSelectOuterTab,
  onSelectGoal,
  onEnterFocusStrike,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [isOpen]);

  const allItems = useMemo<QuickCommandTarget[]>(() => {
    const items: QuickCommandTarget[] = [
      {
        id: 'tab-goals',
        group: 'TAB',
        title: '1. Các Đỉnh Núi (Goals Hub)',
        subtitle: 'Chuyển tới màn hình tổng quan các Đỉnh Núi',
        shortcut: 'Ctrl+1',
        onSelect: () => onSelectOuterTab('GOALS_LIST'),
      },
      {
        id: 'tab-ai',
        group: 'TAB',
        title: '2. Lịch Trình AI',
        subtitle: 'Xem lịch hôm nay, sửa tuần Auto-Cascade & cài đặt ca',
        shortcut: 'Ctrl+2',
        onSelect: () => onSelectOuterTab('AI_SCHEDULE'),
      },
      {
        id: 'tab-audit',
        group: 'TAB',
        title: '3. Quỹ Thời Gian & Hiệu Suất',
        subtitle: 'Kiểm toán thời gian tận dụng, lãng phí & Báo Cáo Tuần',
        shortcut: 'Ctrl+3',
        onSelect: () => onSelectOuterTab('TIME_AUDIT'),
      },
      {
        id: 'tab-opt',
        group: 'TAB',
        title: '4. Bí Kíp & Ý Tưởng',
        subtitle: 'Kho mẹo 1 công đôi việc & trick tiết kiệm thời gian',
        shortcut: 'Ctrl+4',
        onSelect: () => onSelectOuterTab('OPTIMIZATION_VAULT'),
      },
      {
        id: 'tab-side',
        group: 'TAB',
        title: '5. Việc Vặt',
        subtitle: 'Tắm rửa, giặt đồ, dọn nhà kèm Pomodoro',
        shortcut: 'Ctrl+5',
        onSelect: () => onSelectOuterTab('SIDE_QUESTS'),
      },
      {
        id: 'tab-rituals',
        group: 'TAB',
        title: '6. Nghi Thức',
        subtitle: 'Checklist thói quen cố định hằng ngày',
        shortcut: 'Ctrl+6',
        onSelect: () => onSelectOuterTab('RITUALS'),
      },
      {
        id: 'tab-laws',
        group: 'TAB',
        title: '7. Luật Núi',
        subtitle: 'Kiểm tra vi phạm, xin nghỉ phép & đổi giờ vào ca',
        shortcut: 'Ctrl+7',
        onSelect: () => onSelectOuterTab('LAWS'),
      },
      {
        id: 'tab-scrolls',
        group: 'TAB',
        title: '8. Tàng Kinh Các',
        subtitle: 'Cuộn chứng nhận & Bản đồ nhiệt kỷ luật',
        shortcut: 'Ctrl+8',
        onSelect: () => onSelectOuterTab('TANG_KINH_CAC'),
      },
      {
        id: 'tab-settings',
        group: 'TAB',
        title: '9. Cài Đặt & Nền',
        subtitle: 'Daemon, dọn dữ liệu, sao lưu JSON/ảnh & Reset',
        shortcut: 'Ctrl+9',
        onSelect: () => onSelectOuterTab('SETTINGS'),
      },
    ];

    (db.peakGoals || []).forEach((g, idx) => {
      items.push({
        id: `goal-${g.id}`,
        group: 'MOUNTAIN',
        title: `Núi #${idx + 1}: ${g.title}`,
        subtitle: `${g.category || 'Mục tiêu'} • Tiến độ ${g.progressPct}%`,
        onSelect: () => onSelectGoal(g.id),
      });
    });

    const goalsMap = new Map((db.peakGoals || []).map((g) => [g.id, g.title]));
    (db.dailyStrikes || [])
      .filter((s) => s.status !== 'COMPLETED')
      .slice(0, 40)
      .forEach((s) => {
        const gTitle =
          s.goalId === SIDE_QUEST_GOAL_ID ? 'Việc Vặt' : goalsMap.get(s.goalId) || 'Đỉnh Núi';
        items.push({
          id: `strike-${s.id}`,
          group: 'STRIKE',
          title: `Chiến Pomodoro: ${s.title}`,
          subtitle: `${gTitle} • ${s.requiredPomodoroMins}p (Đã chạy ${s.completedPomodoroMins || 0}p)`,
          onSelect: () => onEnterFocusStrike(s),
        });
      });

    (db.optimizationNotes || []).forEach((n) => {
      items.push({
        id: `opt-${n.id}`,
        group: 'OPT_NOTE',
        title: `Bí Kíp: ${n.title}`,
        subtitle: `${n.timeSavedHint || 'Mẹo tối ưu'} • Đã áp dụng ${n.appliedCount || 0} lần`,
        onSelect: () => onSelectOuterTab('OPTIMIZATION_VAULT'),
      });
    });

    return items;
  }, [db.peakGoals, db.dailyStrikes, db.optimizationNotes, onSelectOuterTab, onSelectGoal, onEnterFocusStrike]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems.slice(0, 14);
    return allItems
      .filter(
        (it) => it.title.toLowerCase().includes(q) || it.subtitle.toLowerCase().includes(q)
      )
      .slice(0, 16);
  }, [allItems, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const renderIcon = (item: QuickCommandTarget) => {
    if (item.group === 'MOUNTAIN') return <Mountain size={16} color="#5BAE93" />;
    if (item.group === 'STRIKE') return <Swords size={16} color="#f0c878" />;
    if (item.group === 'OPT_NOTE') return <Lightbulb size={16} color="#ffca28" />;
    if (item.id === 'tab-audit') return <PieChart size={16} color="#4dd0e1" />;
    if (item.id === 'tab-ai') return <Bot size={16} color="#A8D8C6" />;
    if (item.id === 'tab-rituals') return <Flame size={16} color="#ffb74d" />;
    if (item.id === 'tab-laws') return <Scale size={16} color="#ff8a80" />;
    if (item.id === 'tab-scrolls') return <ScrollText size={16} color="#f0c878" />;
    if (item.id === 'tab-settings') return <Settings size={16} color="#B8B4A9" />;
    return <Sparkles size={16} color="#A8D8C6" />;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0
      );
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].onSelect();
      onClose();
    }
  };

  return (
    <div className="cmd-palette-backdrop" onClick={onClose}>
      <div className="cmd-palette-modal" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="cmd-palette-search-row">
          <Search size={18} color="#5BAE93" />
          <input
            ref={inputRef}
            type="text"
            className="cmd-palette-input"
            placeholder="Tìm nhanh Đỉnh Núi, Todo đang chờ, Bí kíp, hoặc Tab (VD: hsk, guitar, quỹ thời gian...)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="zen-btn zen-btn-ghost" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="cmd-palette-list">
          {filtered.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#9E9A8E', fontSize: 13 }}>
              Không tìm thấy mục nào khớp với "{query}".
            </div>
          ) : (
            filtered.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                className={`cmd-palette-item ${idx === selectedIndex ? 'active' : ''}`}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => {
                  item.onSelect();
                  onClose();
                }}
              >
                <div className="cmd-palette-item-left">
                  {renderIcon(item)}
                  <div style={{ textAlign: 'left', minWidth: 0 }}>
                    <div className="cmd-palette-title">{item.title}</div>
                    <div className="cmd-palette-sub">{item.subtitle}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {item.shortcut && <span className="cmd-palette-kbd">{item.shortcut}</span>}
                  {idx === selectedIndex && <CornerDownLeft size={14} color="#5BAE93" />}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="cmd-palette-footer">
          <span>↑↓ Di chuyển</span>
          <span>Enter để mở thẳng</span>
          <span>Esc đóng</span>
          <span>Phím tắt: Ctrl+K • Ctrl+1..9</span>
        </div>
      </div>
    </div>
  );
};
