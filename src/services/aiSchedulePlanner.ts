import {
  AIClimbingSchedulePlan,
  AIEngineMode,
  AIProviderType,
  ClimbingTimeSlotItem,
  DayClimbingPlan,
  MonkDatabaseSchema,
  PeakGoalEntity,
  ScheduleStrategyMode,
  SIDE_QUEST_GOAL_ID,
  WorkShiftMode,
} from '../types/models';
import { shiftDateStr } from './mountainLaws';

export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export const WEEKDAY_LABELS: Record<number, string> = {
  0: 'Chủ Nhật',
  1: 'Thứ 2',
  2: 'Thứ 3',
  3: 'Thứ 4',
  4: 'Thứ 5',
  5: 'Thứ 6',
  6: 'Thứ 7',
};

export interface MountainBalanceInsight {
  goal: PeakGoalEntity;
  indexNumber: number;
  totalPomoMins: number;
  recent7DaysMins: number;
  completedStrikesCount: number;
  pendingStrikesCount: number;
  lastWorkedDate: string | null;
  daysSinceLastWorked: number;
  sharePct: number;
  status: 'OVER_FOCUSED' | 'NEGLECTED' | 'BALANCED';
  nextMilestoneTitle: string | null;
  urgencyScore: number;
}

export interface ScheduleGenerationOptions {
  shiftMode: WorkShiftMode;
  strategyMode: ScheduleStrategyMode;
  dayWorkStartTime?: string;
  dayShiftClimbStart: string;
  dayShiftClimbEnd: string;
  nightReturnHomeTime: string;
  nightWakeUpTime: string;
  nightWorkStartTime: string;
  maxMountainsPerDay: number;
  aiEngineMode?: AIEngineMode;
  aiProvider?: AIProviderType;
  aiModel?: string;
  externalApiKey?: string;
  customUserPrompt?: string;
  geminiApiKey?: string;
  todayStr: string;
}

export interface AIConnectionTestResult {
  ok: boolean;
  provider: AIProviderType;
  resolvedModel?: string;
  availableModels?: string[];
  message: string;
}

export const AI_PROVIDER_DEFAULTS: Record<
  AIProviderType,
  { label: string; defaultModel: string; fallbackModels: string[]; keyPlaceholder: string; signupUrl: string }
> = {
  GEMINI: {
    label: 'Google Gemini (AI Studio Free Tier — Không cần nạp 800k)',
    defaultModel: 'auto',
    fallbackModels: [
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-flash-latest',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash-latest',
      'gemini-1.5-flash',
    ],
    keyPlaceholder: 'AIzaSy... (Lấy Free API Key tại aistudio.google.com/apikey)',
    signupUrl: 'https://aistudio.google.com/apikey',
  },
  GROQ: {
    label: 'Groq Cloud (Llama 3.3 70B — Miễn phí 100%, không cần thẻ)',
    defaultModel: 'llama-3.3-70b-versatile',
    fallbackModels: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'qwen/qwen3-32b',
      'openai/gpt-oss-120b',
    ],
    keyPlaceholder: 'gsk_... (Lấy Free API Key tại console.groq.com/keys)',
    signupUrl: 'https://console.groq.com/keys',
  },
  OPENROUTER: {
    label: 'OpenRouter (Nhiều Model Free — Miễn phí không cần thẻ)',
    defaultModel: 'openrouter/free',
    fallbackModels: [
      'openrouter/free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'deepseek/deepseek-chat-v3-0324:free',
      'google/gemini-2.0-flash-exp:free',
    ],
    keyPlaceholder: 'sk-or-v1-... (Lấy Free Key tại openrouter.ai/keys)',
    signupUrl: 'https://openrouter.ai/keys',
  },
};

