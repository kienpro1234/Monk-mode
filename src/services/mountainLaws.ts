import {
  MonkDatabaseSchema,
  MountainLawConfig,
  ViolationRecord,
  DailyStrikeTodoEntity,
  RitualCheckItem,
  WorkShiftMode,
  OfflineGapReport,
} from '../types/models';
import { getTodayDateStr } from './defaultData';

/* =============================================================================
   BỘ LUẬT NÚI — HỆ THỐNG TỰ ĐỘNG XÉT DUYỆT VI PHẠM
   - Mỗi khi qua ngày mới (hoặc kết thúc ca làm việc) hoặc khi mở app lần đầu,
     hệ thống sẽ xét duyệt TẤT CẢ các ngày chưa được xét kể từ lần trước.
   - Hỗ trợ Chế độ Ca Ngày (07:00 - 24:00) & Ca Đêm (19:00 - 19:00 hôm sau)
     giúp người đi làm ca đêm không bị tính vi phạm nhầm lúc nửa đêm.
   - Luật chỉ có hiệu lực sau khi người dùng đã đọc & ký cam kết (lawsAcceptedAt).
   ============================================================================= */

export type MountainLawId = 'LAW_STRIKE' | 'LAW_RITUAL' | 'LAW_EMPTY_DAY' | 'LAW_JOURNAL';

export const DEFAULT_LAW_CONFIG: MountainLawConfig = {
  strikeLawEnabled: true,
  ritualLawEnabled: true,
  emptyDayLawEnabled: true,
  journalLawEnabled: false,
  ritualPassThresholdPct: 70,
  workShiftMode: 'DAY',
  dayShiftStartTime: '08:00',
  nightShiftStartTime: '19:00',
  nightShiftStartHour: 19,
  maxDailyTaskModifications: 3,
  maxMonthlyRestDays: 2,
};

export interface MountainLawDefinition {
  id: MountainLawId;
  number: number;
  configKey: keyof MountainLawConfig;
  isCore: boolean;
  title: string;
  shortTitle: string;
  rule: string;
  penalty: string;
  notes: string[];
}

