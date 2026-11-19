import React, { useMemo, useState } from 'react';
import { Calendar, Flame, ShieldAlert, ShieldCheck, Coffee } from 'lucide-react';
import { MonkDatabaseSchema } from '../types/models';
import {
  getEffectiveNightStartTime,
  getLawConfig,
  getShiftDateStr,
  isRestDay,
  isRitualScheduledForDate,
  shiftDateStr,
  findDayViolations,
  VIOLATION_TYPE_LABELS,
} from '../services/mountainLaws';

type HeatmapDayStatus = 'CLEAN_HIGH' | 'CLEAN_MID' | 'CLEAN_LOW' | 'VIOLATED' | 'REST_DAY' | 'PENDING_TODAY' | 'INACTIVE';

interface HeatmapDayCell {
  date: string;
  dayOfWeek: number; // 0=CN, 1=T2 ... 6=T7
  status: HeatmapDayStatus;
  completedTodos: number;
  completedRituals: number;
  scheduledRituals: number;
  violationsCount: number;
  violationSummary: string;
  restReason?: string;
}

interface DisciplineHeatmapProps {
  db: MonkDatabaseSchema;
  todayStr: string;
}

const WEEKDAY_ROW_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function formatViDateShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export const DisciplineHeatmap: React.FC<DisciplineHeatmapProps> = ({ db, todayStr }) => {
  const [rangeDays, setRangeDays] = useState<90 | 180 | 365>(90);
  const [hoveredCell, setHoveredCell] = useState<HeatmapDayCell | null>(null);

  const lawConfig = useMemo(() => getLawConfig(db), [db]);
  const nightStartStr = useMemo(() => getEffectiveNightStartTime(lawConfig), [lawConfig]);

  const { weeks, summary } = useMemo(() => {
    const startMs = db.session.startTime || Date.now();
    const rawSessionStartStr = getShiftDateStr(
      startMs,
      lawConfig.workShiftMode,
      nightStartStr
    );
    const heatmapResetDate = db.session.heatmapResetDate || '';
    const heatmapResetAt = db.session.heatmapResetAt || 0;
    const sessionStartStr =
      heatmapResetDate && heatmapResetDate > rawSessionStartStr
        ? heatmapResetDate
        : rawSessionStartStr;
    const lastEvalStr = db.session.lastEvaluatedDate || '';

    // Index violations by date (respecting heatmapResetDate / heatmapResetAt)
    const vioByDate = new Map<string, string[]>();
    for (const v of db.violations) {
      if (heatmapResetDate && v.date < heatmapResetDate) continue;
      if (heatmapResetAt && v.timestamp && v.timestamp < heatmapResetAt) continue;
      const list = vioByDate.get(v.date) || [];
      list.push(VIOLATION_TYPE_LABELS[v.type] || v.reason);
      vioByDate.set(v.date, list);
    }

    // Index completed strikes by date (respecting heatmapResetDate / heatmapResetAt)
    const completedStrikesByDate = new Map<string, number>();
    const totalStrikesByDate = new Map<string, number>();
    for (const s of db.dailyStrikes) {
      if (heatmapResetDate && s.date < heatmapResetDate) continue;
      const relevantTs = s.completedAt || s.createdAt || 0;
      if (heatmapResetAt && relevantTs > 0 && relevantTs < heatmapResetAt) continue;
      totalStrikesByDate.set(s.date, (totalStrikesByDate.get(s.date) || 0) + 1);
      if (s.status === 'COMPLETED') {
        completedStrikesByDate.set(s.date, (completedStrikesByDate.get(s.date) || 0) + 1);
      }
    }

    // Index rest days (respecting heatmapResetDate / heatmapResetAt)
    const restMap = new Map<string, string>();
    for (const r of db.session.restDays || []) {
      if (heatmapResetDate && r.date < heatmapResetDate) continue;
      if (heatmapResetAt && r.registeredAt && r.registeredAt < heatmapResetAt) continue;
      restMap.set(r.date, r.reason || 'Ngày nghỉ có phép');
    }

    const cells: HeatmapDayCell[] = [];
    let cleanCount = 0;
    let violatedCount = 0;
    let restCount = 0;

    for (let offset = rangeDays - 1; offset >= 0; offset--) {
      const date = shiftDateStr(todayStr, -offset);
      const [y, m, d] = date.split('-').map(Number);
      const dayOfWeek = new Date(y, m - 1, d, 12).getDay();

      if (heatmapResetDate && date < heatmapResetDate) {
        cells.push({
          date,
          dayOfWeek,
          status: 'INACTIVE',
          completedTodos: 0,
          completedRituals: 0,
          scheduledRituals: 0,
          violationsCount: 0,
          violationSummary: '',
        });
        continue;
      }

      const completedTodos = completedStrikesByDate.get(date) || 0;
      const totalTodos = totalStrikesByDate.get(date) || 0;
      const dayViolations = vioByDate.get(date) || [];

      let completedRituals = 0;
      let scheduledRituals = 0;
      for (const g of db.ritualGroups || []) {
        for (const it of g.items) {
          if (isRitualScheduledForDate(it, date)) {
            if (!it.createdAt || getShiftDateStr(it.createdAt, lawConfig.workShiftMode, nightStartStr) <= date) {
              scheduledRituals++;
            }
            const doneTs = it.completedDates?.[date];
            if (doneTs && (!heatmapResetAt || doneTs >= heatmapResetAt)) {
              completedRituals++;
            }
          }
        }
      }

      const isApprovedRest = restMap.has(date) && isRestDay(db, date, lawConfig);
      let status: HeatmapDayStatus = 'INACTIVE';

      if (dayViolations.length > 0) {
        status = 'VIOLATED';
        violatedCount++;
      } else if (isApprovedRest) {
        status = 'REST_DAY';
        restCount++;
      } else if (date === todayStr) {
        const todayFindings = findDayViolations(db, todayStr, lawConfig);
        if (todayFindings.length === 0 && (completedTodos > 0 || completedRituals > 0)) {
          const effort = completedTodos * 2 + completedRituals;
          status = effort >= 6 ? 'CLEAN_HIGH' : effort >= 3 ? 'CLEAN_MID' : 'CLEAN_LOW';
          cleanCount++;
        } else if (todayFindings.length > 0 || totalTodos > 0 || (scheduledRituals > 0 && completedRituals > 0)) {
          status = 'PENDING_TODAY';
        }
      } else {
        const hadEvaluatedClean =
          date >= sessionStartStr &&
          Boolean(lastEvalStr && date <= lastEvalStr) &&
          (totalTodos > 0 || scheduledRituals > 0);
        const hadConcreteWork = completedTodos > 0 || completedRituals > 0;
        if (hadConcreteWork || hadEvaluatedClean) {
          const effort = completedTodos * 2 + completedRituals;
          status = effort >= 6 ? 'CLEAN_HIGH' : effort >= 3 ? 'CLEAN_MID' : 'CLEAN_LOW';
          cleanCount++;
        }
      }

      cells.push({
        date,
        dayOfWeek,
        status,
        completedTodos,
        completedRituals,
        scheduledRituals,
        violationsCount: dayViolations.length,
        violationSummary: dayViolations.join(' • '),
        restReason: isApprovedRest ? restMap.get(date) : undefined,
      });
    }

    // Group into columns starting Monday (index 0 = T2 ... index 6 = CN)
    const first = cells[0];
    const firstMonOffset = first ? (first.dayOfWeek === 0 ? 6 : first.dayOfWeek - 1) : 0;
    const padded: Array<HeatmapDayCell | null> = [
      ...Array.from({ length: firstMonOffset }, () => null),
      ...cells,
    ];
    const cols: Array<Array<HeatmapDayCell | null>> = [];
    for (let i = 0; i < padded.length; i += 7) {
      const slice = padded.slice(i, i + 7);
      while (slice.length < 7) slice.push(null);
      cols.push(slice);
    }

    const totalEvaluatedActive = cleanCount + violatedCount;
    const adherencePct =
      totalEvaluatedActive > 0 ? Math.round((cleanCount / totalEvaluatedActive) * 100) : 100;

    return {
      weeks: cols,
      summary: {
        cleanCount,
        violatedCount,
        restCount,
        adherencePct,
      },
    };
  }, [db, todayStr, rangeDays, lawConfig, nightStartStr]);

  const activePreview = hoveredCell || weeks.flat().filter(Boolean).slice(-1)[0] || null;

  return (
    <div className="discipline-heatmap-card">
      <div className="discipline-heatmap-header">
        <div>
          <span className="zen-tag-red">BẢN ĐỒ NHIỆT KỶ LUẬT (DISCIPLINE HEATMAP)</span>
          <h3 className="discipline-heatmap-title">
            🗓️ Theo Dõi Chuỗi Ngày Kỷ Luật ({rangeDays} Ngày Gần Nhất)
          </h3>
        </div>

        <div className="heatmap-range-tabs">
          {([90, 180, 365] as const).map((days) => (
            <button
              key={days}
              type="button"
              className={`heatmap-range-btn ${rangeDays === days ? 'active' : ''}`}
              onClick={() => setRangeDays(days)}
            >
              {days} ngày
            </button>
          ))}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="heatmap-kpi-strip">
        <div className="heatmap-kpi-item jade">
          <ShieldCheck size={16} color="#5BAE93" />
          <span>
            Ngày sạch kỷ luật: <strong>{summary.cleanCount} ngày</strong>
          </span>
        </div>
        <div className="heatmap-kpi-item crimson">
          <ShieldAlert size={16} color="#ff8a80" />
          <span>
            Ngày vi phạm: <strong>{summary.violatedCount} ngày</strong>
          </span>
        </div>
        <div className="heatmap-kpi-item amber">
          <Coffee size={16} color="#f0c878" />
          <span>
            Nghỉ có phép: <strong>{summary.restCount} ngày</strong>
          </span>
        </div>
        <div className="heatmap-kpi-item">
          <Flame size={16} color="#ff9800" />
          <span>
            Tỷ lệ giữ giới: <strong>{summary.adherencePct}%</strong>
          </span>
        </div>
      </div>

      {/* Scrollable Matrix */}
      <div className="heatmap-matrix-wrap">
        <div className="heatmap-weekday-col">
          {WEEKDAY_ROW_LABELS.map((lbl) => (
            <span key={lbl}>{lbl}</span>
          ))}
        </div>

        <div className="heatmap-weeks-grid">
          {weeks.map((week, wIdx) => (
            <div key={wIdx} className="heatmap-week-col">
              {week.map((cell, rIdx) => {
                if (!cell) {
                  return <div key={`empty-${wIdx}-${rIdx}`} className="heatmap-cell spacer" />;
                }
                const titleText =
                  cell.status === 'VIOLATED'
                    ? `${formatViDateShort(cell.date)}: ${cell.violationsCount} vi phạm (${cell.violationSummary})`
                    : cell.status === 'REST_DAY'
                    ? `${formatViDateShort(cell.date)}: Ngày nghỉ có phép — ${cell.restReason}`
                    : cell.status === 'PENDING_TODAY'
                    ? `${formatViDateShort(cell.date)} (Hôm nay): Đang thực hiện (${cell.completedTodos} Todo, ${cell.completedRituals} Nghi thức)`
                    : cell.status === 'INACTIVE'
                    ? `${formatViDateShort(cell.date)}: Chưa có dữ liệu`
                    : `${formatViDateShort(cell.date)}: Sạch kỷ luật — ${cell.completedTodos} Todo, ${cell.completedRituals} Nghi thức`;

                return (
                  <div
                    key={cell.date}
                    className={`heatmap-cell status-${cell.status.toLowerCase()} ${
                      cell.date === todayStr ? 'is-today' : ''
                    } ${hoveredCell?.date === cell.date ? 'is-hovered' : ''}`}
                    title={titleText}
                    onMouseEnter={() => setHoveredCell(cell)}
                    onMouseLeave={() => setHoveredCell(null)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Legend + Hover Inspector */}
      <div className="heatmap-footer-bar">
        <div className="heatmap-inspector-text">
          <Calendar size={14} color="#7DBFA8" />
          {activePreview ? (
            <span>
              <strong>{formatViDateShort(activePreview.date)}</strong>:{' '}
              {activePreview.status === 'VIOLATED' ? (
                <span style={{ color: '#ff8a80' }}>
                  Vi phạm ({activePreview.violationsCount} lỗi: {activePreview.violationSummary})
                </span>
              ) : activePreview.status === 'REST_DAY' ? (
                <span style={{ color: '#f0c878' }}>
                  Thẻ Nghỉ Có Phép ({activePreview.restReason}) — Streak được bảo toàn
                </span>
              ) : activePreview.status === 'PENDING_TODAY' ? (
                <span style={{ color: '#ffd54f' }}>
                  Hôm nay đang thực hiện: {activePreview.completedTodos} Todo,{' '}
                  {activePreview.completedRituals} Nghi thức
                </span>
              ) : activePreview.status === 'INACTIVE' ? (
                <span className="zen-muted-text">Chưa có hoạt động ghi nhận</span>
              ) : (
                <span style={{ color: '#81c784' }}>
                  Giữ vững kỷ luật ({activePreview.completedTodos} Todo xong &bull;{' '}
                  {activePreview.completedRituals} bước Nghi Thức)
                </span>
              )}
            </span>
          ) : (
            <span>Di chuột qua từng ô ngày để xem chi tiết kỷ luật</span>
          )}
        </div>

        <div className="heatmap-legend">
          <span>Trống</span>
          <span className="heatmap-cell status-inactive" />
          <span>Hoàn thành</span>
          <span className="heatmap-cell status-clean_low" />
          <span className="heatmap-cell status-clean_mid" />
          <span className="heatmap-cell status-clean_high" />
          <span>Nghỉ phép</span>
          <span className="heatmap-cell status-rest_day" />
          <span>Vi phạm</span>
          <span className="heatmap-cell status-violated" />
        </div>
      </div>
    </div>
  );
};