export function extractJsonObjectFromLLMText(rawText: string): any | null {
  if (!rawText || typeof rawText !== 'string') return null;
  let cleaned = rawText.trim();
  // Strip <think>...</think> reasoning blocks if returned by reasoning models (e.g. qwen3 / deepseek)
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // Strip markdown code fences if present
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    cleaned = fenceMatch[1].trim();
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fallback: extract outermost JSON object { ... }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const candidate = cleaned.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function parseTimeToMins(timeStr: string, fallbackMins: number = 0): number {
  if (!timeStr || typeof timeStr !== 'string') return fallbackMins;
  const parts = timeStr.trim().split(':');
  if (parts.length !== 2) return fallbackMins;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallbackMins;
  return Math.max(0, Math.min(1440, Math.round(h * 60 + m)));
}

export function formatMinsToTime(totalMins: number): string {
  const clamped = Math.max(0, Math.min(1440, Math.round(totalMins)));
  if (clamped === 1440) return '24:00';
  const hh = Math.floor(clamped / 60) % 24;
  const mm = clamped % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function getDayOfWeekFromDateStr(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getDay();
}

export function getCurrentTimeMins(nowMs: number = Date.now()): number {
  const d = new Date(nowMs);
  return d.getHours() * 60 + d.getMinutes();
}

export function isSlotActiveNow(slot: ClimbingTimeSlotItem, nowMs: number = Date.now()): boolean {
  const nowMins = getCurrentTimeMins(nowMs);
  const start = parseTimeToMins(slot.startTime, -1);
  const end = parseTimeToMins(slot.endTime, -1);
  if (start < 0 || end < 0) return false;
  if (end > start) {
    return nowMins >= start && nowMins < end;
  }
  return false;
}

function daysBetweenDateStr(olderStr: string, newerStr: string): number {
  const [y1, m1, d1] = olderStr.split('-').map(Number);
  const [y2, m2, d2] = newerStr.split('-').map(Number);
  const t1 = new Date(y1, m1 - 1, d1, 12).getTime();
  const t2 = new Date(y2, m2 - 1, d2, 12).getTime();
  return Math.max(0, Math.round((t2 - t1) / 86400000));
}

export function analyzeMountainBalance(
  db: MonkDatabaseSchema,
  todayStr: string
): MountainBalanceInsight[] {
  const activeGoals = db.peakGoals.filter((g) => !g.isCompleted);
  if (activeGoals.length === 0) return [];

  const sevenDaysAgoStr = shiftDateStr(todayStr, -6);

  const rawList = activeGoals.map((goal, idx) => {
    const goalStrikes = db.dailyStrikes.filter(
      (s) => s.goalId === goal.id && s.goalId !== SIDE_QUEST_GOAL_ID
    );
    const totalPomoMins = goalStrikes.reduce((sum, s) => sum + (s.completedPomodoroMins || 0), 0);
    const recent7DaysMins = goalStrikes
      .filter((s) => s.date >= sevenDaysAgoStr)
      .reduce((sum, s) => sum + (s.completedPomodoroMins || 0), 0);
    const completedStrikesCount = goalStrikes.filter((s) => s.status === 'COMPLETED').length;
    const pendingStrikesCount = goalStrikes.filter((s) => s.status !== 'COMPLETED').length;

    const workedDates = goalStrikes
      .filter((s) => (s.completedPomodoroMins || 0) > 0 || s.status === 'COMPLETED')
      .map((s) => s.date)
      .sort();
    const lastWorkedDate = workedDates.length > 0 ? workedDates[workedDates.length - 1] : null;
    const daysSinceLastWorked = lastWorkedDate ? daysBetweenDateStr(lastWorkedDate, todayStr) : 99;
    const nextMilestone = (goal.milestones || []).find((m) => !m.isCompleted) || null;

    return {
      goal,
      indexNumber: idx + 1,
      totalPomoMins,
      recent7DaysMins,
      completedStrikesCount,
      pendingStrikesCount,
      lastWorkedDate,
      daysSinceLastWorked,
      nextMilestoneTitle: nextMilestone ? nextMilestone.title : null,
    };
  });

  const sumRecent = rawList.reduce((acc, r) => acc + r.recent7DaysMins, 0);
  const sumTotal = rawList.reduce((acc, r) => acc + r.totalPomoMins, 0);
  const denom = sumRecent > 0 ? sumRecent : sumTotal;

  return rawList.map((item) => {
    const sharePct =
      denom > 0
        ? Math.round(((sumRecent > 0 ? item.recent7DaysMins : item.totalPomoMins) / denom) * 100)
        : Math.round(100 / activeGoals.length);

    let status: MountainBalanceInsight['status'] = 'BALANCED';
    if (activeGoals.length >= 2) {
      if (denom > 0 && sharePct >= 50) {
        status = 'OVER_FOCUSED';
      } else if (
        (denom > 0 && sharePct < Math.max(12, Math.floor(60 / activeGoals.length))) ||
        item.daysSinceLastWorked >= 3
      ) {
        status = 'NEGLECTED';
      }
    }

    let deadlineBonus = 0;
    if (item.goal.targetEndTime) {
      const daysLeft = Math.max(1, Math.ceil((item.goal.targetEndTime - Date.now()) / 86400000));
      if (daysLeft <= 14) deadlineBonus = 25;
      else if (daysLeft <= 30) deadlineBonus = 15;
    }

    const neglectBonus =
      status === 'NEGLECTED' ? 40 : status === 'OVER_FOCUSED' ? -20 : 10;
    const recencyBonus = Math.min(30, item.daysSinceLastWorked * 5);
    const urgencyScore = Math.max(
      10,
      50 + neglectBonus + recencyBonus + deadlineBonus - Math.round(sharePct * 0.4)
    );

    return {
      ...item,
      sharePct,
      status,
      urgencyScore,
    };
  });
}

export function isValidHHMM(timeStr: string): boolean {
  if (!timeStr || typeof timeStr !== 'string') return false;
  const trimmed = timeStr.trim();
  if (trimmed === '24:00') return true;
  if (!/^\d{1,2}:\d{2}$/.test(trimmed)) return false;
  const [h, m] = trimmed.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

export function getPreWorkLockWindow(
  workStartTime: string,
  fallbackMins: number = 8 * 60
): {
  prepStartMins: number;
  workStartMins: number;
  prepStartStr: string;
  workStartStr: string;
} {
  const workStartMins = Math.max(60, Math.min(23 * 60 + 59, parseTimeToMins(workStartTime, fallbackMins)));
  const prepStartMins = Math.max(0, workStartMins - 60);
  return {
    prepStartMins,
    workStartMins,
    prepStartStr: formatMinsToTime(prepStartMins),
    workStartStr: formatMinsToTime(workStartMins),
  };
}

export function getNightPrepStartTime(nightWorkStartTime: string): string {
  return getPreWorkLockWindow(nightWorkStartTime, 19 * 60).prepStartStr;
}

interface ShiftWindowGeometry {
  prefixRoutineSlots: ClimbingTimeSlotItem[];
  climbWindowStart: number;
  climbWindowEnd: number;
  suffixPrepSlots: ClimbingTimeSlotItem[];
}

function buildShiftWindowGeometry(options: ScheduleGenerationOptions): ShiftWindowGeometry {
  if (options.shiftMode === 'NIGHT') {
    const returnHomeMins = parseTimeToMins(options.nightReturnHomeTime, 7 * 60 + 30);
    const bathEndMins = Math.min(returnHomeMins + 60, 12 * 60);
    const wakeUpMins = Math.max(bathEndMins + 180, parseTimeToMins(options.nightWakeUpTime, 14 * 60 + 30));
    const preWork = getPreWorkLockWindow(options.nightWorkStartTime || '19:00', 19 * 60);
    const prepStartMins = Math.max(wakeUpMins + 30, preWork.prepStartMins);

    const prefixRoutineSlots: ClimbingTimeSlotItem[] = [
      {
        id: `slot-routine-bath-${Date.now()}`,
        startTime: formatMinsToTime(returnHomeMins),
        endTime: formatMinsToTime(bathEndMins),
        kind: 'REST_ROUTINE',
        title: '🚿 Đi làm ca đêm về: Tắm rửa, giặt áo quần & thư giãn',
        suggestedTask: 'Giải quyết gọn việc vệ sinh cá nhân, giặt đồ ngay khi về nhà.',
        pomodoroMins: Math.max(15, bathEndMins - returnHomeMins),
        notes: 'Không cầm điện thoại lướt vô định để kịp ngủ đủ giấc.',
      },
      {
        id: `slot-routine-sleep-${Date.now()}`,
        startTime: formatMinsToTime(bathEndMins),
        endTime: formatMinsToTime(wakeUpMins),
        kind: 'SLEEP',
        title: '🛏️ Ngủ bù phục hồi sức khỏe sau ca đêm',
        suggestedTask: 'Ngủ sâu để chiều dậy có đầu óc tỉnh táo leo núi hiệu quả.',
        pomodoroMins: Math.max(60, wakeUpMins - bathEndMins),
        notes: 'Tự động tính làm thời gian ngủ khi thống kê Quỹ Thời Gian 24h.',
      },
    ];

    const suffixPrepSlots: ClimbingTimeSlotItem[] = [
      {
        id: `slot-prep-work-${Date.now()}`,
        startTime: formatMinsToTime(prepStartMins),
        endTime: preWork.workStartStr,
        kind: 'PREP_WORK',
        title: '🎒 Chuẩn bị trước khi đi làm ca đêm (Khóa cứng 1 tiếng — Không leo núi)',
        suggestedTask: 'Ăn uống, chuẩn bị tư trang, di chuyển đi làm đúng giờ.',
        pomodoroMins: Math.max(30, preWork.workStartMins - prepStartMins),
        notes: `Tự động khóa cứng 1 tiếng trước giờ vào ca (${preWork.workStartStr}) để không bị vội vàng hay trễ giờ.`,
      },
    ];

    return {
      prefixRoutineSlots,
      climbWindowStart: wakeUpMins,
      climbWindowEnd: prepStartMins,
      suffixPrepSlots,
    };
  }

  const dayPreWork = getPreWorkLockWindow(options.dayWorkStartTime || '08:00', 8 * 60);
  const startMins = parseTimeToMins(options.dayShiftClimbStart, 20 * 60);
  const endMins = Math.max(startMins + 60, parseTimeToMins(options.dayShiftClimbEnd, 24 * 60));

  const prefixRoutineSlots: ClimbingTimeSlotItem[] = [
    ...(dayPreWork.prepStartMins >= 60
      ? [
          {
            id: `slot-sleep-day-${Date.now()}`,
            startTime: '00:00',
            endTime: dayPreWork.prepStartStr,
            kind: 'SLEEP' as const,
            title: '🛏️ Ngủ phục hồi ban đêm (Tự đồng bộ Quỹ Thời Gian)',
            suggestedTask: 'Ngủ đủ giấc để sáng dậy tỉnh táo đi làm và tối leo núi sung sức.',
            pomodoroMins: dayPreWork.prepStartMins,
            notes: 'Tự động tính làm thời gian ngủ trong bảng Quỹ Thời Gian 24h.',
          },
        ]
      : []),
    {
      id: `slot-prep-day-work-${Date.now()}`,
      startTime: dayPreWork.prepStartStr,
      endTime: dayPreWork.workStartStr,
      kind: 'PREP_WORK',
      title: '🎒 Chuẩn bị trước khi đi làm ca ngày (Khóa cứng 1 tiếng — Không leo núi)',
      suggestedTask: 'Vệ sinh cá nhân, ăn sáng, chuẩn bị đồ đạc đi làm đúng giờ.',
      pomodoroMins: 60,
      notes: `Tự động khóa cứng 1 tiếng trước giờ vào ca ngày (${dayPreWork.workStartStr}).`,
    },
  ];

  return {
    prefixRoutineSlots,
    climbWindowStart: startMins,
    climbWindowEnd: endMins,
    suffixPrepSlots: [],
  };
}

function buildSuggestedTaskForMountain(
  insight: MountainBalanceInsight,
  dayLabel: string
): string {
  if (insight.nextMilestoneTitle) {
    return `Chinh phục bước tiếp theo: "${insight.nextMilestoneTitle}"`;
  }
  if (insight.status === 'NEGLECTED') {
    return `Bứt phá lại núi "${insight.goal.title}" (${insight.daysSinceLastWorked >= 90 ? 'chưa có phiên tập trung gần đây' : `đã ${insight.daysSinceLastWorked} ngày chưa leo`})`;
  }
  return `Công phá trọng tâm ${dayLabel} cho núi "${insight.goal.title}"`;
}

function allocateDayMountains(
  insights: MountainBalanceInsight[],
  strategyMode: ScheduleStrategyMode,
  maxMountainsPerDay: number,
  customPrompt?: string
): Map<number, MountainBalanceInsight[]> {
  const result = new Map<number, MountainBalanceInsight[]>();
  const n = insights.length;
  if (n === 0) {
    for (const dow of WEEKDAY_ORDER) result.set(dow, []);
    return result;
  }

  const promptLower = (customPrompt || '').toLowerCase();
  const restOnSunday =
    promptLower.includes('chủ nhật nghỉ') ||
    promptLower.includes('cn nghỉ') ||
    promptLower.includes('nghỉ chủ nhật');

  // Sort insights by priority (neglected / highest urgency first, while retaining stable ordering)
  const prioritized = [...insights].sort((a, b) => b.urgencyScore - a.urgencyScore);

  if (strategyMode === 'DAILY_ALL_PEAKS') {
    for (const dow of WEEKDAY_ORDER) {
      if (dow === 0 && restOnSunday) {
        result.set(dow, []);
      } else {
        result.set(dow, prioritized);
      }
    }
    return result;
  }

  // Build weighted pool so neglected mountains appear more frequently across the week,
  // while guaranteeing every active mountain gets multiple dedicated slots each week.
  const perDay = Math.min(n, Math.max(1, maxMountainsPerDay));

  if (strategyMode === 'NEGLECTED_PRIORITY') {
    // Rotate while ensuring neglected mountains appear almost every day
    const neglected = prioritized.filter((i) => i.status === 'NEGLECTED');
    const others = prioritized.filter((i) => i.status !== 'NEGLECTED');
    const pool = [...neglected, ...neglected, ...others];

    let cursor = 0;
    for (const dow of WEEKDAY_ORDER) {
      if (dow === 0 && restOnSunday) {
        result.set(dow, []);
        continue;
      }
      const chosen: MountainBalanceInsight[] = [];
      const seenIds = new Set<string>();
      let safety = 0;
      while (chosen.length < perDay && safety < pool.length * 3) {
        const candidate = pool[cursor % pool.length];
        cursor++;
        safety++;
        if (!seenIds.has(candidate.goal.id)) {
          seenIds.add(candidate.goal.id);
          chosen.push(candidate);
        }
      }
      result.set(dow, chosen);
    }
    return result;
  }

  // SMART_WEEKLY_ROTATION: classic balanced 7-day rotation across all mountains
  // e.g. with 4 mountains & 2/day: Mon [1,3], Tue [2,4], Wed [1,2], Thu [3,4], Fri [1,4], Sat [2,3], Sun [top neglected]
  const orderedByNum = [...insights].sort((a, b) => a.indexNumber - b.indexNumber);

  if (n >= 2 && perDay === 2) {
    // Pair rotation covering all combinations evenly, with neglected ones rotated in first
    const pairs: Array<[MountainBalanceInsight, MountainBalanceInsight]> = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        pairs.push([orderedByNum[i], orderedByNum[j]]);
      }
    }
    // Order pairs so consecutive days have minimal overlap (greedy spacing)
    const spacedPairs: Array<[MountainBalanceInsight, MountainBalanceInsight]> = [];
    const remaining = [...pairs];
    while (remaining.length > 0) {
      if (spacedPairs.length === 0) {
        // Start with a pair containing the highest urgency mountain
        const bestIdx = remaining.findIndex(
          ([a, b]) => a.goal.id === prioritized[0].goal.id || b.goal.id === prioritized[0].goal.id
        );
        spacedPairs.push(...remaining.splice(bestIdx >= 0 ? bestIdx : 0, 1));
      } else {
        const prevIds = new Set(spacedPairs[spacedPairs.length - 1].map((x) => x.goal.id));
        const disjointIdx = remaining.findIndex(
          ([a, b]) => !prevIds.has(a.goal.id) && !prevIds.has(b.goal.id)
        );
        if (disjointIdx >= 0) {
          spacedPairs.push(...remaining.splice(disjointIdx, 1));
        } else {
          spacedPairs.push(remaining.shift()!);
        }
      }
    }

    WEEKDAY_ORDER.forEach((dow, dayIdx) => {
      if (dow === 0 && restOnSunday) {
        result.set(dow, []);
        return;
      }
      if (dow === 0) {
        // Sunday: focus on the top neglected / lowest share mountains for balance catch-up
        result.set(dow, prioritized.slice(0, Math.min(2, n)));
      } else {
        const pair = spacedPairs[dayIdx % spacedPairs.length];
        result.set(dow, [...pair]);
      }
    });
    return result;
  }

  // Generic round-robin for perDay = 1 or >= 3
  let cursor = 0;
  for (const dow of WEEKDAY_ORDER) {
    if (dow === 0 && restOnSunday) {
      result.set(dow, []);
      continue;
    }
    const chosen: MountainBalanceInsight[] = [];
    for (let k = 0; k < perDay; k++) {
      const target = prioritized[(cursor + k) % prioritized.length];
      if (!chosen.some((c) => c.goal.id === target.goal.id)) {
        chosen.push(target);
      }
    }
    cursor = (cursor + perDay) % prioritized.length;
    result.set(dow, chosen);
  }
  return result;
}

export function generateSmartClimbingSchedule(
  db: MonkDatabaseSchema,
  options: ScheduleGenerationOptions
): AIClimbingSchedulePlan {
  const now = Date.now();
  const insights = analyzeMountainBalance(db, options.todayStr);
  const geometry = buildShiftWindowGeometry(options);
  const allocation = allocateDayMountains(
    insights,
    options.strategyMode,
    options.maxMountainsPerDay,
    options.customUserPrompt
  );

  const pinnedComboNote = (db.optimizationNotes || []).find(
    (n) => n.isPinned || n.category === 'COMBO_TIME_SAVER'
  );

  const totalClimbMins = Math.max(30, geometry.climbWindowEnd - geometry.climbWindowStart);

  const days: DayClimbingPlan[] = WEEKDAY_ORDER.map((dow, dayIdx) => {
    const dayLabel = WEEKDAY_LABELS[dow];
    const assigned = allocation.get(dow) || [];
    const daySlots: ClimbingTimeSlotItem[] = geometry.prefixRoutineSlots.map((s, sIdx) => ({
      ...s,
      id: `slot-${dow}-pre-${sIdx}-${now}`,
    }));

    if (assigned.length === 0) {
      daySlots.push({
        id: `slot-${dow}-rest-${now}`,
        startTime: formatMinsToTime(geometry.climbWindowStart),
        endTime: formatMinsToTime(geometry.climbWindowEnd),
        kind: 'REST_ROUTINE',
        title:
          insights.length === 0
            ? '⛰️ Chưa có Đỉnh Núi đang hoạt động — Hãy dựng ngọn núi đầu tiên'
            : '🎋 Ngày Nghỉ Phục Hồi & Tổng Kết Tuần',
        suggestedTask: 'Nghỉ ngơi, ôn lại Sổ Bí Kíp & chuẩn bị tinh thần cho tuần mới.',
        pomodoroMins: totalClimbMins,
      });
    } else {
      const count = assigned.length;
      const includeBreak = count >= 2 && totalClimbMins >= 90;
      const singleBreakMins = includeBreak ? (totalClimbMins / count < 50 ? 5 : 10) : 0;
      const breakMins = singleBreakMins * Math.max(0, count - 1);
      const usableMins = Math.max(count * 20, totalClimbMins - breakMins);
      const minBlockMins = Math.min(25, Math.max(15, Math.floor(usableMins / (count * 1.4))));

      // Gentle bounded weighting so neglected mountains get ~30-50% more time without starving others
      const getIntraDayWeight = (item: MountainBalanceInsight) =>
        100 + Math.min(35, Math.max(-25, item.urgencyScore - 60));
      const weightSum = assigned.reduce((sum, item) => sum + getIntraDayWeight(item), 0);
      let cursorMins = geometry.climbWindowStart;

      assigned.forEach((insight, idx) => {
        const isLast = idx === assigned.length - 1;
        const remainingOthers = assigned.length - 1 - idx;
        const reserveAfter = remainingOthers * (minBlockMins + singleBreakMins);
        const rawAlloc = isLast
          ? geometry.climbWindowEnd - cursorMins
          : Math.round((usableMins * getIntraDayWeight(insight)) / Math.max(1, weightSum));

        const roundedAlloc = isLast
          ? Math.max(minBlockMins, geometry.climbWindowEnd - cursorMins)
          : Math.max(minBlockMins, Math.round(rawAlloc / 5) * 5);

        const slotStart = cursorMins;
        const slotEnd = isLast
          ? geometry.climbWindowEnd
          : Math.min(geometry.climbWindowEnd - reserveAfter, slotStart + roundedAlloc);

        const duration = Math.max(15, slotEnd - slotStart);

        daySlots.push({
          id: `slot-${dow}-climb-${idx}-${now}-${dayIdx}`,
          startTime: formatMinsToTime(slotStart),
          endTime: formatMinsToTime(slotEnd),
          kind: 'CLIMB',
          goalId: insight.goal.id,
          title: `⛰️ Núi #${insight.indexNumber}: ${insight.goal.title}`,
          suggestedTask: buildSuggestedTaskForMountain(insight, dayLabel),
          pomodoroMins: duration,
          notes:
            insight.status === 'NEGLECTED'
              ? `Ưu tiên bù lại thời gian cho núi đang bị lơ là (tỷ trọng hiện tại ${insight.sharePct}%).`
              : insight.status === 'OVER_FOCUSED'
              ? `Giữ nhịp vừa đủ để nhường thời gian cho các đỉnh núi khác.`
              : `Giữ nhịp độ cân bằng giữa các đỉnh núi.`,
        });

        cursorMins = slotEnd;

        if (singleBreakMins > 0 && !isLast && cursorMins + singleBreakMins + minBlockMins <= geometry.climbWindowEnd) {
          const breakEnd = cursorMins + singleBreakMins;
          daySlots.push({
            id: `slot-${dow}-brk-${idx}-${now}`,
            startTime: formatMinsToTime(cursorMins),
            endTime: formatMinsToTime(breakEnd),
            kind: 'BREAK_COMBO',
            title: '⚡ Nghỉ chuyển tiếp / Áp dụng Bí Kíp 1 Công Đôi Việc',
            suggestedTask: pinnedComboNote
              ? `Gợi ý tối ưu: ${pinnedComboNote.title}`
              : 'Đứng dậy giãn cơ, uống nước, chốt ghi chú ngắn trước khi đổi núi.',
            pomodoroMins: singleBreakMins,
          });
          cursorMins = breakEnd;
        }
      });
    }

    geometry.suffixPrepSlots.forEach((s, sIdx) => {
      daySlots.push({
        ...s,
        id: `slot-${dow}-post-${sIdx}-${now}`,
      });
    });

    return {
      dayOfWeek: dow,
      dayLabel,
      shiftMode: options.shiftMode,
      slots: daySlots,
    };
  });

  const overFocused = insights.filter((i) => i.status === 'OVER_FOCUSED');
  const neglected = insights.filter((i) => i.status === 'NEGLECTED');
  const dayPreWork = getPreWorkLockWindow(options.dayWorkStartTime || '08:00', 8 * 60);
  const shiftSummary =
    options.shiftMode === 'NIGHT'
      ? `Chế độ Ca Đêm (vào làm ${options.nightWorkStartTime}): về nhà ${options.nightReturnHomeTime} (tắm giặt & ngủ tới ${options.nightWakeUpTime}), khung giờ vàng leo núi ${options.nightWakeUpTime}–${getNightPrepStartTime(options.nightWorkStartTime)}, và tự khóa cứng 1 tiếng (${getNightPrepStartTime(options.nightWorkStartTime)}–${options.nightWorkStartTime}) để chuẩn bị trước khi đi làm.`
      : `Chế độ Ca Ngày (vào làm ${dayPreWork.workStartStr}): khóa 1 tiếng sáng ${dayPreWork.prepStartStr}–${dayPreWork.workStartStr} chuẩn bị đi làm; khung giờ leo núi buổi tối ${options.dayShiftClimbStart}–${options.dayShiftClimbEnd}.`;

  const balanceNotes: string[] = [];
  if (overFocused.length > 0) {
    balanceNotes.push(
      `Phát hiện đang dồn quá nhiều sức vào: ${overFocused.map((o) => `"${o.goal.title}" (${o.sharePct}%)`).join(', ')}.`
    );
  }
  if (neglected.length > 0) {
    balanceNotes.push(
      `Các đỉnh núi cần tăng tốc bù: ${neglected.map((n) => `"${n.goal.title}" (${n.sharePct}%)`).join(', ')}.`
    );
  }
  if (balanceNotes.length === 0 && insights.length > 0) {
    balanceNotes.push(`Đang cân bằng lịch đều đặn cho cả ${insights.length} Đỉnh Núi hiện có.`);
  }

  const offlineTips: string[] = [];
  if (neglected.length > 0) {
    offlineTips.push(
      `Ưu tiên kéo lại "${neglected[0].goal.title}": Đặt Pomodoro khởi động ngắn 20–25 phút trong slot đầu tuần để vượt qua sức ỳ.`
    );
  }
  if (pinnedComboNote) {
    offlineTips.push(
      `Áp dụng bí kíp 1 công đôi việc: "${pinnedComboNote.title}" vào khung nghỉ chuyển tiếp giữa các ngọn núi.`
    );
  }
  offlineTips.push(
    options.shiftMode === 'NIGHT'
      ? `Bảo vệ tuyệt đối khung ${getNightPrepStartTime(options.nightWorkStartTime)}–${options.nightWorkStartTime} trước giờ vào ca để không bị kiệt sức lúc đi làm.`
      : `Khóa 1 tiếng sáng ${dayPreWork.prepStartStr}–${dayPreWork.workStartStr} chuẩn bị đi làm; buổi tối dồn việc tập trung não cao từ ${options.dayShiftClimbStart}, việc nhẹ để cuối buổi.`
  );

  return {
    id: `ai-plan-${now}`,
    createdAt: now,
    updatedAt: now,
    shiftMode: options.shiftMode,
    strategyMode: options.strategyMode,
    dayWorkStartTime: options.dayWorkStartTime || '08:00',
    dayShiftClimbStart: options.dayShiftClimbStart,
    dayShiftClimbEnd: options.dayShiftClimbEnd,
    nightReturnHomeTime: options.nightReturnHomeTime,
    nightWakeUpTime: options.nightWakeUpTime,
    nightWorkStartTime: options.nightWorkStartTime,
    maxMountainsPerDay: options.maxMountainsPerDay,
    aiReasoningSummary: `${shiftSummary} ${balanceNotes.join(' ')}`,
    aiCoachingTips: offlineTips,
    aiEngineMode: 'INTERNAL_SMART',
    aiProvider: options.aiProvider || 'GEMINI',
    aiModel: options.aiModel || 'auto',
    customUserPrompt: options.customUserPrompt,
    geminiApiKey: options.geminiApiKey,
    days,
  };
}

/**
 * Tự động cập nhật nối tiếp toàn bộ các khung giờ phía sau khi người dùng sửa
 * startTime / endTime / pomodoroMins của một khung giờ bất kỳ.
 */
export function cascadeRecalculateDaySlots(
  slots: ClimbingTimeSlotItem[],
  editedSlotId: string,
  changedField: 'startTime' | 'endTime' | 'pomodoroMins',
  rawPatch: Partial<ClimbingTimeSlotItem>
): ClimbingTimeSlotItem[] {
  const idx = slots.findIndex((s) => s.id === editedSlotId);
  if (idx === -1) return slots;

  const copy = slots.map((s) => ({ ...s }));
  const target = copy[idx];
  Object.assign(target, rawPatch);

  // If editing PREP_WORK itself, adjust it cleanly without colliding earlier slots
  if (target.kind === 'PREP_WORK') {
    const sMins = parseTimeToMins(target.startTime, 18 * 60);
    let eMins = parseTimeToMins(target.endTime, sMins + 60);
    if (changedField === 'startTime') {
      const dur = Math.max(15, target.pomodoroMins || 60);
      eMins = Math.min(1440, sMins + dur);
    } else if (changedField === 'pomodoroMins') {
      const dur = Math.max(15, Number(rawPatch.pomodoroMins) || 60);
      eMins = Math.min(1440, sMins + dur);
    }
    target.startTime = formatMinsToTime(sMins);
    target.endTime = formatMinsToTime(Math.max(sMins + 15, eMins));
    target.pomodoroMins = Math.max(15, parseTimeToMins(target.endTime) - sMins);

    // Push subsequent climb/rest slots after this prep slot if this prep is at start of day (DAY shift morning prep)
    if (idx < copy.length - 1 && parseTimeToMins(copy[idx + 1].startTime) < parseTimeToMins(target.endTime)) {
      let cur = parseTimeToMins(target.endTime);
      for (let j = idx + 1; j < copy.length; j++) {
        if (copy[j].kind === 'PREP_WORK') break;
        const dur = Math.max(10, copy[j].pomodoroMins || 30);
        const s = cur;
        const e = Math.min(1440, s + dur);
        copy[j].startTime = formatMinsToTime(s);
        copy[j].endTime = formatMinsToTime(e);
        copy[j].pomodoroMins = Math.max(5, e - s);
        cur = e;
      }
    }
    return copy;
  }

  // Find hard upper ceiling (earliest PREP_WORK slot AFTER idx, or 24:00)
  let lockIdx = -1;
  for (let j = idx + 1; j < copy.length; j++) {
    if (copy[j].kind === 'PREP_WORK') {
      lockIdx = j;
      break;
    }
  }
  const hardLimitMins = lockIdx >= 0 ? parseTimeToMins(copy[lockIdx].startTime, 1440) : 1440;

  let curStart = parseTimeToMins(target.startTime, 0);
  let curEnd = parseTimeToMins(target.endTime, curStart + Math.max(10, target.pomodoroMins || 30));

  if (changedField === 'startTime') {
    const dur = Math.max(5, target.pomodoroMins || 30);
    curStart = Math.max(0, Math.min(hardLimitMins - 5, curStart));
    curEnd = Math.min(hardLimitMins, curStart + dur);
    // If new start overlaps previous non-locked slot, shrink previous slot cleanly
    if (idx > 0 && copy[idx - 1].kind !== 'PREP_WORK') {
      const prevStart = parseTimeToMins(copy[idx - 1].startTime, 0);
      const prevEnd = parseTimeToMins(copy[idx - 1].endTime, curStart);
      if (prevEnd > curStart && curStart > prevStart) {
        copy[idx - 1].endTime = formatMinsToTime(curStart);
        copy[idx - 1].pomodoroMins = Math.max(5, curStart - prevStart);
      }
    }
  } else if (changedField === 'endTime') {
    curEnd = Math.max(curStart + 5, Math.min(hardLimitMins, curEnd));
  } else if (changedField === 'pomodoroMins') {
    const desiredDur = Math.max(5, Number(rawPatch.pomodoroMins) || 15);
    curEnd = Math.max(curStart + 5, Math.min(hardLimitMins, curStart + desiredDur));
  }

  target.startTime = formatMinsToTime(curStart);
  target.endTime = formatMinsToTime(curEnd);
  target.pomodoroMins = Math.max(5, curEnd - curStart);

  // Determine contiguous downstream slots to auto-cascade (until hard ceiling / PREP_WORK)
  const stopIdx = lockIdx >= 0 ? lockIdx : copy.length;
  const downstream = copy.slice(idx + 1, stopIdx);
  if (downstream.length === 0) return copy;

  let cursor = curEnd;
  const available = Math.max(0, hardLimitMins - cursor);
  const desiredDurs = downstream.map((d) => {
    const orig = parseTimeToMins(d.endTime, 0) - parseTimeToMins(d.startTime, 0);
    return Math.max(5, d.pomodoroMins || (orig > 0 ? orig : 30));
  });
  const totalDesired = desiredDurs.reduce((s, d) => s + d, 0);

  if (totalDesired <= available) {
    // Enough room: preserve exact durations and shift them seamlessly starting right after edited task!
    downstream.forEach((slotItem, offset) => {
      const dur = desiredDurs[offset];
      const s = cursor;
      const e = Math.min(hardLimitMins, s + dur);
      slotItem.startTime = formatMinsToTime(s);
      slotItem.endTime = formatMinsToTime(e);
      slotItem.pomodoroMins = Math.max(5, e - s);
      cursor = e;
    });
  } else {
    // Tight against pre-work lock or midnight -> proportionally compress downstream tasks to fit cleanly!
    const minEach = downstream.map((d) => (d.kind === 'BREAK_COMBO' ? 5 : 10));
    downstream.forEach((slotItem, offset) => {
      const isLast = offset === downstream.length - 1;
      const minAfter = minEach.slice(offset + 1).reduce((s, v) => s + v, 0);
      const maxHere = Math.max(minEach[offset], hardLimitMins - minAfter - cursor);
      const scaled = isLast
        ? hardLimitMins - cursor
        : Math.max(
            minEach[offset],
            Math.round(((available * desiredDurs[offset]) / Math.max(1, totalDesired)) / 5) * 5
          );
      const s = cursor;
      const e = isLast ? hardLimitMins : Math.min(cursor + maxHere, cursor + scaled);
      slotItem.startTime = formatMinsToTime(s);
      slotItem.endTime = formatMinsToTime(Math.max(s + 5, e));
      slotItem.pomodoroMins = Math.max(5, parseTimeToMins(slotItem.endTime) - s);
      cursor = parseTimeToMins(slotItem.endTime);
    });
  }

  return copy;
}

/**
 * Khi đổi thứ tự (lên/xuống) hoặc xóa 1 slot, tự động nối tiếp lại giờ của chuỗi công việc chính.
 */
export function resequenceSlotsAfterOrderChange(
  slots: ClimbingTimeSlotItem[],
  climbStartHintStr?: string,
  climbEndHintStr?: string
): ClimbingTimeSlotItem[] {
  if (slots.length <= 1) return slots;
  const copy = slots.map((s) => ({ ...s }));

  // Separate fixed morning/prefix routines & trailing PREP_WORK from re-chainable middle climb/break slots
  let firstActiveIdx = copy.findIndex((s) => s.kind === 'CLIMB' || s.kind === 'BREAK_COMBO');
  if (firstActiveIdx === -1) return copy;

  let lastActiveIdx = copy.length - 1;
  while (
    lastActiveIdx > firstActiveIdx &&
    copy[lastActiveIdx].kind !== 'CLIMB' &&
    copy[lastActiveIdx].kind !== 'BREAK_COMBO'
  ) {
    lastActiveIdx--;
  }

  const prevSlot = firstActiveIdx > 0 ? copy[firstActiveIdx - 1] : null;
  const startCursor = climbStartHintStr
    ? Math.max(prevSlot ? parseTimeToMins(prevSlot.endTime) : 0, parseTimeToMins(climbStartHintStr))
    : prevSlot
    ? parseTimeToMins(prevSlot.endTime)
    : Math.min(...copy.slice(firstActiveIdx, lastActiveIdx + 1).map((s) => parseTimeToMins(s.startTime, 20 * 60)));

  const nextFixed = lastActiveIdx < copy.length - 1 ? copy[lastActiveIdx + 1] : null;
  const ceiling = nextFixed
    ? parseTimeToMins(nextFixed.startTime, 1440)
    : climbEndHintStr
    ? parseTimeToMins(climbEndHintStr, 1440)
    : 1440;

  let cursor = startCursor;
  const activeSlice = copy.slice(firstActiveIdx, lastActiveIdx + 1);
  const available = Math.max(30, ceiling - cursor);
  const durs = activeSlice.map((s) => {
    const diff = parseTimeToMins(s.endTime) - parseTimeToMins(s.startTime);
    return Math.max(5, s.pomodoroMins || (diff > 0 ? diff : 30));
  });
  const totalDur = durs.reduce((a, b) => a + b, 0);

  activeSlice.forEach((slotItem, idx) => {
    const isLast = idx === activeSlice.length - 1;
    const alloc =
      totalDur <= available
        ? durs[idx]
        : isLast
        ? ceiling - cursor
        : Math.max(10, Math.round(((available * durs[idx]) / Math.max(1, totalDur)) / 5) * 5);
    const s = cursor;
    const e = Math.min(ceiling, s + alloc);
    slotItem.startTime = formatMinsToTime(s);
    slotItem.endTime = formatMinsToTime(Math.max(s + 5, e));
    slotItem.pomodoroMins = Math.max(5, parseTimeToMins(slotItem.endTime) - s);
    cursor = parseTimeToMins(slotItem.endTime);
  });

  return copy;
}

/**
 * Tự động tìm điểm chèn và thời gian chuẩn xác khi bấm "+ Thêm Khung Giờ Mới"
 */
export function autoPlaceNewSlotInDay(
  existingSlots: ClimbingTimeSlotItem[],
  newSlot: ClimbingTimeSlotItem
): ClimbingTimeSlotItem[] {
  const prepSuffixIdx = existingSlots.findIndex(
    (s, i) => i > 0 && s.kind === 'PREP_WORK'
  );
  const insertAt = prepSuffixIdx > 0 ? prepSuffixIdx : existingSlots.length;
  const prevSlot = insertAt > 0 ? existingSlots[insertAt - 1] : null;
  const hardLimit = prepSuffixIdx > 0 ? parseTimeToMins(existingSlots[prepSuffixIdx].startTime, 1440) : 1440;

  const sMins = prevSlot
    ? Math.min(hardLimit - 15, parseTimeToMins(prevSlot.endTime))
    : parseTimeToMins(newSlot.startTime, 20 * 60);
  const dur = Math.max(15, newSlot.pomodoroMins || 45);
  const eMins = Math.min(hardLimit, Math.max(sMins + 15, sMins + dur));

  const placed: ClimbingTimeSlotItem = {
    ...newSlot,
    startTime: formatMinsToTime(sMins),
    endTime: formatMinsToTime(eMins),
    pomodoroMins: Math.max(15, eMins - sMins),
  };

  const next = [...existingSlots];
  next.splice(insertAt, 0, placed);
  return next;
}

/**
 * Tự động cập nhật khung giờ khóa cứng 1 tiếng trước giờ đi làm trên Kế hoạch hiện có
 * khi người dùng đổi giờ vào ca Ngày / ca Đêm.
 */
export function syncPlanPreWorkLock(
  plan: AIClimbingSchedulePlan,
  updates: { dayWorkStartTime?: string; nightWorkStartTime?: string }
): AIClimbingSchedulePlan {
  const nextDayWork = updates.dayWorkStartTime ?? plan.dayWorkStartTime ?? '08:00';
  const nextNightWork = updates.nightWorkStartTime ?? plan.nightWorkStartTime ?? '19:00';
  const dayLock = getPreWorkLockWindow(nextDayWork, 8 * 60);
  const nightLock = getPreWorkLockWindow(nextNightWork, 19 * 60);

  return {
    ...plan,
    updatedAt: Date.now(),
    dayWorkStartTime: nextDayWork,
    nightWorkStartTime: nextNightWork,
    days: plan.days.map((day) => {
      const targetLock = day.shiftMode === 'NIGHT' ? nightLock : dayLock;
      let hasPrep = false;
      const updatedSlots = day.slots.map((slot) => {
        if (slot.kind === 'SLEEP' && day.shiftMode === 'DAY' && slot.startTime === '00:00') {
          return {
            ...slot,
            endTime: dayLock.prepStartStr,
            pomodoroMins: Math.max(30, dayLock.prepStartMins),
          };
        }
        if (slot.kind !== 'PREP_WORK') return slot;
        hasPrep = true;
        return {
          ...slot,
          startTime: targetLock.prepStartStr,
          endTime: targetLock.workStartStr,
          pomodoroMins: 60,
          notes: `Tự động khóa cứng 1 tiếng trước giờ vào ca (${targetLock.workStartStr}).`,
        };
      });
      if (!hasPrep && day.shiftMode === 'DAY') {
        updatedSlots.unshift({
          id: `slot-${day.dayOfWeek}-prep-day-${Date.now()}`,
          startTime: dayLock.prepStartStr,
          endTime: dayLock.workStartStr,
          kind: 'PREP_WORK',
          title: '🎒 Chuẩn bị trước khi đi làm ca ngày (Khóa cứng 1 tiếng — Không leo núi)',
          suggestedTask: 'Vệ sinh cá nhân, ăn sáng, chuẩn bị đồ đạc đi làm đúng giờ.',
          pomodoroMins: 60,
          notes: `Tự động khóa cứng 1 tiếng trước giờ vào ca ngày (${dayLock.workStartStr}).`,
        });
      }
      return { ...day, slots: updatedSlots };
    }),
  };
}

function scoreGeminiModelName(name: string): number {
  const n = name.toLowerCase();
  if (n === 'gemini-2.5-flash') return 100;
  if (n === 'gemini-2.5-flash-lite') return 95;
  if (n === 'gemini-flash-latest') return 90;
  if (n === 'gemini-2.0-flash') return 85;
  if (n === 'gemini-2.0-flash-lite') return 80;
  if (n === 'gemini-2.5-pro') return 75;
  if (n === 'gemini-1.5-flash-latest') return 70;
  if (n === 'gemini-1.5-flash') return 65;
  if (n.includes('flash') && !n.includes('image') && !n.includes('tts') && !n.includes('audio')) return 60;
  if (n.includes('gemini') && !n.includes('image') && !n.includes('tts') && !n.includes('audio')) return 40;
  return 10;
}

async function discoverGeminiAvailableModels(
  apiKey: string,
  preferredModel?: string
): Promise<{ models: string[]; listError?: string }> {
  const defaults = [...AI_PROVIDER_DEFAULTS.GEMINI.fallbackModels];
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=100`
    );
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      const errMsg = errJson?.error?.message || `HTTP ${res.status}`;
      return { models: defaults, listError: errMsg };
    }
    const data = await res.json();
    const rawList: Array<{ name?: string; supportedGenerationMethods?: string[] }> = Array.isArray(
      data?.models
    )
      ? data.models
      : [];

    const compatible = rawList
      .filter((m) => {
        const methods = m.supportedGenerationMethods || [];
        const shortName = String(m.name || '').replace(/^models\//, '').toLowerCase();
        if (!methods.includes('generateContent')) return false;
        if (!shortName) return false;
        if (
          shortName.includes('embedding') ||
          shortName.includes('imagen') ||
          shortName.includes('veo') ||
          shortName.includes('-tts') ||
          shortName.includes('native-audio') ||
          shortName.includes('robotics') ||
          shortName.includes('computer-use') ||
          shortName.includes('image')
        ) {
          return false;
        }
        return shortName.startsWith('gemini') || shortName.startsWith('gemma');
      })
      .map((m) => String(m.name || '').replace(/^models\//, ''))
      .sort((a, b) => scoreGeminiModelName(b) - scoreGeminiModelName(a));

    const ordered: string[] = [];
    if (preferredModel && preferredModel !== 'auto') {
      ordered.push(preferredModel.replace(/^models\//, ''));
    }
    for (const m of compatible) {
      if (!ordered.includes(m)) ordered.push(m);
    }
    for (const d of defaults) {
      if (!ordered.includes(d)) ordered.push(d);
    }
    return { models: ordered };
  } catch (err) {
    return { models: defaults, listError: err instanceof Error ? err.message : String(err) };
  }
}

async function callGeminiWithDiscovery(params: {
  apiKey: string;
  preferredModel?: string;
  promptText: string;
  expectJson: boolean;
}): Promise<{ ok: boolean; text?: string; resolvedModel?: string; availableModels?: string[]; errorMessage?: string }> {
  const { apiKey, preferredModel, promptText, expectJson } = params;
  const { models, listError } = await discoverGeminiAvailableModels(apiKey, preferredModel);
  const candidates = models.slice(0, 7);
  const errors: string[] = [];
  if (listError) {
    errors.push(`ListModels: ${listError}`);
  }

  for (const modelName of candidates) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      modelName
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const tryModes = expectJson ? [true, false] : [false];
    for (const useJsonMime of tryModes) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: promptText }] }],
            generationConfig: {
              temperature: 0.4,
              ...(useJsonMime ? { responseMimeType: 'application/json' } : {}),
            },
          }),
        });

        if (res.ok) {
          const json = await res.json();
          const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            return {
              ok: true,
              text: rawText,
              resolvedModel: modelName,
              availableModels: models.slice(0, 12),
            };
          }
          errors.push(`${modelName}: Phản hồi rỗng từ model.`);
          break;
        }

        const errJson = await res.json().catch(() => null);
        const detail = errJson?.error?.message || `HTTP ${res.status}`;
        errors.push(`${modelName} (${res.status}): ${detail}`);

        // Invalid API key -> stop immediately instead of hammering all models
        if (res.status === 400 && /api[_ ]?key/i.test(detail)) {
          return {
            ok: false,
            availableModels: models.slice(0, 12),
            errorMessage: `API Key không hợp lệ (${detail}).`,
          };
        }
        // Only retry without responseMimeType if 400 and we tried JSON mode; otherwise move to next model
        if (res.status !== 400 || !useJsonMime) {
          break;
        }
      } catch (err) {
        errors.push(`${modelName}: ${err instanceof Error ? err.message : 'Lỗi kết nối mạng'}`);
        break;
      }
    }
  }

  return {
    ok: false,
    availableModels: models.slice(0, 12),
    errorMessage: errors.slice(0, 3).join(' | ') || 'Không gọi được model Gemini nào.',
  };
}

async function callOpenAICompatibleProvider(params: {
  provider: 'GROQ' | 'OPENROUTER';
  apiKey: string;
  preferredModel?: string;
  systemText: string;
  userText: string;
}): Promise<{ ok: boolean; text?: string; resolvedModel?: string; errorMessage?: string }> {
  const { provider, apiKey, preferredModel, systemText, userText } = params;
  const endpoint =
    provider === 'GROQ'
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions';

  const defaults = AI_PROVIDER_DEFAULTS[provider].fallbackModels;
  const candidates =
    preferredModel && preferredModel !== 'auto'
      ? [preferredModel, ...defaults.filter((m) => m !== preferredModel)]
      : defaults;

  const errors: string[] = [];
  for (const modelName of candidates.slice(0, 4)) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      };
      if (provider === 'OPENROUTER') {
        headers['HTTP-Referer'] = 'http://127.0.0.1:5173';
        headers['X-Title'] = 'Len Nui Ascend Desktop';
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelName,
          temperature: 0.4,
          messages: [
            { role: 'system', content: systemText },
            { role: 'user', content: userText },
          ],
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const content = json?.choices?.[0]?.message?.content;
        if (content) {
          return { ok: true, text: String(content), resolvedModel: json?.model || modelName };
        }
        errors.push(`${modelName}: Phản hồi rỗng.`);
        continue;
      }

      const errJson = await res.json().catch(() => null);
      const detail = errJson?.error?.message || `HTTP ${res.status}`;
      errors.push(`${modelName} (${res.status}): ${detail}`);
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          errorMessage: `API Key ${provider} bị từ chối (${res.status}): ${detail}`,
        };
      }
    } catch (err) {
      errors.push(`${modelName}: ${err instanceof Error ? err.message : 'Lỗi mạng'}`);
    }
  }

  return {
    ok: false,
    errorMessage: errors.slice(0, 2).join(' | ') || `Không kết nối được tới ${provider}.`,
  };
}

/**
 * Helper dùng chung để gọi AI ngoài (Gemini / Groq / OpenRouter) bằng API Key đã lưu
 * trong kế hoạch hiện tại (phục vụ Báo Cáo Tuần, phân tích thời gian, v.v.).
 */
export async function callConfiguredExternalAIText(
  plan: AIClimbingSchedulePlan | null | undefined,
  systemText: string,
  userText: string
): Promise<{
  ok: boolean;
  text?: string;
  provider?: AIProviderType;
  resolvedModel?: string;
  errorMessage?: string;
}> {
  if (!plan) {
    return { ok: false, errorMessage: 'Chưa có cấu hình AI ngoài.' };
  }
  const provider: AIProviderType = plan.aiProvider || 'GEMINI';
  const apiKey = (
    plan.externalApiKeys?.[provider] ||
    (provider === 'GEMINI' ? plan.geminiApiKey : '') ||
    ''
  ).trim();
  if (!apiKey) {
    return { ok: false, provider, errorMessage: 'Chưa nhập API Key AI ngoài.' };
  }

  if (provider === 'GEMINI') {
    const res = await callGeminiWithDiscovery({
      apiKey,
      preferredModel: plan.aiModel,
      promptText: `${systemText}\n\n${userText}`,
      expectJson: false,
    });
    return {
      ok: res.ok,
      text: res.text,
      provider,
      resolvedModel: res.resolvedModel,
      errorMessage: res.errorMessage,
    };
  }

  const res = await callOpenAICompatibleProvider({
    provider,
    apiKey,
    preferredModel: plan.aiModel,
    systemText,
    userText,
  });
  return {
    ok: res.ok,
    text: res.text,
    provider,
    resolvedModel: res.resolvedModel,
    errorMessage: res.errorMessage,
  };
}

export async function testExternalAIConnection(
  provider: AIProviderType,
  rawKey: string,
  preferredModel?: string
): Promise<AIConnectionTestResult> {
  const apiKey = (rawKey || '').trim();
  if (!apiKey) {
    return {
      ok: false,
      provider,
      message: 'Bạn chưa nhập API Key để kiểm tra.',
    };
  }

  if (provider === 'GEMINI') {
    const res = await callGeminiWithDiscovery({
      apiKey,
      preferredModel,
      promptText: 'Trả lời đúng 1 dòng JSON duy nhất: {"status":"ok"}',
      expectJson: true,
    });
    if (res.ok) {
      return {
        ok: true,
        provider,
        resolvedModel: res.resolvedModel,
        availableModels: res.availableModels,
        message: `Kết nối thành công! Key Free Tier hoạt động tốt với model "${res.resolvedModel}"${
          res.availableModels && res.availableModels.length > 1
            ? ` (tìm thấy ${res.availableModels.length} model khả dụng)`
            : ''
        }.`,
      };
    }
    return {
      ok: false,
      provider,
      availableModels: res.availableModels,
      message: `Chưa kết nối được Gemini: ${res.errorMessage}. (Lưu ý: KHÔNG cần nạp 800k Google Cloud Billing; chỉ cần tạo key ở aistudio.google.com/apikey hoặc dùng Groq Free Tier).`,
    };
  }

  const res = await callOpenAICompatibleProvider({
    provider,
    apiKey,
    preferredModel,
    systemText: 'Reply concisely in JSON.',
    userText: 'Return {"status":"ok"}',
  });
  if (res.ok) {
    return {
      ok: true,
      provider,
      resolvedModel: res.resolvedModel,
      message: `Kết nối ${provider} thành công! Đang chạy model "${res.resolvedModel}".`,
    };
  }
  return {
    ok: false,
    provider,
    message: `Chưa kết nối được ${provider}: ${res.errorMessage}`,
  };
}

export function normalizeAndPackLLMClimbSlots(params: {
  rawSlots: Array<{
    startTime?: string;
    endTime?: string;
    goalId?: string;
    suggestedTask?: string;
    pomodoroMins?: number;
    notes?: string;
  }>;
  goalsById: Map<string, MountainBalanceInsight>;
  climbWindowStart: number;
  climbWindowEnd: number;
  dayOfWeek: number;
  dayLabel: string;
  pinnedComboNoteTitle?: string;
  nowMs?: number;
}): ClimbingTimeSlotItem[] {
  const {
    rawSlots,
    goalsById,
    climbWindowStart,
    climbWindowEnd,
    dayOfWeek,
    dayLabel,
    pinnedComboNoteTitle,
    nowMs = Date.now(),
  } = params;

  const totalWindow = Math.max(30, climbWindowEnd - climbWindowStart);

  interface NormalizedRawItem {
    goalInfo: MountainBalanceInsight;
    origIndex: number;
    rawStart: number;
    rawEnd: number;
    durationMins: number;
    suggestedTask: string;
    notes?: string;
  }

  const validItems: NormalizedRawItem[] = [];
  for (let idx = 0; idx < rawSlots.length; idx++) {
    const raw = rawSlots[idx];
    const goalInfo = goalsById.get(String(raw?.goalId || ''));
    if (!goalInfo) continue;

    const parsedStart = parseTimeToMins(String(raw?.startTime || ''), -1);
    const parsedEnd = parseTimeToMins(String(raw?.endTime || ''), -1);
    const fallbackStart =
      validItems.length === 0
        ? climbWindowStart
        : validItems[validItems.length - 1].rawEnd + 10;
    const sMins = parsedStart >= 0 ? parsedStart : fallbackStart;
    const rawDur =
      parsedStart >= 0 && parsedEnd > parsedStart
        ? parsedEnd - parsedStart
        : Math.max(25, Math.min(180, Number(raw?.pomodoroMins) || 60));
    const eMins = parsedEnd > sMins ? parsedEnd : sMins + rawDur;

    validItems.push({
      goalInfo,
      origIndex: idx,
      rawStart: sMins,
      rawEnd: eMins,
      durationMins: Math.max(20, Math.min(180, rawDur)),
      suggestedTask: String(
        raw?.suggestedTask || buildSuggestedTaskForMountain(goalInfo, dayLabel)
      ).trim(),
      notes: raw?.notes ? String(raw.notes).trim() : undefined,
    });
  }

  if (validItems.length === 0) return [];

  validItems.sort((a, b) => a.rawStart - b.rawStart || a.origIndex - b.origIndex);

  // Check if the LLM already returned a clean, well-packed timeline filling >= 80% of the window
  const firstStart = validItems[0].rawStart;
  const lastEnd = validItems[validItems.length - 1].rawEnd;
  let hasOverlapOrBigGap = false;
  let totalRawClimbMins = 0;

  for (let i = 0; i < validItems.length; i++) {
    const cur = validItems[i];
    const clampedS = Math.max(climbWindowStart, Math.min(climbWindowEnd - 15, cur.rawStart));
    const clampedE = Math.max(clampedS + 15, Math.min(climbWindowEnd, cur.rawEnd));
    totalRawClimbMins += clampedE - clampedS;
    if (i > 0) {
      const prev = validItems[i - 1];
      const gap = cur.rawStart - prev.rawEnd;
      if (gap < 0 || gap > 20) {
        hasOverlapOrBigGap = true;
      }
    }
  }

  const startsNearWindowStart = Math.abs(firstStart - climbWindowStart) <= 15;
  const endsNearWindowEnd = Math.abs(lastEnd - climbWindowEnd) <= 20;
  const coversEnoughTime = totalRawClimbMins >= Math.round(totalWindow * 0.78);

  const makeBreakSlot = (startM: number, endM: number, breakIdx: number): ClimbingTimeSlotItem => ({
    id: `slot-${dayOfWeek}-llm-brk-${breakIdx}-${nowMs}`,
    startTime: formatMinsToTime(startM),
    endTime: formatMinsToTime(endM),
    kind: 'BREAK_COMBO',
    title: '⚡ Nghỉ chuyển tiếp / Áp dụng Bí Kíp 1 Công Đôi Việc',
    suggestedTask: pinnedComboNoteTitle
      ? `Gợi ý tối ưu: ${pinnedComboNoteTitle}`
      : 'Đứng dậy giãn cơ, uống nước, chốt ghi chú ngắn trước khi đổi núi.',
    pomodoroMins: Math.max(5, endM - startM),
  });

  // Case A: AI already planned the full window properly -> preserve exact times + add transition break cards
  if (!hasOverlapOrBigGap && startsNearWindowStart && endsNearWindowEnd && coversEnoughTime) {
    const out: ClimbingTimeSlotItem[] = [];
    for (let i = 0; i < validItems.length; i++) {
      const item = validItems[i];
      const sMins =
        i === 0
          ? climbWindowStart
          : Math.max(climbWindowStart, Math.min(climbWindowEnd - 15, item.rawStart));
      const eMins =
        i === validItems.length - 1
          ? climbWindowEnd
          : Math.max(sMins + 15, Math.min(climbWindowEnd, item.rawEnd));

      if (i > 0) {
        const prevEnd = parseTimeToMins(out[out.length - 1].endTime, sMins);
        if (sMins > prevEnd) {
          out.push(makeBreakSlot(prevEnd, sMins, i - 1));
        }
      }

      out.push({
        id: `slot-${dayOfWeek}-llm-${i}-${nowMs}`,
        startTime: formatMinsToTime(sMins),
        endTime: formatMinsToTime(eMins),
        kind: 'CLIMB',
        goalId: item.goalInfo.goal.id,
        title: `⛰️ Núi #${item.goalInfo.indexNumber}: ${item.goalInfo.goal.title}`,
        suggestedTask: item.suggestedTask,
        pomodoroMins: Math.max(15, eMins - sMins),
        notes: item.notes,
      });
    }
    return out;
  }

  // Case B: AI left dead time / stopped early (e.g. 16:45 -> 19:00 empty) -> auto-split & pack to 100% of window
  interface ExpandedBlock {
    goalInfo: MountainBalanceInsight;
    weight: number;
    suggestedTask: string;
    notes?: string;
  }

  const expandedBlocks: ExpandedBlock[] = [];
  const approxPerRawSlot = totalWindow / validItems.length;
  const shouldSplitLongBlocks = totalWindow >= 170 && approxPerRawSlot > 100;

  for (const item of validItems) {
    if (shouldSplitLongBlocks) {
      const remainingMs = (item.goalInfo.goal.milestones || [])
        .filter((m) => !m.isCompleted)
        .map((m) => m.title);
      const secondMilestone = remainingMs.length > 1 ? remainingMs[1] : null;
      const baseTask = item.suggestedTask.replace(/\s*[-–—]\s*Chặng\s*\d+.*$/i, '').trim();

      expandedBlocks.push({
        goalInfo: item.goalInfo,
        weight: item.durationMins,
        suggestedTask: `${baseTask} — Chặng 1/2 (Trọng tâm & Nạp kiến thức)`,
        notes:
          item.notes ||
          'Tự động chia chặng sâu để giữ độ tập trung cao và phủ kín quỹ thời gian.',
      });

      expandedBlocks.push({
        goalInfo: item.goalInfo,
        weight: item.durationMins,
        suggestedTask: secondMilestone
          ? `Tiếp nối & Chinh phục thêm: "${secondMilestone}" — Chặng 2/2 (Thực hành sâu)`
          : `Thực hành & Đào sâu: ${baseTask} — Chặng 2/2 (Ôn tập & Nâng cao)`,
        notes:
          'Mở rộng từ quỹ giờ trống còn dư nhằm tận dụng tối đa thời gian vàng trong ngày.',
      });
    } else {
      expandedBlocks.push({
        goalInfo: item.goalInfo,
        weight: item.durationMins,
        suggestedTask: item.suggestedTask,
        notes: item.notes,
      });
    }
  }

  const blockCount = expandedBlocks.length;
  const includeBreak = blockCount >= 2 && totalWindow >= 90;
  const singleBreakMins = includeBreak ? (totalWindow / blockCount < 55 ? 5 : 10) : 0;
  const totalBreakMins = singleBreakMins * Math.max(0, blockCount - 1);
  const usableClimbMins = Math.max(blockCount * 20, totalWindow - totalBreakMins);
  const weightSum = expandedBlocks.reduce((acc, b) => acc + Math.max(15, b.weight), 0);
  const minBlockMins = Math.min(25, Math.max(15, Math.floor(usableClimbMins / (blockCount * 1.4))));

  const packedSlots: ClimbingTimeSlotItem[] = [];
  let cursorMins = climbWindowStart;

  expandedBlocks.forEach((blk, idx) => {
    const isLast = idx === blockCount - 1;
    const remainingOthers = blockCount - 1 - idx;
    const reserveAfter = remainingOthers * (minBlockMins + singleBreakMins);

    const rawAlloc = isLast
      ? climbWindowEnd - cursorMins
      : Math.round((usableClimbMins * Math.max(15, blk.weight)) / Math.max(1, weightSum));
    const roundedAlloc = isLast
      ? Math.max(minBlockMins, climbWindowEnd - cursorMins)
      : Math.max(minBlockMins, Math.round(rawAlloc / 5) * 5);

    const slotStart = cursorMins;
    const slotEnd = isLast
      ? climbWindowEnd
      : Math.min(climbWindowEnd - reserveAfter, slotStart + roundedAlloc);
    const duration = Math.max(15, slotEnd - slotStart);

    packedSlots.push({
      id: `slot-${dayOfWeek}-llm-${idx}-${nowMs}`,
      startTime: formatMinsToTime(slotStart),
      endTime: formatMinsToTime(slotEnd),
      kind: 'CLIMB',
      goalId: blk.goalInfo.goal.id,
      title: `⛰️ Núi #${blk.goalInfo.indexNumber}: ${blk.goalInfo.goal.title}`,
      suggestedTask: blk.suggestedTask,
      pomodoroMins: duration,
      notes: blk.notes,
    });

    cursorMins = slotEnd;

    if (
      singleBreakMins > 0 &&
      !isLast &&
      cursorMins + singleBreakMins + minBlockMins <= climbWindowEnd
    ) {
      const breakEnd = cursorMins + singleBreakMins;
      packedSlots.push(makeBreakSlot(cursorMins, breakEnd, idx));
      cursorMins = breakEnd;
    }
  });

  return packedSlots;
}