export const MOUNTAIN_LAWS: MountainLawDefinition[] = [
  {
    id: 'LAW_STRIKE',
    number: 1,
    configKey: 'strikeLawEnabled',
    isCore: true,
    title: 'Luật Công Phá — Việc của hôm nay phải xong trong hôm nay',
    shortTitle: 'Todo Công Phá',
    rule:
      'Mọi Todo Công Phá được tạo trong ngày phải được đánh dấu HOÀN THÀNH trước 23:59 cùng ngày.',
    penalty: 'Mỗi ngọn núi còn Todo dang dở khi hết ngày = 1 lần vi phạm.',
    notes: [
      'Todo đang BẬT Live PoW chỉ được tính là hoàn thành khi đã tải ảnh bằng chứng.',
      'Todo quá hạn vẫn có thể hoàn thành muộn để lưu vào lịch sử, nhưng vết vi phạm không bị xóa.',
      'Chỉ đặt những việc bạn thực sự làm được trong hôm nay — lên kế hoạch trung thực là một phần của kỷ luật.',
    ],
  },
  {
    id: 'LAW_RITUAL',
    number: 2,
    configKey: 'ritualLawEnabled',
    isCore: true,
    title: 'Luật Nghi Thức — Duy trì tối thiểu 70% thói quen cốt lõi (Quy tắc Khoa Học >69%)',
    shortTitle: 'Nghi Thức (≥70%)',
    rule: 'Hoàn thành tối thiểu ngưỡng chuẩn (mặc định ≥ 70%, tức trên 69%) tổng số bước Nghi Thức được lên lịch trong ngày.',
    penalty: 'Tỷ lệ hoàn thành Nghi Thức cuối ngày dưới ngưỡng tối thiểu = 1 lần vi phạm.',
    notes: [
      'Cơ sở khoa học (UCL Habit Study & Quy tắc 70%): Duy trì ≥70% mỗi ngày giúp hình thành thói quen bền vững dài hạn và loại bỏ tâm lý "sai 1 bước là bỏ cả ngày".',
      'Thói quen mới thêm chỉ bị xét kể từ ngày nó được tạo ra; bạn cũng có thể tùy chỉnh ngưỡng 70%–100% tùy giai đoạn.',
      'Vẫn khuyến khích hoàn thành 100% nếu đủ sức, nhưng hệ thống chỉ bảo vệ kỷ luật ở ngưỡng khoa học để tránh kiệt sức.',
    ],
  },
  {
    id: 'LAW_EMPTY_DAY',
    number: 3,
    configKey: 'emptyDayLawEnabled',
    isCore: true,
    title: 'Luật Không Ngày Trống — Không để một ngày trôi qua vô ích',
    shortTitle: 'Không ngày trống',
    rule:
      'Khi đang có ít nhất 1 ngọn núi chưa chinh phục, mỗi ngày phải có ít nhất 1 Todo Công Phá (ở bất kỳ ngọn núi nào).',
    penalty: 'Một ngày không có bất kỳ Todo Công Phá nào = 1 lần vi phạm.',
    notes: [
      'Luật này chặn kẽ hở "không tạo Todo thì không bao giờ bị phạt".',
      'Kết hợp với Luật 1: mỗi ngày ít nhất phải có 1 việc được hoàn thành cho mục tiêu của bạn.',
    ],
  },
  {
    id: 'LAW_JOURNAL',
    number: 4,
    configKey: 'journalLawEnabled',
    isCore: false,
    title: 'Luật Tự Vấn — Ngày có chiến đấu thì phải có suy ngẫm (Tùy chọn)',
    shortTitle: 'Tự Vấn',
    rule: 'Ngày nào có Todo Công Phá thì phải viết ít nhất 1 bài Tự Vấn trước khi hết ngày.',
    penalty: 'Ngày có Công Phá nhưng không có bài Tự Vấn nào = 1 lần vi phạm.',
    notes: ['Mặc định TẮT. Bật lên khi bạn muốn rèn thói quen tổng kết cuối ngày.'],
  },
];

export const VIOLATION_TYPE_LABELS: Record<ViolationRecord['type'], string> = {
  UNFINISHED_STRIKE: 'Luật 1 — Bỏ dở Công Phá',
  MISSED_RITUAL: 'Luật 2 — Bỏ sót Nghi Thức',
  EMPTY_DAY: 'Luật 3 — Ngày trống',
  MISSED_JOURNAL: 'Luật 4 — Thiếu Tự Vấn',
  POW_POMODORO_ABANDONED: 'Bỏ dở Pomodoro',
  MANUAL_SIMULATION: 'Tự khai báo',
};

