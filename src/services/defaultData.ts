import { MonkDatabaseSchema, OptimizationNoteEntity } from '../types/models';

export function getTodayDateStr(nowMs: number = Date.now()): string {
  const d = new Date(nowMs);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createDefaultOptimizationNotes(nowMs: number = Date.now()): OptimizationNoteEntity[] {
  return [
    {
      id: 'opt-default-combo-workout-chinese',
      title: 'Tập thể dục theo hiệp + Luyện nghe / đọc tiếng Trung & Note từ vựng (1 công đôi việc)',
      content:
        'Trong lúc tập thể dục hoặc đi bộ/đạp xe, bật audio luyện nghe tiếng Trung liên tục. Giữa mỗi hiệp tập (1-2 phút nghỉ lấy sức), cầm sổ hoặc app mở sẵn để đọc lướt đoạn tiếng Trung và note ngay từ vựng mới. Vừa rèn luyện thể lực, vừa nạp từ vựng mà không mất thêm khung giờ riêng.',
      category: 'COMBO_TIME_SAVER',
      timeSavedHint: 'Tiết kiệm ~45-60 phút mỗi ngày',
      isPinned: true,
      appliedCount: 0,
      createdAt: nowMs,
      updatedAt: nowMs,
    },
    {
      id: 'opt-default-prep-before-shift',
      title: 'Gom việc vặt (tắm rửa, giặt đồ, chuẩn bị đồ đi làm) thành 1 block cố định',
      content:
        'Thay vì làm rải rác cả ngày khiến mạch tập trung bị cắt vụn, hãy dồn toàn bộ việc chuẩn bị cá nhân vào đúng 1 tiếng trước giờ vào ca (nếu đi ca đêm) hoặc ngay khi về nhà trước khi ngủ. Khung giờ còn lại giữ nguyên vẹn cho leo núi.',
      category: 'LIFE_TRICK',
      timeSavedHint: 'Giảm 30% thời gian chuyển trạng thái',
      isPinned: false,
      appliedCount: 0,
      createdAt: nowMs,
      updatedAt: nowMs,
    },
  ];
}

/**
 * Tạo cơ sở dữ liệu sạch 100% (Không có dữ liệu test) để người dùng bắt đầu hành trình thực tế từ đầu.
 * @param includeDefaultRitualFrames Nếu true (mặc định), tạo sẵn 3 khung tiêu đề nhóm Nghi thức trống để người dùng tiện thêm checkbox.
 */
export function createInitialDatabase(includeDefaultRitualFrames: boolean = true): MonkDatabaseSchema {
  const now = Date.now();
  const yesterday = getTodayDateStr(now - 86400000);

  return {
    session: {
      id: `session-${now}`,
      title: 'Hành Trình Phát Triển Bản Thân — Không Để Ngày Tháng Lãng Phí',
      startTime: now,
      initialDays: 30,
      currentTargetEndTime: now + 30 * 86400000,
      isMonkModeOn: false,
      currentStreak: 0,
      violationCount: 0,
      mottoText:
        'Tương lai nhìn lại sẽ là cảm ơn vì đã nỗ lực, chứ không phải là "Giá như..."',
      whitelistedApps: [],
      processGuardEnabled: false,
      autoWallpaperEnabled: false,
      lastEvaluatedDate: yesterday,
      lastActiveAt: now,
      maxObservedAt: now,
      autoStartWithWindows: true,
      autoOpenOnViolation: true,
      pendingOfflineReport: null,
    },
    peakGoals: [],
    ritualGroups: includeDefaultRitualFrames
      ? [
          {
            id: 'rgroup-morning',
            title: '🌅 Thói quen sau khi ngủ dậy',
            subtitle: 'Các thói quen thực hiện ngay đầu ngày mới để làm chủ năng lượng',
            iconType: 'MORNING',
            createdAt: now,
            items: [],
          },
          {
            id: 'rgroup-return-home',
            title: '🏠 Thói quen khi mới đi làm / đi học về',
            subtitle: 'Nghi thức chuyển giao giúp gột bỏ mệt mỏi và tránh sa đà vào điện thoại',
            iconType: 'RETURN_HOME',
            createdAt: now,
            items: [],
          },
          {
            id: 'rgroup-study-desk',
            title: '⚡ Thói quen khi quyết định ngồi vào bàn học / làm việc',
            subtitle: 'Chuẩn bị không gian và tâm thế tập trung tuyệt đối trước khi bật Pomodoro',
            iconType: 'STUDY_DESK',
            createdAt: now,
            items: [],
          },
        ]
      : [],
    ritualHabits: [],
    dailyStrikes: [],
    reflectionJournals: [],
    sacredScrolls: [],
    violations: [],
    optimizationNotes: includeDefaultRitualFrames ? createDefaultOptimizationNotes(now) : [],
    climbingSchedulePlan: null,
    focusSessionLogs: [],
    savedScheduleProfiles: [],
    dailyWorkShiftLogs: {},
  };
}