export async function generateScheduleWithGeminiIfConfigured(
  db: MonkDatabaseSchema,
  options: ScheduleGenerationOptions
): Promise<{ plan: AIClimbingSchedulePlan; usedExternalAI: boolean; note?: string; resolvedModel?: string }> {
  const baselinePlan = generateSmartClimbingSchedule(db, options);
  const provider: AIProviderType = options.aiProvider || 'GEMINI';
  const engineMode: AIEngineMode =
    options.aiEngineMode || ((options.externalApiKey || options.geminiApiKey || '').trim() ? 'EXTERNAL_LLM' : 'INTERNAL_SMART');

  if (engineMode === 'INTERNAL_SMART') {
    return { plan: { ...baselinePlan, aiEngineMode: 'INTERNAL_SMART' }, usedExternalAI: false };
  }

  const apiKey = (options.externalApiKey || options.geminiApiKey || '').trim();
  if (!apiKey) {
    return {
      plan: { ...baselinePlan, aiEngineMode: 'INTERNAL_SMART' },
      usedExternalAI: false,
      note: 'Chưa có API Key nên đã dùng Thuật Toán Chuyên Gia Nội Bộ.',
    };
  }

  const insights = analyzeMountainBalance(db, options.todayStr);
  if (insights.length === 0) {
    return { plan: baselinePlan, usedExternalAI: false };
  }

  const goalsById = new Map(insights.map((i) => [i.goal.id, i]));
  const geometry = buildShiftWindowGeometry(options);
  const windowStartStr = formatMinsToTime(geometry.climbWindowStart);
  const windowEndStr = formatMinsToTime(geometry.climbWindowEnd);
  const totalWindowMins = Math.max(30, geometry.climbWindowEnd - geometry.climbWindowStart);
  const pinnedComboNote = (db.optimizationNotes || []).find(
    (n) => n.isPinned || n.category === 'COMBO_TIME_SAVER'
  );

  // Master System Prompt chèn ngầm giúp AI tối ưu triệt để 100% khung giờ và nhịp sinh học
  const systemInstruction = `Bạn là Chiến Lược Gia AI Cao Cấp & Chuyên Gia Tối Ưu Thời Gian (Time-Blocking & Chronobiology Architect) của ứng dụng kỷ luật "Lên Núi".
Nhiệm vụ: Lập lịch trình leo núi 7 ngày trong tuần (dayOfWeek: 1,2,3,4,5,6,0 tương ứng Thứ 2 -> Chủ Nhật) sao cho thông minh nhất, THỰC TẾ NHẤT và TẬN DỤNG 100% TỪNG PHÚT TRONG KHUNG GIỜ VÀNG.

=== BỘ QUY TẮC TỐI ƯU BẮT BUỘC (KHÔNG ĐƯỢC VI PHẠM) ===
1. ZERO DEAD TIME (PHỦ KÍN 100% KHUNG GIỜ LEO NÚI):
   - Khung giờ được phép leo núi của bạn hôm nay kéo dài chính xác ${totalWindowMins} phút: từ ${windowStartStr} đến ${windowEndStr}.
   - Slot đầu tiên của mỗi ngày BẮT BUỘC phải bắt đầu đúng lúc ${windowStartStr} (KHÔNG được trì hoãn sang 15:00 hay 20:30).
   - Slot cuối cùng của mỗi ngày BẮT BUỘC phải kết thúc đúng lúc ${windowEndStr} (TUYỆT ĐỐI KHÔNG dừng lưng chừng sớm kiểu 16:45 rồi bỏ trống đến ${windowEndStr}, trừ khi người dùng ghi rõ muốn nghỉ hẳn ngày Chủ Nhật).
   - Khoảng nghỉ chuyển tiếp giữa 2 slot liên tiếp chỉ nên từ 10 đến 15 phút để hệ thống tự điền thẻ nghỉ "1 công đôi việc".

2. CHIA CHẶNG SÂU THÔNG MINH (MULTI-BLOCK DEEP WORK — KHÔNG CHỈ TẠO 2 SLOT 45 PHÚT):
   - Với quỹ thời gian dài (${totalWindowMins} phút), hãy chia mỗi ngày thành **3 đến 4 chặng tập trung** (mỗi chặng dài 50–80 phút, không bao giờ để tổng thời lượng ngày chỉ có 90 phút).
   - Nếu trong ngày leo 2 Đỉnh Núi (hoặc theo chiến lược của người dùng), bạn PHẢI chia 1 đỉnh núi quan trọng thành 2 chặng riêng biệt có mục tiêu tiến triển rõ ràng (VD: Chặng 1 nạp kiến thức/nghe đọc -> Chặng 2 thực hành/làm đề/ôn từ vựng) để tổng thời gian sử dụng hết 100% khung ${windowStartStr}–${windowEndStr}.

3. SẮP XẾP THEO NHỊP SINH HỌC & NĂNG LƯỢNG NÃO BỘ:
   - Giờ vàng đầu khung (${windowStartStr}): Đặt việc đòi hỏi sự tập trung trí tuệ cao nhất (ngoại ngữ khó như HSK6, tư duy phân tích).
   - Giữa khung giờ: Đặt các đỉnh núi rèn luyện thể chất / kỹ năng vận động (Body 6 múi, Planche, Calisthenics) và lồng ghép mẹo từ Sổ Bí Kíp (nhẩm từ vựng / nghe audio trong lúc nghỉ giữa hiệp tập).
   - Cuối khung giờ (sát ${windowEndStr}): Đặt thực hành nhẹ nhàng, nghệ thuật hoặc trải nghiệm (Guitar, tổng kết, đọc nhẹ) để người dùng giữ tinh thần thoải mái trước giờ đi làm ca đêm (hoặc trước khi đi ngủ nếu ca ngày).

4. CÂN BẰNG CÁC ĐỈNH NÚI:
   - KHÔNG tập trung lệch chỉ 1 đỉnh núi. Đọc kỹ "balanceStatus", "sharePct", "daysSinceLastWorked" và "remainingMilestones" để kéo các đỉnh bị bỏ quên (NEGLECTED), đồng thời gắn đúng milestone tiếp theo vào "suggestedTask".
${options.shiftMode === 'NIGHT' ? `5. RÀNG BUỘC CA ĐÊM: Khung tắm rửa/ngủ sáng (${options.nightReturnHomeTime}–${options.nightWakeUpTime}) và 1 tiếng chuẩn bị đi làm (${getNightPrepStartTime(options.nightWorkStartTime)}–${options.nightWorkStartTime}) đã được hệ thống khóa cứng riêng — bạn chỉ xếp climbSlots từ ${windowStartStr} đến ${windowEndStr}.` : ''}
- Chiến lược ưu tiên: ${options.strategyMode} (hạn mức mục tiêu ${options.maxMountainsPerDay} đỉnh/ngày nếu theo xoay vòng tuần, có thể lặp 2 chặng cho cùng 1 đỉnh trong ngày để đủ giờ).

- Trả về DUY NHẤT JSON thuần hợp lệ (không giải thích ngoài JSON) theo đúng schema:
{
  "aiReasoningSummary": "string ngắn gọn tiếng Việt giải thích cách đã phủ kín 100% khung ${windowStartStr}–${windowEndStr} và cân bằng các ngọn núi",
  "aiCoachingTips": [
    "Lời khuyên chiến thuật 1 cụ thể theo các ngọn núi (VD kết hợp 1 công đôi việc)",
    "Lời khuyên 2 về phân bổ năng lượng đúng ca làm việc",
    "Lời khuyên 3 về giữ ngưỡng ≥70% nghi thức"
  ],
  "days": [
    {
      "dayOfWeek": 1,
      "climbSlots": [
        {
          "startTime": "${windowStartStr}",
          "endTime": "${formatMinsToTime(Math.min(geometry.climbWindowEnd, geometry.climbWindowStart + 65))}",
          "goalId": "id của đỉnh núi có thật trong mountains",
          "suggestedTask": "Chặng 1: Việc cụ thể lấy từ milestone chưa hoàn thành",
          "pomodoroMins": 65,
          "notes": "lý do nhịp sinh học"
        }
      ]
    }
  ]
}`;

  const userPayload = {
    mountains: insights.map((i) => ({
      goalId: i.goal.id,
      title: i.goal.title,
      category: i.goal.category,
      description: i.goal.description,
      progressPct: i.goal.progressPct,
      totalPomoMins: i.totalPomoMins,
      recent7DaysMins: i.recent7DaysMins,
      sharePct: i.sharePct,
      daysSinceLastWorked: i.daysSinceLastWorked,
      balanceStatus: i.status,
      nextMilestone: i.nextMilestoneTitle,
      remainingMilestones: (i.goal.milestones || []).filter((m) => !m.isCompleted).map((m) => m.title).slice(0, 6),
    })),
    optimizationTricks: (db.optimizationNotes || []).slice(0, 6).map((n) => ({
      title: n.title,
      category: n.category,
    })),
    ritualGroupsSummary: (db.ritualGroups || []).map((g) => ({
      group: g.title,
      count: g.items.length,
    })),
    customUserPrompt: options.customUserPrompt || '',
  };

  const apiCallResult =
    provider === 'GEMINI'
      ? await callGeminiWithDiscovery({
          apiKey,
          preferredModel: options.aiModel,
          promptText: `${systemInstruction}\n\nDữ liệu hiện tại của người dùng:\n${JSON.stringify(userPayload)}`,
          expectJson: true,
        })
      : await callOpenAICompatibleProvider({
          provider,
          apiKey,
          preferredModel: options.aiModel,
          systemText: systemInstruction,
          userText: `Dữ liệu hiện tại của người dùng:\n${JSON.stringify(userPayload)}`,
        });

  if (!apiCallResult.ok || !apiCallResult.text) {
    return {
      plan: {
        ...baselinePlan,
        aiEngineMode: 'EXTERNAL_LLM',
        aiProvider: provider,
        aiModel: options.aiModel,
        externalApiKeys: { ...(options.geminiApiKey ? { GEMINI: options.geminiApiKey } : {}), [provider]: apiKey },
      },
      usedExternalAI: false,
      note: `Không gọi được ${provider} API (${apiCallResult.errorMessage || 'Lỗi không xác định'}). Đã tự động giữ lại lịch bằng Thuật Toán Nội Bộ để bạn không bị gián đoạn!`,
    };
  }

  const parsed = extractJsonObjectFromLLMText(apiCallResult.text);
  if (!parsed || !Array.isArray(parsed?.days)) {
    return {
      plan: {
        ...baselinePlan,
        aiEngineMode: 'EXTERNAL_LLM',
        aiProvider: provider,
        aiModel: options.aiModel,
      },
      usedExternalAI: false,
      note: `Model "${apiCallResult.resolvedModel}" trả về định dạng chưa khớp JSON lịch trình. Đã tự động dùng Thuật Toán Nội Bộ thay thế.`,
    };
  }

  const now = Date.now();
  const promptLower = (options.customUserPrompt || '').toLowerCase();
  const restOnSunday =
    promptLower.includes('chủ nhật nghỉ') ||
    promptLower.includes('cn nghỉ') ||
    promptLower.includes('nghỉ chủ nhật');

  const mergedDays: DayClimbingPlan[] = baselinePlan.days.map((baseDay) => {
    const aiDay = parsed.days.find((d: { dayOfWeek?: number }) => Number(d?.dayOfWeek) === baseDay.dayOfWeek);
    if (!aiDay || !Array.isArray(aiDay.climbSlots) || aiDay.climbSlots.length === 0) {
      if (baseDay.dayOfWeek === 0 && restOnSunday) {
        return baseDay;
      }
      return baseDay;
    }

    const packedClimbAndBreakSlots = normalizeAndPackLLMClimbSlots({
      rawSlots: aiDay.climbSlots,
      goalsById,
      climbWindowStart: geometry.climbWindowStart,
      climbWindowEnd: geometry.climbWindowEnd,
      dayOfWeek: baseDay.dayOfWeek,
      dayLabel: baseDay.dayLabel,
      pinnedComboNoteTitle: pinnedComboNote?.title,
      nowMs: now,
    });

    if (packedClimbAndBreakSlots.length === 0) return baseDay;

    return {
      ...baseDay,
      slots: [
        ...geometry.prefixRoutineSlots.map((s, idx) => ({ ...s, id: `slot-${baseDay.dayOfWeek}-pre-${idx}-${now}` })),
        ...packedClimbAndBreakSlots,
        ...geometry.suffixPrepSlots.map((s, idx) => ({ ...s, id: `slot-${baseDay.dayOfWeek}-post-${idx}-${now}` })),
      ],
    };
  });

  const coachingTips: string[] = Array.isArray(parsed.aiCoachingTips)
    ? parsed.aiCoachingTips.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 4)
    : baselinePlan.aiCoachingTips || [];

  return {
    plan: {
      ...baselinePlan,
      aiEngineMode: 'EXTERNAL_LLM',
      aiProvider: provider,
      aiModel: options.aiModel || 'auto',
      aiResolvedModel: apiCallResult.resolvedModel,
      aiReasoningSummary: String(parsed.aiReasoningSummary || baselinePlan.aiReasoningSummary),
      aiCoachingTips: coachingTips.length > 0 ? coachingTips : baselinePlan.aiCoachingTips,
      days: mergedDays,
    },
    usedExternalAI: true,
    resolvedModel: apiCallResult.resolvedModel,
    note: `AI Thực Thụ (${provider} • ${apiCallResult.resolvedModel}) đã đọc ${insights.length} Đỉnh Núi, Nghi Thức & Sổ Bí Kíp và phủ kín 100% khung giờ ${windowStartStr}–${windowEndStr}!`,
  };
}
