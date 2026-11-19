import React from 'react';
import {
  AlertTriangle,
  Check,
  Gavel,
  Plus,
  Scale,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
} from 'lucide-react';
import {
  ConfirmDeleteTarget,
  DailyStrikeTodoEntity,
  MonkDatabaseSchema,
  MountainMilestoneItem,
  ProofAnalysisResult,
  SacredScrollEntity,
  TodoActivityType,
} from '../types/models';
import { ACTIVITY_TYPE_META, ALL_ACTIVITY_TYPES } from '../services/timeAuditEngine';
import { resolveProofImageUrl } from '../services/desktopBridge';
import { getTodayDateStr } from '../services/defaultData';
import {
  LawEvaluationResult,
  LawFinding,
  VIOLATION_TYPE_LABELS,
} from '../services/mountainLaws';
import { LiveProofModal } from '../components/LiveProofModal';
import { SacredScrollBookViewer } from '../components/SacredScrollBookViewer';

interface AppModalsProps {
  db: MonkDatabaseSchema;
  todayStr: string;
  timeLeftTodayLabel: string;
  todayLawPreview: LawFinding[];
  remainingTaskMods: number;
  maxDailyTaskMods: number;

  // Goal modal state
  goalModalOpen: boolean;
  editingGoalId: string | null;
  goalTitleDraft: string;
  goalCategoryDraft: string;
  goalDescDraft: string;
  goalVowDraft: string;
  goalHasDeadlineDraft: boolean;
  goalTargetDateDraft: string;
  goalMilestonesDraft: MountainMilestoneItem[];
  newMilestoneText: string;
  onCloseGoalModal: () => void;
  onSaveGoalModal: (e: React.FormEvent) => void;
  onChangeGoalTitle: (v: string) => void;
  onChangeGoalCategory: (v: string) => void;
  onChangeGoalDesc: (v: string) => void;
  onChangeGoalVow: (v: string) => void;
  onChangeGoalHasDeadline: (v: boolean) => void;
  onChangeGoalTargetDate: (v: string) => void;
  onChangeGoalMilestones: React.Dispatch<React.SetStateAction<MountainMilestoneItem[]>>;
  onChangeNewMilestoneText: (v: string) => void;

  // Confirm delete modal state (Goal or Ritual Group)
  confirmDeleteTarget: ConfirmDeleteTarget | null;
  onCancelDeleteTarget: () => void;
  onConfirmDeleteTarget: () => void;

  // Violation / Law modal
  violationModalOpen: boolean;
  lawVerdict: LawEvaluationResult | null;
  onCloseViolationModal: () => void;
  onGoToLawsTab: () => void;
  onRunLawEvaluationTodayNow: () => void;

  // Live Proof modal
  proofModalTarget: {
    strikeId: string;
    title: string;
    markCompleteAfterProof: boolean;
  } | null;
  onConfirmProof: (stampedDataUrl: string, analysis: ProofAnalysisResult, caption: string) => void;
  onCancelProof: () => void;

  // Sacred Scroll modal
  viewingScroll: SacredScrollEntity | null;
  ceremonyScroll: SacredScrollEntity | null;
  onFinishCeremony: () => void;
  onCloseScrollViewer: () => void;
  onExportedScrollPdf: (scrollId: string, pdfPath: string) => void;

  // Zoomed photo lightbox
  zoomedHistoryPhoto: {
    uri: string;
    title: string;
    caption: string;
    dateStr: string;
  } | null;
  onCloseZoomedPhoto: () => void;

  // Edit / Delete Strike quota modals
  strikeBeingEdited: DailyStrikeTodoEntity | null;
  editStrikeTitle: string;
  editStrikePomo: number;
  editStrikeActivityType: TodoActivityType;
  editStrikeRequiresPhoto: boolean;
  onChangeEditStrikeTitle: (v: string) => void;
  onChangeEditStrikePomo: (v: number) => void;
  onChangeEditStrikeActivityType: (v: TodoActivityType) => void;
  onToggleEditStrikeRequiresPhoto: () => void;
  onCloseEditStrike: () => void;
  onConfirmEditStrike: () => void;

  strikeBeingDeleted: DailyStrikeTodoEntity | null;
  onCloseDeleteStrike: () => void;
  onConfirmDeleteStrike: () => void;