export function getLawConfig(db: MonkDatabaseSchema): MountainLawConfig {
  return { ...DEFAULT_LAW_CONFIG, ...(db.session.lawConfig || {}) };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateStr(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split('-').map(Number);
  return [y, m, d];
}

/** Dịch chuyển chuỗi ngày YYYY-MM-DD đi deltaDays ngày (theo giờ địa phương). */
export function shiftDateStr(dateStr: string, deltaDays: number): string {
  const [y, m, d] = parseDateStr(dateStr);
  return getTodayDateStr(new Date(y, m - 1, d + deltaDays, 12).getTime());
}

export function parseShiftStartHM(
  nightStart: string | number = 19,
  fallbackHour: number = 19
): { hour: number; minute: number; label: string } {
  if (typeof nightStart === 'number' && Number.isFinite(nightStart)) {
    const h = Math.max(0, Math.min(23, Math.floor(nightStart)));
    return { hour: h, minute: 0, label: `${String(h).padStart(2, '0')}:00` };
  }
  if (typeof nightStart === 'string' && /^\d{1,2}:\d{2}$/.test(nightStart.trim())) {
    const [hRaw, mRaw] = nightStart.trim().split(':').map(Number);
    if (Number.isFinite(hRaw) && Number.isFinite(mRaw)) {
      const h = Math.max(0, Math.min(23, hRaw));
      const m = Math.max(0, Math.min(59, mRaw));
      return {
        hour: h,
        minute: m,
        label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      };
    }
  }
  const h = Math.max(0, Math.min(23, Math.floor(fallbackHour)));
  return { hour: h, minute: 0, label: `${String(h).padStart(2, '0')}:00` };
}

export function getEffectiveNightStartTime(config: MountainLawConfig): string {
  if (config.nightShiftStartTime && /^\d{1,2}:\d{2}$/.test(config.nightShiftStartTime.trim())) {
    return parseShiftStartHM(config.nightShiftStartTime, config.nightShiftStartHour ?? 19).label;
  }
  return parseShiftStartHM(config.nightShiftStartHour ?? 19).label;
}

export function getEffectiveDayStartTime(config: MountainLawConfig): string {
  if (config.dayShiftStartTime && /^\d{1,2}:\d{2}$/.test(config.dayShiftStartTime.trim())) {
    return parseShiftStartHM(config.dayShiftStartTime, 8).label;
  }
  return '08:00';
}

/**
 * Lấy chuỗi ngày YYYY-MM-DD theo ca làm việc hiện tại:
 * - Ca Ngày ('DAY'): Ngày theo lịch bình thường (hết ngày lúc 23:59:59).
 * - Ca Đêm ('NIGHT'): Ca bắt đầu từ giờ vào làm Ca Đêm (linh hoạt 19:00, 20:00...) hôm nay
 *   đến trước giờ vào làm hôm sau.
 */
export function getShiftDateStr(
  timestampMs: number = Date.now(),
  shiftMode: WorkShiftMode = 'DAY',
  nightStart: string | number = 19
): string {
  if (shiftMode !== 'NIGHT') {
    return getTodayDateStr(timestampMs);
  }
  const { hour, minute } = parseShiftStartHM(nightStart, 19);
  const offsetMs = (hour * 60 + minute) * 60 * 1000;
  return getTodayDateStr(timestampMs - offsetMs);
}

/**
 * Mốc thời gian kết thúc ca làm việc của ngày dateStr (ms epoch):
 * - Ca Ngày: 23:59:59.999 của ngày dateStr.
 * - Ca Đêm: ngay trước giờ vào ca hôm sau (kéo dài tròn 24 tiếng kể từ giờ vào ca dateStr).
 */
export function getShiftEndOfDayMs(
  dateStr: string,
  shiftMode: WorkShiftMode = 'DAY',
  nightStart: string | number = 19
): number {
  const [y, m, d] = parseDateStr(dateStr);
  if (shiftMode !== 'NIGHT') {
    return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  }
  const { hour, minute } = parseShiftStartHM(nightStart, 19);
  return new Date(y, m - 1, d + 1, hour, minute, 0, 0).getTime() - 1;
}

export function endOfDayMs(
  dateStr: string,
  shiftMode: WorkShiftMode = 'DAY',
  nightStart: string | number = 19
): number {
  return getShiftEndOfDayMs(dateStr, shiftMode, nightStart);
}

export function getDayOfWeek(dateStr: string): number {
  const [y, m, d] = parseDateStr(dateStr);
  return new Date(y, m - 1, d, 12).getDay();
}

export function isRitualScheduledForDate(
  item: Pick<RitualCheckItem, 'daysOfWeek'>,
  dateStr: string
): boolean {
  if (!item.daysOfWeek || item.daysOfWeek.length === 0) return true;
  return item.daysOfWeek.includes(getDayOfWeek(dateStr));
}

export function isRestDay(
  db: MonkDatabaseSchema,
  dateStr: string,
  config: MountainLawConfig = getLawConfig(db)
): boolean {
  const restDays = db.session?.restDays || [];
  const rec = restDays.find((r) => r.date === dateStr);
  if (!rec) return false;
  const dayEnd = getShiftEndOfDayMs(
    dateStr,
    config.workShiftMode,
    getEffectiveNightStartTime(config)
  );
  return !rec.registeredAt || rec.registeredAt <= dayEnd;
}

export interface LawFindingRitualGroupMissing {
  groupId: string;
  groupTitle: string;
  totalInGroup: number;
  completedInGroup: number;
  missingItems: Array<{ itemId: string; title: string }>;
}

export interface LawFindingRitualProgress {
  completedCount: number;
  totalCount: number;
  requiredCount: number;
  needMoreCount: number;
  completedPct: number;
  thresholdPct: number;
  groupedMissing: LawFindingRitualGroupMissing[];
}

export interface LawFinding {
  lawId: MountainLawId;
  type: ViolationRecord['type'];
  goalId?: string;
  goalTitle?: string;
  reason: string;
  details: string[];
  strikeIdsToMark: string[];
  ritualProgress?: LawFindingRitualProgress;
  emptyDayGoals?: Array<{ id: string; title: string; category?: string; progressPct: number }>;
  unfinishedStrikes?: Array<{
    id: string;
    title: string;
    goalId: string;
    goalTitle: string;
    completedPomo: number;
    requiredPomo: number;
  }>;
}

export function getRitualDayEvaluation(
  db: MonkDatabaseSchema,
  dateStr: string,
  config: MountainLawConfig = getLawConfig(db)
): LawFindingRitualProgress {
  const dayEnd = getShiftEndOfDayMs(
    dateStr,
    config.workShiftMode,
    getEffectiveNightStartTime(config)
  );
  const thresholdPct = Math.max(50, Math.min(100, config.ritualPassThresholdPct ?? 70));

  let totalCount = 0;
  let completedCount = 0;
  const groupedMissing: LawFindingRitualGroupMissing[] = [];

  for (const group of db.ritualGroups || []) {
    let totalInGroup = 0;
    let completedInGroup = 0;
    const missingItems: Array<{ itemId: string; title: string }> = [];

    for (const item of group.items) {
      if (item.createdAt && item.createdAt > dayEnd) continue;
      if (!isRitualScheduledForDate(item, dateStr)) continue;
      totalCount++;
      totalInGroup++;
      if (item.completedDates?.[dateStr]) {
        completedCount++;
        completedInGroup++;
      } else {
        missingItems.push({ itemId: item.id, title: item.title });
      }
    }

    if (missingItems.length > 0) {
      groupedMissing.push({
        groupId: group.id,
        groupTitle: group.title,
        totalInGroup,
        completedInGroup,
        missingItems,
      });
    }
  }

  const requiredCount =
    totalCount > 0 ? Math.max(1, Math.ceil((totalCount * thresholdPct) / 100)) : 0;
  const needMoreCount = Math.max(0, requiredCount - completedCount);
  const completedPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 100;

  return {
    completedCount,
    totalCount,
    requiredCount,
    needMoreCount,
    completedPct,
    thresholdPct,
    groupedMissing,
  };
}

/**
 * Xét một ngày cụ thể theo Bộ Luật Núi và trả về danh sách vi phạm (không làm thay đổi DB).
 * Dùng cho cả việc xét duyệt thật (ngày đã qua) lẫn "dự báo" trực tiếp cho hôm nay.
 */
export function findDayViolations(
  db: MonkDatabaseSchema,
  dateStr: string,
  config: MountainLawConfig = getLawConfig(db)
): LawFinding[] {
  if (isRestDay(db, dateStr, config)) {
    return [];
  }
  const findings: LawFinding[] = [];
  const dayEnd = getShiftEndOfDayMs(
    dateStr,
    config.workShiftMode,
    getEffectiveNightStartTime(config)
  );
  const goalsById = new Map(db.peakGoals.map((g) => [g.id, g]));

  // Todo của ngày này thuộc những ngọn núi còn tồn tại
  const dayStrikes = db.dailyStrikes.filter(
    (s) => s.date === dateStr && goalsById.has(s.goalId)
  );

  // ---------- LUẬT 1: CÔNG PHÁ ----------
  if (config.strikeLawEnabled) {
    const byGoal = new Map<string, DailyStrikeTodoEntity[]>();
    for (const s of dayStrikes) {
      const goal = goalsById.get(s.goalId);
      if (!goal || goal.isCompleted) continue;
      const list = byGoal.get(s.goalId) || [];
      list.push(s);
      byGoal.set(s.goalId, list);
    }
    for (const [goalId, list] of byGoal) {
      const unfinished = list.filter((s) => s.status !== 'COMPLETED');
      if (unfinished.length === 0) continue;
      const goal = goalsById.get(goalId)!;
      findings.push({
        lawId: 'LAW_STRIKE',
        type: 'UNFINISHED_STRIKE',
        goalId,
        goalTitle: goal.title,
        reason: `Không hoàn thành ${unfinished.length}/${list.length} Todo Công Phá của núi "${goal.title}" trong ngày ${dateStr}.`,
        details: unfinished.map((s) => `⚔️ ${s.title}`),
        strikeIdsToMark: unfinished.map((s) => s.id),
        unfinishedStrikes: unfinished.map((s) => ({
          id: s.id,
          title: s.title,
          goalId: goal.id,
          goalTitle: goal.title,
          completedPomo: s.completedPomodoroMins || 0,
          requiredPomo: s.requiredPomodoroMins || 25,
        })),
      });
    }
  }

  // ---------- LUẬT 2: NGHI THỨC (NGƯỠNG KHOA HỌC ≥ 70% / TRÊN 69%) ----------
  if (config.ritualLawEnabled) {
    const ritualEval = getRitualDayEvaluation(db, dateStr, config);
    if (ritualEval.totalCount > 0 && ritualEval.completedCount < ritualEval.requiredCount) {
      const missingDetails: string[] = [];
      for (const grp of ritualEval.groupedMissing) {
        const cleanGroupName = grp.groupTitle.replace(/^[^\p{L}\p{N}]+/u, '').trim();
        for (const it of grp.missingItems) {
          missingDetails.push(`${cleanGroupName}: ${it.title}`);
        }
      }
      findings.push({
        lawId: 'LAW_RITUAL',
        type: 'MISSED_RITUAL',
        reason: `Mới hoàn thành ${ritualEval.completedCount}/${ritualEval.totalCount} bước Nghi Thức (${ritualEval.completedPct}%) trong ngày ${dateStr} — Cần đạt tối thiểu ${ritualEval.requiredCount}/${ritualEval.totalCount} bước (≥${ritualEval.thresholdPct}%, cần tích thêm ${ritualEval.needMoreCount} bước).`,
        details: missingDetails,
        strikeIdsToMark: [],
        ritualProgress: ritualEval,
      });
    }
  }

  // ---------- LUẬT 3: KHÔNG NGÀY TRỐNG ----------
  if (config.emptyDayLawEnabled) {
    const activeGoals = db.peakGoals.filter(
      (g) => !g.isCompleted && (g.createdAt || 0) <= dayEnd
    );
    if (activeGoals.length > 0 && dayStrikes.length === 0) {
      findings.push({
        lawId: 'LAW_EMPTY_DAY',
        type: 'EMPTY_DAY',
        reason: `Ngày ${dateStr} chưa có Todo Công Phá nào dù đang leo ${activeGoals.length} ngọn núi.`,
        details: activeGoals.map((g) => `⛰️ ${g.title}`),
        strikeIdsToMark: [],
        emptyDayGoals: activeGoals.map((g) => ({
          id: g.id,
          title: g.title,
          category: g.category,
          progressPct: g.progressPct,
        })),
      });
    }
  }

  // ---------- LUẬT 4: TỰ VẤN ----------
  if (config.journalLawEnabled && dayStrikes.length > 0) {
    const hasJournal = db.reflectionJournals.some((j) => j.date === dateStr);
    if (!hasJournal) {
      findings.push({
        lawId: 'LAW_JOURNAL',
        type: 'MISSED_JOURNAL',
        reason: `Ngày ${dateStr} có ${dayStrikes.length} Todo Công Phá nhưng không viết bài Tự Vấn nào.`,
        details: [],
        strikeIdsToMark: [],
      });
    }
  }

  return findings;
}

export interface LawEvaluationResult {
  db: MonkDatabaseSchema;
  changed: boolean;
  newViolations: ViolationRecord[];
  evaluatedDays: string[];
  cleanDays: string[];
  offlineReport?: OfflineGapReport | null;
}

function formatViDateTime(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${hh}:${min} ${dd}/${mm}/${d.getFullYear()}`;
}

/** Số ngày tối đa được xét bù khi lâu ngày không mở app */
const MAX_CATCH_UP_DAYS = 60;

/**
 * Xét duyệt tất cả các ngày đã qua nhưng chưa được xét (từ lastEvaluatedDate + 1 tới hôm qua).
 * Kết hợp kiểm tra lastActiveAt & maxObservedAt để chống tắt máy trước giờ chốt ngày hoặc tua lùi đồng hồ.
 * Hàm thuần (pure) — trả về DB mới, không có side effect.
 */
export function evaluatePendingDays(
  source: MonkDatabaseSchema,
  todayStr: string,
  nowMs: number = Date.now()
): LawEvaluationResult {
  const config = getLawConfig(source);
  const nightStartTime = getEffectiveNightStartTime(config);
  const lastActiveAt = source.session.lastActiveAt || source.session.startTime || 0;
  const maxObservedAt = source.session.maxObservedAt || 0;
  const clockRollbackDetected = maxObservedAt > 0 && nowMs < maxObservedAt - 60000;
  const effectiveNow = Math.max(nowMs, maxObservedAt, lastActiveAt);
  const effectiveTodayFromClock = getShiftDateStr(
    effectiveNow,
    config.workShiftMode,
    nightStartTime
  );
  const effectiveTodayStr =
    todayStr >= effectiveTodayFromClock ? todayStr : effectiveTodayFromClock;

  const unchanged: LawEvaluationResult = {
    db: source,
    changed: false,
    newViolations: [],
    evaluatedDays: [],
    cleanDays: [],
    offlineReport: null,
  };

  const yesterday = shiftDateStr(effectiveTodayStr, -1);
  let last = source.session.lastEvaluatedDate;

  if (!last || !DATE_RE.test(last)) {
    return {
      ...unchanged,
      changed: true,
      db: {
        ...source,
        session: {
          ...source.session,
          lastEvaluatedDate: yesterday,
          maxObservedAt: effectiveNow,
        },
      },
    };
  }
  if (last >= yesterday) return unchanged;

  const earliest = shiftDateStr(effectiveTodayStr, -MAX_CATCH_UP_DAYS);
  if (last < earliest) last = earliest;

  const sessionStartDateStr = source.session.startTime
    ? getShiftDateStr(source.session.startTime, config.workShiftMode, nightStartTime)
    : earliest;

  let working: MonkDatabaseSchema = source;
  let streak = source.session.currentStreak;
  let violationCount = source.session.violationCount;
  const newViolations: ViolationRecord[] = [];
  const evaluatedDays: string[] = [];
  const cleanDays: string[] = [];
  const offlineMissedDates: string[] = [];

  for (let d = shiftDateStr(last, 1); d <= yesterday; d = shiftDateStr(d, 1)) {
    if (d < sessionStartDateStr) continue;

    const dayEnd = getShiftEndOfDayMs(d, config.workShiftMode, nightStartTime);
    // Nếu ca làm việc của ngày d vẫn chưa hết giờ (ví dụ đang làm ca đêm kéo dài sang ngày hôm sau) -> chưa xét duyệt
    if (effectiveNow < dayEnd) {
      break;
    }

    evaluatedDays.push(d);
    const wasOfflineBeforeCutoff = lastActiveAt > 0 && lastActiveAt < dayEnd;

    const findings = findDayViolations(working, d, config);

    if (findings.length > 0) {
      if (wasOfflineBeforeCutoff) {
        offlineMissedDates.push(d);
      }

      const markIds = new Set(findings.flatMap((f) => f.strikeIdsToMark));
      if (markIds.size > 0) {
        working = {
          ...working,
          dailyStrikes: working.dailyStrikes.map((s) =>
            markIds.has(s.id) && s.status !== 'COMPLETED' ? { ...s, status: 'VIOLATED' } : s
          ),
        };
      }

      for (const f of findings) {
        const extraDetails = wasOfflineBeforeCutoff
          ? [
              ...f.details,
              `🔌 Máy/app ngừng hoạt động lúc ${formatViDateTime(lastActiveAt)} (trước giờ chốt ${formatViDateTime(dayEnd)}), hệ thống tự chốt bù lúc ${formatViDateTime(effectiveNow)}.`,
            ]
          : f.details;
        newViolations.push({
          id: `vio-auto-${d}-${f.lawId}-${f.goalId || 'all'}`,
          sessionId: source.session.id,
          goalId: f.goalId,
          goalTitle: f.goalTitle,
          timestamp: dayEnd,
          date: d,
          type: f.type,
          reason: f.reason,
          previousStreak: streak,
          newTargetEndTime: source.session.currentTargetEndTime,
          autoDetected: true,
          details: extraDetails,
        });
        streak = 0;
        violationCount += 1;
      }
    } else if (!isRestDay(working, d, config)) {
      // Ngày sạch: chỉ cộng Streak nếu ngày đó thực sự có nghĩa vụ phải làm
      // (Ngày Nghỉ Có Phép giữ nguyên Streak nhưng không cộng thêm ngày)
      const hadStrikes = working.dailyStrikes.some((s) => s.date === d);
      const hadRituals = (working.ritualGroups || []).some((g) =>
        g.items.some(
          (it) => (!it.createdAt || it.createdAt <= dayEnd) && isRitualScheduledForDate(it, d)
        )
      );
      if (hadStrikes || hadRituals) {
        streak += 1;
        cleanDays.push(d);
      }
    }
  }

  // Nếu không có ngày nào cần hoặc đủ điều kiện xét duyệt
  if (evaluatedDays.length === 0) {
    return unchanged;
  }

  // Vi phạm mới nhất đứng đầu danh sách
  const sortedNew = [...newViolations].sort((a, b) => b.timestamp - a.timestamp);
  const lastEvaluated = evaluatedDays[evaluatedDays.length - 1];
  const missedDeadlineWhileOffline = offlineMissedDates.length > 0;

  let offlineReport: OfflineGapReport | null = source.session.pendingOfflineReport || null;
  if (missedDeadlineWhileOffline || clockRollbackDetected || sortedNew.length > 0) {
    const summaryParts: string[] = [];
    if (lastActiveAt > 0) {
      summaryParts.push(
        `App ghi nhận hoạt động lần cuối lúc ${formatViDateTime(lastActiveAt)} và mở lại lúc ${formatViDateTime(effectiveNow)}.`
      );
    }
    if (missedDeadlineWhileOffline) {
      summaryParts.push(
        `Bạn đã tắt máy/đóng ứng dụng trước giờ chốt sổ của ${offlineMissedDates.length} ngày (${offlineMissedDates.join(', ')}) khi vẫn còn việc chưa xong.`
      );
    }
    if (sortedNew.length > 0) {
      summaryParts.push(`Hệ thống đã tự động truy thu ${sortedNew.length} vi phạm và xử lý Streak.`);
    }
    if (clockRollbackDetected) {
      summaryParts.push('Phát hiện đồng hồ hệ thống bị chỉnh lùi so với mốc thời gian từng ghi nhận.');
    }

    offlineReport = {
      detectedAt: effectiveNow,
      lastActiveAt,
      evaluatedDates: evaluatedDays,
      missedDates: offlineMissedDates,
      cleanDates: cleanDays,
      missedDeadlineWhileOffline,
      clockRollbackDetected,
      summary: summaryParts.join(' '),
    };
  }

  return {
    db: {
      ...working,
      session: {
        ...working.session,
        currentStreak: streak,
        violationCount,
        lastEvaluatedDate: lastEvaluated,
        maxObservedAt: effectiveNow,
        pendingOfflineReport: offlineReport,
      },
      violations: [...sortedNew, ...working.violations],
    },
    changed: true,
    newViolations: sortedNew,
    evaluatedDays,
    cleanDays,
    offlineReport,
  };
}

/**
 * Chốt sổ & Xét duyệt ngay lập tức cho ngày hiện tại (theo yêu cầu người dùng hoặc khi muốn kiểm tra kết quả cuối ngày ngay).
 */
export function evaluateDayImmediately(
  source: MonkDatabaseSchema,
  dateStr: string
): LawEvaluationResult {
  const config = getLawConfig(source);
  const findings = findDayViolations(source, dateStr, config);
  const now = Date.now();
  const dayEnd = getShiftEndOfDayMs(
    dateStr,
    config.workShiftMode,
    getEffectiveNightStartTime(config)
  );

  let working: MonkDatabaseSchema = source;
  let streak = source.session.currentStreak;
  let violationCount = source.session.violationCount;
  const newViolations: ViolationRecord[] = [];
  const cleanDays: string[] = [];

  if (findings.length > 0) {
    const markIds = new Set(findings.flatMap((f) => f.strikeIdsToMark));
    if (markIds.size > 0) {
      working = {
        ...working,
        dailyStrikes: working.dailyStrikes.map((s) =>
          markIds.has(s.id) && s.status !== 'COMPLETED' ? { ...s, status: 'VIOLATED' } : s
        ),
      };
    }

    for (const f of findings) {
      newViolations.push({
        id: `vio-auto-${dateStr}-${f.lawId}-${f.goalId || 'all'}-${now}`,
        sessionId: source.session.id,
        goalId: f.goalId,
        goalTitle: f.goalTitle,
        timestamp: now,
        date: dateStr,
        type: f.type,
        reason: f.reason,
        previousStreak: streak,
        newTargetEndTime: source.session.currentTargetEndTime,
        autoDetected: true,
        details: f.details,
      });
      streak = 0;
      violationCount += 1;
    }
  } else if (!isRestDay(working, dateStr, config)) {
    const hadStrikes = working.dailyStrikes.some((s) => s.date === dateStr);
    const hadRituals = (working.ritualGroups || []).some((g) =>
      g.items.some(
        (it) => (!it.createdAt || it.createdAt <= dayEnd) && isRitualScheduledForDate(it, dateStr)
      )
    );
    if (hadStrikes || hadRituals) {
      streak += 1;
      cleanDays.push(dateStr);
    }
  }

  return {
    db: {
      ...working,
      session: {
        ...working.session,
        currentStreak: streak,
        violationCount,
        lastEvaluatedDate: dateStr,
      },
      violations: [...newViolations, ...working.violations],
    },
    changed: true,
    newViolations,
    evaluatedDays: [dateStr],
    cleanDays,
  };
}
