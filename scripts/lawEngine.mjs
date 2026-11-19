/**
 * Pure Node.js Law Evaluation Engine — mirrors src/services/mountainLaws.ts
 * Chạy trực tiếp trong background daemon (desktop-server.mjs) ngay cả khi cửa sổ UI đã đóng.
 */

export const DEFAULT_LAW_CONFIG = {
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CATCH_UP_DAYS = 60;

export function getTodayDateStr(nowMs = Date.now()) {
  const d = new Date(nowMs);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getLawConfig(db) {
  return { ...DEFAULT_LAW_CONFIG, ...((db && db.session && db.session.lawConfig) || {}) };
}

function parseDateStr(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return [y, m, d];
}

export function shiftDateStr(dateStr, deltaDays) {
  const [y, m, d] = parseDateStr(dateStr);
  return getTodayDateStr(new Date(y, m - 1, d + deltaDays, 12).getTime());
}

export function parseShiftStartHM(nightStart = 19, fallbackHour = 19) {
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

export function getEffectiveNightStartTime(config) {
  if (
    config &&
    config.nightShiftStartTime &&
    /^\d{1,2}:\d{2}$/.test(String(config.nightShiftStartTime).trim())
  ) {
    return parseShiftStartHM(config.nightShiftStartTime, config.nightShiftStartHour ?? 19).label;
  }
  return parseShiftStartHM((config && config.nightShiftStartHour) ?? 19).label;
}

export function getShiftDateStr(timestampMs = Date.now(), shiftMode = 'DAY', nightStart = 19) {
  if (shiftMode !== 'NIGHT') {
    return getTodayDateStr(timestampMs);
  }
  const { hour, minute } = parseShiftStartHM(nightStart, 19);
  const offsetMs = (hour * 60 + minute) * 60 * 1000;
  return getTodayDateStr(timestampMs - offsetMs);
}

export function getShiftEndOfDayMs(dateStr, shiftMode = 'DAY', nightStart = 19) {
  const [y, m, d] = parseDateStr(dateStr);
  if (shiftMode !== 'NIGHT') {
    return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  }
  const { hour, minute } = parseShiftStartHM(nightStart, 19);
  return new Date(y, m - 1, d + 1, hour, minute, 0, 0).getTime() - 1;
}

function formatViDateTime(ms) {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${hh}:${min} ${dd}/${mm}/${d.getFullYear()}`;
}

export function getDayOfWeek(dateStr) {
  const [y, m, d] = parseDateStr(dateStr);
  return new Date(y, m - 1, d, 12).getDay();
}

export function isRitualScheduledForDate(item, dateStr) {
  if (!item || !Array.isArray(item.daysOfWeek) || item.daysOfWeek.length === 0) return true;
  return item.daysOfWeek.includes(getDayOfWeek(dateStr));
}

export function isRestDay(db, dateStr, config = getLawConfig(db)) {
  const restDays = (db && db.session && db.session.restDays) || [];
  const rec = restDays.find((r) => r.date === dateStr);
  if (!rec) return false;
  const dayEnd = getShiftEndOfDayMs(
    dateStr,
    config.workShiftMode,
    getEffectiveNightStartTime(config)
  );
  return !rec.registeredAt || rec.registeredAt <= dayEnd;
}

export function getRitualDayEvaluation(db, dateStr, config = getLawConfig(db)) {
  const dayEnd = getShiftEndOfDayMs(
    dateStr,
    config.workShiftMode,
    getEffectiveNightStartTime(config)
  );
  const rawPct = config.ritualPassThresholdPct == null ? 70 : Number(config.ritualPassThresholdPct);
  const thresholdPct = Math.max(50, Math.min(100, Number.isFinite(rawPct) ? rawPct : 70));

  let totalCount = 0;
  let completedCount = 0;
  const groupedMissing = [];

  for (const group of db.ritualGroups || []) {
    let totalInGroup = 0;
    let completedInGroup = 0;
    const missingItems = [];

    for (const item of group.items || []) {
      if (item.createdAt && item.createdAt > dayEnd) continue;
      if (!isRitualScheduledForDate(item, dateStr)) continue;
      totalCount++;
      totalInGroup++;
      if (item.completedDates && item.completedDates[dateStr]) {
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

export function findDayViolations(db, dateStr, config = getLawConfig(db)) {
  if (isRestDay(db, dateStr, config)) {
    return [];
  }
  const findings = [];
  const dayEnd = getShiftEndOfDayMs(
    dateStr,
    config.workShiftMode,
    getEffectiveNightStartTime(config)
  );
  const goals = db.peakGoals || [];
  const goalsById = new Map(goals.map((g) => [g.id, g]));

  const dayStrikes = (db.dailyStrikes || []).filter(
    (s) => s.date === dateStr && goalsById.has(s.goalId)
  );

  // LUẬT 1: CÔNG PHÁ
  if (config.strikeLawEnabled) {
    const byGoal = new Map();
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
      const goal = goalsById.get(goalId);
      findings.push({
        lawId: 'LAW_STRIKE',
        type: 'UNFINISHED_STRIKE',
        goalId,
        goalTitle: goal.title,
        reason: `Không hoàn thành ${unfinished.length}/${list.length} Todo Công Phá của núi "${goal.title}" trong ngày ${dateStr}.`,
        details: unfinished.map((s) => `⚔️ ${s.title}`),
        strikeIdsToMark: unfinished.map((s) => s.id),
      });
    }
  }

  // LUẬT 2: NGHI THỨC (NGƯỠNG KHOA HỌC ≥ 70% / TRÊN 69%)
  if (config.ritualLawEnabled) {
    const ritualEval = getRitualDayEvaluation(db, dateStr, config);
    if (ritualEval.totalCount > 0 && ritualEval.completedCount < ritualEval.requiredCount) {
      const missingDetails = [];
      for (const grp of ritualEval.groupedMissing) {
        const cleanGroupName = String(grp.groupTitle || '')
          .replace(/^[^\p{L}\p{N}]+/u, '')
          .trim();
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
      });
    }
  }

  // LUẬT 3: KHÔNG NGÀY TRỐNG
  if (config.emptyDayLawEnabled) {
    const activeGoals = goals.filter((g) => !g.isCompleted && (g.createdAt || 0) <= dayEnd);
    if (activeGoals.length > 0 && dayStrikes.length === 0) {
      findings.push({
        lawId: 'LAW_EMPTY_DAY',
        type: 'EMPTY_DAY',
        reason: `Ngày ${dateStr} trôi qua mà không có bất kỳ Todo Công Phá nào dù đang leo ${activeGoals.length} ngọn núi.`,
        details: activeGoals.map((g) => `⛰️ ${g.title}`),
        strikeIdsToMark: [],
      });
    }
  }

  // LUẬT 4: TỰ VẤN
  if (config.journalLawEnabled && dayStrikes.length > 0) {
    const hasJournal = (db.reflectionJournals || []).some((j) => j.date === dateStr);
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

export function evaluatePendingDays(source, todayStr, nowMs = Date.now()) {
  if (!source || !source.session) {
    return {
      db: source,
      changed: false,
      newViolations: [],
      evaluatedDays: [],
      cleanDays: [],
      offlineReport: null,
    };
  }

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

  const unchanged = {
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

  let working = source;
  let streak = source.session.currentStreak || 0;
  let violationCount = source.session.violationCount || 0;
  const newViolations = [];
  const evaluatedDays = [];
  const cleanDays = [];
  const offlineMissedDates = [];

  for (let d = shiftDateStr(last, 1); d <= yesterday; d = shiftDateStr(d, 1)) {
    if (d < sessionStartDateStr) continue;

    const dayEnd = getShiftEndOfDayMs(d, config.workShiftMode, nightStartTime);
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
          dailyStrikes: (working.dailyStrikes || []).map((s) =>
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
      const hadStrikes = (working.dailyStrikes || []).some((s) => s.date === d);
      const hadRituals = (working.ritualGroups || []).some((g) =>
        (g.items || []).some(
          (it) => (!it.createdAt || it.createdAt <= dayEnd) && isRitualScheduledForDate(it, d)
        )
      );
      if (hadStrikes || hadRituals) {
        streak += 1;
        cleanDays.push(d);
      }
    }
  }

  if (evaluatedDays.length === 0) {
    return unchanged;
  }

  const sortedNew = [...newViolations].sort((a, b) => b.timestamp - a.timestamp);
  const lastEvaluated = evaluatedDays[evaluatedDays.length - 1];
  const missedDeadlineWhileOffline = offlineMissedDates.length > 0;

  let offlineReport = source.session.pendingOfflineReport || null;
  if (missedDeadlineWhileOffline || clockRollbackDetected || sortedNew.length > 0) {
    const summaryParts = [];
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
      violations: [...sortedNew, ...(working.violations || [])],
    },
    changed: true,
    newViolations: sortedNew,
    evaluatedDays,
    cleanDays,
    offlineReport,
  };
}

export function getCurrentPendingObligations(db, nowMs = Date.now()) {
  if (!db || !db.session) {
    return { shiftDateStr: getTodayDateStr(nowMs), cutoffMs: nowMs, minutesLeft: 0, findings: [] };
  }
  const config = getLawConfig(db);
  const nightStartTime = getEffectiveNightStartTime(config);
  const shiftDateStr = getShiftDateStr(nowMs, config.workShiftMode, nightStartTime);
  const cutoffMs = getShiftEndOfDayMs(shiftDateStr, config.workShiftMode, nightStartTime);
  const minutesLeft = Math.max(0, Math.floor((cutoffMs - nowMs) / 60000));
  const findings = findDayViolations(db, shiftDateStr, config);
  return {
    shiftDateStr,
    cutoffMs,
    minutesLeft,
    findings,
  };
}