  showQuotaExhaustedModal: boolean;
  onCloseQuotaExhaustedModal: () => void;
}

export const AppModals: React.FC<AppModalsProps> = ({
  db,
  todayStr,
  timeLeftTodayLabel,
  todayLawPreview,
  remainingTaskMods,
  maxDailyTaskMods,
  goalModalOpen,
  editingGoalId,
  goalTitleDraft,
  goalCategoryDraft,
  goalDescDraft,
  goalVowDraft,
  goalHasDeadlineDraft,
  goalTargetDateDraft,
  goalMilestonesDraft,
  newMilestoneText,
  onCloseGoalModal,
  onSaveGoalModal,
  onChangeGoalTitle,
  onChangeGoalCategory,
  onChangeGoalDesc,
  onChangeGoalVow,
  onChangeGoalHasDeadline,
  onChangeGoalTargetDate,
  onChangeGoalMilestones,
  onChangeNewMilestoneText,
  confirmDeleteTarget,
  onCancelDeleteTarget,
  onConfirmDeleteTarget,
  violationModalOpen,
  lawVerdict,
  onCloseViolationModal,
  onGoToLawsTab,
  onRunLawEvaluationTodayNow,
  proofModalTarget,
  onConfirmProof,
  onCancelProof,
  viewingScroll,
  ceremonyScroll,
  onFinishCeremony,
  onCloseScrollViewer,
  onExportedScrollPdf,
  zoomedHistoryPhoto,
  onCloseZoomedPhoto,
  strikeBeingEdited,
  editStrikeTitle,
  editStrikePomo,
  editStrikeActivityType,
  editStrikeRequiresPhoto,
  onChangeEditStrikeTitle,
  onChangeEditStrikePomo,
  onChangeEditStrikeActivityType,
  onToggleEditStrikeRequiresPhoto,
  onCloseEditStrike,
  onConfirmEditStrike,
  strikeBeingDeleted,
  onCloseDeleteStrike,
  onConfirmDeleteStrike,
  showQuotaExhaustedModal,
  onCloseQuotaExhaustedModal,
}) => {
  return (
    <>
      {/* MODAL 1: CREATE / EDIT MOUNTAIN (GOAL) */}
      {goalModalOpen && (
        <div className="zen-modal-backdrop" onClick={onCloseGoalModal}>
          <div
            className="zen-modal-card"
            style={{ maxWidth: 760, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 14,
              }}
            >
              <div>
                <span className="zen-tag-red">THIẾT LẬP ĐỈNH NÚI (GOAL TRACKER)</span>
                <h2 style={{ marginTop: 4 }}>
                  {editingGoalId
                    ? 'Chỉnh Sửa Ngọn Núi & Checklist Mục Tiêu'
                    : '⛰️ Dựng Ngọn Núi Mới (Mục Tiêu Mới Để Chinh Phục)'}
                </h2>
              </div>
              <button type="button" className="zen-btn zen-btn-ghost" onClick={onCloseGoalModal}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={onSaveGoalModal} className="zen-form-grid">
              <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12.5, color: '#B8B4A9' }}>
                    Tên Ngọn Núi (Goal cụ thể, VD: Đạt Tiếng Trung HSK 6, Đạt IELTS 7.5...):
                  </label>
                  <input
                    type="text"
                    className="zen-input"
                    style={{ width: '100%', marginTop: 4 }}
                    placeholder="VD: Đạt Chứng Chỉ Tiếng Trung HSK 6 (210+ điểm)"
                    value={goalTitleDraft}
                    onChange={(e) => onChangeGoalTitle(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12.5, color: '#B8B4A9' }}>Lĩnh vực / Phân loại:</label>
                  <input
                    type="text"
                    className="zen-input"
                    style={{ width: '100%', marginTop: 4 }}
                    placeholder="VD: Ngoại Ngữ, Sự Nghiệp, Kỹ Năng..."
                    value={goalCategoryDraft}
                    onChange={(e) => onChangeGoalCategory(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12.5, color: '#B8B4A9' }}>
                  Mô tả mục tiêu & Tiêu chí hoàn thành Đỉnh Núi:
                </label>
                <input
                  type="text"
                  className="zen-input"
                  style={{ width: '100%', marginTop: 4 }}
                  placeholder="Mô tả rõ những gì cần đạt được..."
                  value={goalDescDraft}
                  onChange={(e) => onChangeGoalDesc(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: 12.5, color: '#A8D8C6', fontWeight: 700 }}>
                  Lời Thề Với Bản Thân Tương Lai (Để không bao giờ nói "Giá như..."):
                </label>
                <input
                  type="text"
                  className="zen-input"
                  style={{ width: '100%', marginTop: 4 }}
                  value={goalVowDraft}
                  onChange={(e) => onChangeGoalVow(e.target.value)}
                />
              </div>

              <div
                style={{
                  padding: '12px 14px',
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(246, 244, 238, 0.12)',
                  borderRadius: 4,
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={goalHasDeadlineDraft}
                    onChange={(e) => onChangeGoalHasDeadline(e.target.checked)}
                    style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#3E8A72' }}
                  />
                  <div>
                    <strong style={{ fontSize: 13.5, color: '#F6F4EE' }}>
                      Đặt thời gian mục tiêu hoàn thành (Chọn ngày deadline cụ thể)
                    </strong>
                    <div style={{ fontSize: 12, color: '#B8B4A9' }}>
                      Bỏ chọn nếu đây là mục tiêu dài hạn, phức tạp hoặc chưa ước lượng được thời
                      gian.
                    </div>
                  </div>
                </label>

                {goalHasDeadlineDraft && (
                  <div
                    style={{
                      marginTop: 12,
                      paddingTop: 10,
                      borderTop: '1px dashed rgba(246, 244, 238, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: 12,
                          color: '#A8D8C6',
                          marginBottom: 4,
                          fontWeight: 600,
                        }}
                      >
                        Chọn ngày mục tiêu hoàn thành (Lịch):
                      </label>
                      <input
                        type="date"
                        className="zen-input"
                        value={goalTargetDateDraft}
                        min={getTodayDateStr()}
                        onChange={(e) => onChangeGoalTargetDate(e.target.value)}
                        style={{ padding: '6px 12px', fontSize: 13.5 }}
                      />
                    </div>
                    {goalTargetDateDraft && (
                      <div style={{ fontSize: 13, color: '#f0c878', marginTop: 14 }}>
                        ⏳ Dự kiến còn khoảng{' '}
                        <strong>
                          {Math.max(
                            1,
                            Math.ceil(
                              (new Date(`${goalTargetDateDraft}T23:59:59`).getTime() - Date.now()) /
                                86400000
                            )
                          )}{' '}
                          ngày
                        </strong>{' '}
                        để chinh phục đỉnh núi này!
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div
                style={{
                  marginTop: 8,
                  padding: 14,
                  background: 'rgba(12, 13, 14, 0.85)',
                  border: '1px solid rgba(246, 244, 238, 0.18)',
                  borderRadius: 4,
                }}
              >
                <label style={{ fontSize: 13.5, color: '#A8D8C6', fontWeight: 700 }}>
                  Checklist Mục Tiêu Của Đỉnh Núi (Tick hoàn thành từng mục để đo % tiến độ Đỉnh Núi):
                </label>
                {goalMilestonesDraft.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: '#9E9A8E', marginTop: 8 }}>
                    Chưa có mục checklist nào. Nhập từng đầu việc/tiêu chí hoàn thành của Goal bên
                    dưới.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                    {goalMilestonesDraft.map((m, idx) => (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={m.isCompleted}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            onChangeGoalMilestones((prev) =>
                              prev.map((x) => (x.id === m.id ? { ...x, isCompleted: checked } : x))
                            );
                          }}
                        />
                        <span
                          style={{
                            fontSize: 12,
                            color: '#9E9A8E',
                            width: 34,
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          #{idx + 1}
                        </span>
                        <input
                          type="text"
                          className="zen-input"
                          style={{ flex: 1, padding: '6px 10px', fontSize: 13 }}
                          value={m.title}
                          onChange={(e) => {
                            const val = e.target.value;
                            onChangeGoalMilestones((prev) =>
                              prev.map((x) => (x.id === m.id ? { ...x, title: val } : x))
                            );
                          }}
                        />
                        <button
                          type="button"
                          className="zen-btn zen-btn-ghost"
                          style={{ padding: '4px 8px' }}
                          onClick={() =>
                            onChangeGoalMilestones((prev) => prev.filter((x) => x.id !== m.id))
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <input
                    type="text"
                    className="zen-input"
                    style={{ flex: 1, padding: '6px 10px', fontSize: 13 }}
                    placeholder="+ Nhập đầu việc mới vào Checklist của Goal..."
                    value={newMilestoneText}
                    onChange={(e) => onChangeNewMilestoneText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (!newMilestoneText.trim()) return;
                        onChangeGoalMilestones((prev) => [
                          ...prev,
                          {
                            id: `chk-${Date.now()}`,
                            title: newMilestoneText.trim(),
                            isCompleted: false,
                          },
                        ]);
                        onChangeNewMilestoneText('');
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="zen-btn zen-btn-outline"
                    onClick={() => {
                      if (!newMilestoneText.trim()) return;
                      onChangeGoalMilestones((prev) => [
                        ...prev,
                        {
                          id: `chk-${Date.now()}`,
                          title: newMilestoneText.trim(),
                          isCompleted: false,
                        },
                      ]);
                      onChangeNewMilestoneText('');
                    }}
                  >
                    <Plus size={14} /> Thêm Mục
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button type="button" className="zen-btn zen-btn-ghost" onClick={onCloseGoalModal}>
                  Hủy
                </button>
                <button type="submit" className="zen-btn zen-btn-seal">
                  <Check size={16} />
                  <span>{editingGoalId ? 'Lưu Cập Nhật Ngọn Núi' : 'Khởi Tạo Ngọn Núi'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 9: XÁC NHẬN XÓA ĐỈNH NÚI (GOAL) HOẶC NHÓM NGHI THỨC */}
      {confirmDeleteTarget && (
        <div
          className="zen-modal-backdrop"
          style={{ zIndex: 3400 }}
          onClick={onCancelDeleteTarget}
        >
          <div
            className="zen-modal-card confirm-delete-modal"
            style={{ maxWidth: 540 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-header-row" style={{ marginBottom: 14 }}>
              <div>
                <span className="violation-severe-badge">XÁC NHẬN HÀNH ĐỘNG KHÔNG THỂ HOÀN TÁC</span>
                <h3 style={{ fontSize: 20, marginTop: 6, color: '#ffebee' }}>
                  {confirmDeleteTarget.kind === 'GOAL'
                    ? '🗑️ Xác Nhận Xóa Ngọn Núi (Goal)'
                    : '🗑️ Xác Nhận Xóa Nhóm Nghi Thức'}
                </h3>
              </div>
              <button type="button" className="zen-btn zen-btn-ghost" onClick={onCancelDeleteTarget}>
                <X size={18} />
              </button>
            </div>

            <div className="confirm-delete-callout">
              <p style={{ margin: 0, fontSize: 14.5, color: '#F6F4EE' }}>
                Bạn có chắc chắn muốn xóa{' '}
                {confirmDeleteTarget.kind === 'GOAL' ? 'Đỉnh Núi' : 'Nhóm Nghi Thức'}:{' '}
                <strong style={{ color: '#ff8a80' }}>"{confirmDeleteTarget.title}"</strong>?
              </p>
              <p style={{ margin: '10px 0 0 0', fontSize: 13, color: '#d0ccc0', lineHeight: 1.55 }}>
                {confirmDeleteTarget.kind === 'GOAL'
                  ? confirmDeleteTarget.strikeCount > 0
                    ? `⚠️ Ngọn núi này đang gắn với ${confirmDeleteTarget.strikeCount} Todo Công Phá & lịch sử ảnh PoW. Nếu xóa, ngọn núi và các Todo thuộc núi này sẽ biến mất khỏi danh sách theo dõi.`
                    : 'Mục tiêu và Checklist bên trong sẽ bị xóa khỏi danh sách Đỉnh Núi hiện tại.'
                  : confirmDeleteTarget.itemCount > 0
                  ? `⚠️ Nhóm này đang chứa ${confirmDeleteTarget.itemCount} bước Nghi Thức cùng toàn bộ lịch sử ngày đã check. Dữ liệu nhóm này sẽ bị xóa vĩnh viễn.`
                  : 'Nhóm Nghi Thức này sẽ bị xóa vĩnh viễn.'}
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="zen-btn zen-btn-seal"
                onClick={onCancelDeleteTarget}
              >
                <Check size={16} />
                <span>Giữ Lại (Hủy Bỏ)</span>
              </button>
              <button
                type="button"
                className="zen-btn zen-btn-danger"
                onClick={onConfirmDeleteTarget}
              >
                <Trash2 size={15} />
                <span>Xác Nhận Xóa Vĩnh Viễn</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: MOUNTAIN LAW & AUTOMATIC VIOLATION LEDGER MODAL */}
      {(violationModalOpen || lawVerdict) && (
        <div className="zen-modal-backdrop" onClick={onCloseViolationModal}>
          <div
            className={`zen-modal-card ${
              db.session.violationCount > 0 ? 'violation-modal-crimson' : 'violation-modal-clean'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="violation-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  className={
                    db.session.violationCount > 0
                      ? 'violation-skull-icon'
                      : 'violation-clean-icon'
                  }
                >
                  {db.session.violationCount > 0 ? (
                    <AlertTriangle size={28} color="#fff" />
                  ) : (
                    <ShieldCheck size={28} color="#7DBFA8" />
                  )}
                </div>
                <div>
                  <span
                    className={
                      db.session.violationCount > 0 ? 'violation-severe-badge' : 'zen-tag-red'
                    }
                  >
                    {db.session.violationCount > 0
                      ? 'CẢNH BÁO VI PHẠM LUẬT NÚI — ĐÃ PHÁ VỠ KỶ LUẬT'
                      : 'HỆ THỐNG TỰ ĐỘNG XÉT DUYỆT THEO BỘ LUẬT NÚI'}
                  </span>
                  <h2
                    style={{
                      color: db.session.violationCount > 0 ? '#ffebee' : '#F6F4EE',
                      marginTop: 4,
                    }}
                  >
                    Sổ Án & Kiểm Tra Luật Núi ({db.session.violationCount} Lần Vi Phạm)
                  </h2>
                </div>
              </div>
              <button type="button" className="zen-btn zen-btn-ghost" onClick={onCloseViolationModal}>
                <X size={18} />
              </button>
            </div>

            <div
              className={
                db.session.violationCount > 0 ? 'violation-severe-callout' : 'law-clean-callout'
              }
            >
              <p>
                <strong>⚖️ Cơ chế tính xét tự động:</strong> Hệ thống tự động kiểm tra vào cuối mỗi
                ngày (23:59). Trong ngày nếu <strong>không hoàn thành hết Todo Công Phá</strong> đã đề
                ra sẽ tính <strong>+1 lần vi phạm</strong>; nếu{' '}
                <strong>không hoàn thành đủ các thói quen Nghi Thức</strong> cũng tính{' '}
                <strong>+1 lần vi phạm</strong> (đồng thời đưa chuỗi Streak về 0).
              </p>
              <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <button type="button" className="zen-btn zen-btn-seal" onClick={onGoToLawsTab}>
                  <Scale size={15} />
                  <span>Đọc Chi Tiết Toàn Bộ Luật Núi</span>
                </button>
                <button
                  type="button"
                  className="zen-btn zen-btn-outline"
                  onClick={onRunLawEvaluationTodayNow}
                >
                  <Gavel size={15} />
                  <span>Chốt Sổ & Xét Duyệt Hôm Nay Ngay ({todayStr})</span>
                </button>
              </div>
            </div>

            <div
              className={`law-live-audit-box ${
                todayLawPreview.length > 0 ? 'has-pending' : 'all-clear'
              }`}
              style={{ marginBottom: 16 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 14, color: '#F6F4EE' }}>
                  Trạng thái hôm nay ({todayStr}) — Còn {timeLeftTodayLabel} nữa xét duyệt:
                </strong>
                <span
                  className={`status-pill-tag ${
                    todayLawPreview.length === 0 ? 'done' : 'pending'
                  }`}
                >
                  {todayLawPreview.length === 0
                    ? '✓ Đã hoàn thành đủ nghĩa vụ hôm nay'
                    : `Còn ${todayLawPreview.length} điều luật chưa hoàn tất`}
                </span>
              </div>
              {todayLawPreview.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {todayLawPreview.map((f, i) => (
                    <div key={i} className="law-audit-modal-mini-row">
                      <strong>{VIOLATION_TYPE_LABELS[f.type]}:</strong>{' '}
                      <span>{f.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <h4 style={{ marginBottom: 8, color: '#F6F4EE', fontSize: 15 }}>
              📋 Lịch Sử Vi Phạm Do Hệ Thống Ghi Nhận ({db.violations.length} bản ghi):
            </h4>
            <div className="violations-log-list" style={{ maxHeight: 300, overflowY: 'auto' }}>
              {db.violations.length === 0 ? (
                <div
                  style={{
                    padding: 22,
                    textAlign: 'center',
                    color: '#A8D8C6',
                    background: 'rgba(62, 138, 114, 0.1)',
                    borderRadius: 4,
                    border: '1px dashed rgba(91, 174, 147, 0.35)',
                  }}
                >
                  ✅ Chưa có bất kỳ vi phạm nào. Hãy tiếp tục hoàn thành đủ Todo Công Phá và Nghi Thức
                  mỗi ngày!
                </div>
              ) : (
                db.violations.map((v, idx) => (
                  <div key={v.id} className="violation-log-item-severe">
                    <div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className="violation-scar-tag">VI PHẠM #{db.violations.length - idx}</span>
                        <span className="violation-scar-tag" style={{ background: '#8e2424' }}>
                          {VIOLATION_TYPE_LABELS[v.type] || 'Vi phạm Luật Núi'}
                        </span>
                        <strong style={{ color: '#ff8a80' }}>Ngày {v.date}</strong>
                        {v.goalTitle && (
                          <span style={{ fontSize: 12, color: '#ffcdd2' }}>
                            &bull; Đỉnh núi: {v.goalTitle}
                          </span>
                        )}
                      </div>
                      <p style={{ color: '#F6F4EE', marginTop: 5, fontSize: 13.5 }}>{v.reason}</p>
                      {v.details && v.details.length > 0 && (
                        <div className="violation-details-chips-grid" style={{ marginTop: 6 }}>
                          {v.details.slice(0, 6).map((det, di) => (
                            <span key={di} className="violation-detail-chip">
                              {det}
                            </span>
                          ))}
                          {v.details.length > 6 && (
                            <span className="violation-detail-chip more-tag">
                              +{v.details.length - 6} mục khác (xem chi tiết tại tab 6. Luật Núi)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span
                        style={{
                          fontSize: 11.5,
                          fontFamily: 'var(--font-mono)',
                          color: '#ff8a80',
                        }}
                      >
                        Mất Streak: {v.previousStreak} ngày &rarr; 0
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: LIVE PROOF OF WORK UPLOAD MODAL */}
      <LiveProofModal
        isOpen={Boolean(proofModalTarget)}
        taskTitle={proofModalTarget?.title || ''}
        onConfirmProof={onConfirmProof}
        onCancel={onCancelProof}
      />

      {/* MODAL 4: SACRED SCROLL BOOK VIEWER */}
      {(viewingScroll || ceremonyScroll) && (
        <SacredScrollBookViewer
          scroll={(ceremonyScroll || viewingScroll)!}
          isCeremonyMode={Boolean(ceremonyScroll)}
          onFinishCeremony={onFinishCeremony}
          onClose={onCloseScrollViewer}
          onExportedPdf={onExportedScrollPdf}
        />
      )}

      {/* MODAL 5: PHOTO ZOOM LIGHTBOX */}
      {zoomedHistoryPhoto && (
        <div
          className="zen-modal-backdrop"
          style={{ zIndex: 3500 }}
          onClick={onCloseZoomedPhoto}
        >
          <div
            className="zen-modal-card"
            style={{ maxWidth: 940, textAlign: 'center' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <div style={{ textAlign: 'left' }}>
                <span className="zen-tag-red">{zoomedHistoryPhoto.dateStr}</span>
                <h3 style={{ marginTop: 4 }}>{zoomedHistoryPhoto.title}</h3>
                <p className="zen-muted-text">“{zoomedHistoryPhoto.caption}”</p>
              </div>
              <button type="button" className="zen-btn zen-btn-outline" onClick={onCloseZoomedPhoto}>
                <X size={16} /> Đóng
              </button>
            </div>
            <img
              src={resolveProofImageUrl(zoomedHistoryPhoto.uri)}
              alt={zoomedHistoryPhoto.title}
              style={{
                maxWidth: '100%',
                maxHeight: '72vh',
                objectFit: 'contain',
                border: '2px solid #3E8A72',
              }}
            />
          </div>
        </div>
      )}

      {/* MODAL 6: EDIT STRIKE QUOTA MODAL */}
      {strikeBeingEdited && (
        <div
          className="zen-modal-backdrop"
          style={{ zIndex: 3200 }}
          onClick={onCloseEditStrike}
        >
          <div
            className="zen-modal-card"
            style={{ maxWidth: 620 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-header-row" style={{ marginBottom: 14 }}>
              <div>
                <span className="zen-tag-red">KỶ LUẬT CÔNG PHÁ</span>
                <h3 style={{ fontSize: 20, marginTop: 4 }}>✏️ Chỉnh Sửa Nhiệm Vụ Công Phá</h3>
              </div>
              <button type="button" className="zen-btn zen-btn-ghost" onClick={onCloseEditStrike}>
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                padding: '12px 14px',
                background: 'rgba(230, 168, 60, 0.12)',
                borderLeft: '4px solid #f0c878',
                borderRadius: 4,
                fontSize: 13,
                color: '#f6f4ee',
                marginBottom: 16,
                lineHeight: 1.5,
              }}
            >
              ⚠️ <strong>Lưu ý kỷ luật:</strong> Bạn còn{' '}
              <strong style={{ color: '#f0c878' }}>
                {remainingTaskMods}/{maxDailyTaskMods} lượt
              </strong>{' '}
              sửa / xóa hôm nay. Chỉnh sửa chỉ nên dùng để làm rõ tiêu đề hoặc điều chỉnh Pomodoro,
              không phải để trốn tránh nhiệm vụ khó!
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                onConfirmEditStrike();
              }}
            >
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#B8B4A9', marginBottom: 6 }}>
                  Tiêu đề nhiệm vụ:
                </label>
                <input
                  type="text"
                  className="zen-input"
                  value={editStrikeTitle}
                  onChange={(e) => onChangeEditStrikeTitle(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#B8B4A9', marginBottom: 6 }}>
                  Loại hoạt động (Tính vào Sổ Quỹ Thời Gian):
                </label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {ALL_ACTIVITY_TYPES.map((t) => {
                    const meta = ACTIVITY_TYPE_META[t];
                    return (
                      <button
                        key={t}
                        type="button"
                        className={`pomo-preset-btn ${editStrikeActivityType === t ? 'active' : ''}`}
                        onClick={() => onChangeEditStrikeActivityType(t)}
                      >
                        {meta.icon} {meta.shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#B8B4A9', marginBottom: 6 }}>
                  Thời lượng Pomodoro:
                </label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[10, 15, 20, 25, 30, 45, 50, 60, 90].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`pomo-preset-btn ${editStrikePomo === m ? 'active' : ''}`}
                      onClick={() => onChangeEditStrikePomo(m)}
                    >
                      {m}p
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <button
                  type="button"
                  className={`pow-toggle-switch ${editStrikeRequiresPhoto ? 'on' : 'off'}`}
                  onClick={onToggleEditStrikeRequiresPhoto}
                >
                  {editStrikeRequiresPhoto ? (
                    <>
                      <ToggleRight size={20} color="#66bb6a" />
                      <span>Live PoW (Bắt buộc ảnh bằng chứng): BẬT</span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft size={20} color="#B8B4A9" />
                      <span>Live PoW (Bắt buộc ảnh bằng chứng): TẮT</span>
                    </>
                  )}
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="zen-btn zen-btn-outline" onClick={onCloseEditStrike}>
                  Hủy Bỏ (Giữ Nguyên)
                </button>
                <button type="submit" className="zen-btn zen-btn-seal">
                  <Check size={16} />
                  <span>Xác Nhận Sửa (-1 lượt)</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 7: DELETE STRIKE CONFIRMATION MODAL */}
      {strikeBeingDeleted && (
        <div
          className="zen-modal-backdrop"
          style={{ zIndex: 3200 }}
          onClick={onCloseDeleteStrike}
        >
          <div
            className="zen-modal-card"
            style={{ maxWidth: 560 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-header-row" style={{ marginBottom: 14 }}>
              <div>
                <span className="zen-tag-red">CẢNH BÁO KỶ LUẬT THÉP</span>
                <h3 style={{ fontSize: 20, marginTop: 4 }}>🗑️ Hủy Bỏ Nhiệm Vụ Công Phá</h3>
              </div>
              <button type="button" className="zen-btn zen-btn-ghost" onClick={onCloseDeleteStrike}>
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                padding: '14px 16px',
                background: 'rgba(198, 40, 40, 0.14)',
                borderLeft: '4px solid #ff5252',
                borderRadius: 4,
                fontSize: 13.5,
                color: '#f6f4ee',
                marginBottom: 16,
                lineHeight: 1.55,
              }}
            >
              <p style={{ margin: 0, fontWeight: 600, color: '#ff8a80' }}>
                ⚠️ HỦY BỎ NHIỆM VỤ LÀ SỰ NHƯỢNG BỘ VỚI BẢN THÂN
              </p>
              <p style={{ margin: '8px 0 0 0' }}>
                Bạn sắp xóa to-do: <strong>"{strikeBeingDeleted.title}"</strong>.
              </p>
              <p style={{ margin: '6px 0 0 0', color: '#B8B4A9', fontSize: 12.5 }}>
                Sau khi xóa, bạn sẽ tiêu hao 1 lượt trong hạn ngạch hôm nay (còn lại{' '}
                <strong style={{ color: '#F6F4EE' }}>
                  {remainingTaskMods - 1}/{maxDailyTaskMods} lượt
                </strong>
                ). Hãy tự hỏi trung thực: Bạn xóa vì đây là sai sót thực tế, hay vì sự trì hoãn
                đang tìm cách trốn tránh?
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="zen-btn zen-btn-seal" onClick={onCloseDeleteStrike}>
                <Check size={16} />
                <span>Giữ Lại — Tôi Sẽ Hoàn Thành!</span>
              </button>
              <button type="button" className="zen-btn zen-btn-danger" onClick={onConfirmDeleteStrike}>
                <Trash2 size={15} />
                <span>Xác Nhận Xóa (-1 Lượt)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 8: QUOTA EXHAUSTED MODAL */}
      {showQuotaExhaustedModal && (
        <div
          className="zen-modal-backdrop"
          style={{ zIndex: 3300 }}
          onClick={onCloseQuotaExhaustedModal}
        >
          <div
            className="zen-modal-card"
            style={{ maxWidth: 540 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-header-row" style={{ marginBottom: 14 }}>
              <div>
                <span className="zen-tag-red">KỶ LUẬT NÚI KHẮT KHE</span>
                <h3 style={{ fontSize: 20, marginTop: 4, color: '#ff8a80' }}>
                  🚫 Đã Hết Lượt Sửa / Xóa Hôm Nay (0/{maxDailyTaskMods})
                </h3>
              </div>
              <button
                type="button"
                className="zen-btn zen-btn-ghost"
                onClick={onCloseQuotaExhaustedModal}
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                padding: '14px 16px',
                background: 'rgba(30, 20, 20, 0.75)',
                border: '1px solid rgba(255, 82, 82, 0.4)',
                borderRadius: 6,
                fontSize: 13.5,
                color: '#f6f4ee',
                lineHeight: 1.6,
                marginBottom: 18,
              }}
            >
              <p style={{ marginTop: 0 }}>
                Hệ thống giới hạn tối đa <strong>{maxDailyTaskMods} lượt sửa hoặc xóa</strong> mỗi
                ngày để ngăn chặn thói quen tạo to-do tùy tiện rồi xóa bừa khi lười biếng.
              </p>
              <p style={{ marginBottom: 0, color: '#A8D8C6' }}>
                <strong>Lựa chọn duy nhất của bạn lúc này:</strong> Đối mặt, bước vào buồng tập trung
                Pomodoro và hoàn thành nhiệm vụ này; hoặc chấp nhận bị Hệ thống Luật Núi ghi nhận 1
                lần vi phạm vào cuối ngày!
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="zen-btn zen-btn-seal"
                onClick={onCloseQuotaExhaustedModal}
              >
                Tôi Hiểu — Tôi Sẽ Tiếp Tục Công Phá
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
