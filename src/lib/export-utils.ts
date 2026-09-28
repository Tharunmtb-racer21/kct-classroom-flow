/**
 * Export Utilities for KCT PULSE — Exporting Session Reports to CSV & Excel (.xlsx)
 */

import * as XLSX from "xlsx";

type Response = {
  id: string;
  answer: string;
  participant_id: string;
  created_at: string;
};

type Question = {
  id: string;
  title: string;
  type: "wordcloud" | "poll" | "quiz";
  options: string[];
  correct_answer: string | null;
  order_index: number;
  points?: number;
  marks?: number;
  responses: Response[];
};

type Participant = {
  id: string;
  name: string;
  joined_at: string;
};

type ReportSession = {
  id: string;
  title: string;
  code: string;
  status: "draft" | "live" | "ended";
  created_at: string;
  participants: Participant[];
  questions: Question[];
};

/**
 * Escapes CSV cell content properly for MS Excel / Google Sheets
 */
function escapeCSVCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Exports a session's full student data and raw responses to CSV format (.csv)
 */
export function exportSessionToCSV(session: ReportSession) {
  const quizQuestions = session.questions.filter((q) => q.type === "quiz");

  // Build CSV Header
  const headers = [
    "Student Name",
    "Joined At",
    "Questions Attempted",
    "Quiz Score",
    "Marks Obtained",
    ...session.questions.map((q, idx) => `Q${idx + 1}: ${q.title} (${q.type})`),
  ];

  const rows: string[][] = [headers];

  // Build rows per participant
  session.participants.forEach((p) => {
    const responsesCount = session.questions.reduce((sum, q) => {
      const hasResp = q.responses?.some((r) => r.participant_id === p.id);
      return sum + (hasResp ? 1 : 0);
    }, 0);

    const correctCount = quizQuestions.reduce((sum, q) => {
      const resp = q.responses?.find((r) => r.participant_id === p.id);
      return sum + (resp && resp.answer === q.correct_answer ? 1 : 0);
    }, 0);

    const marksObtained = quizQuestions.reduce((sum, q) => {
      const resp = q.responses?.find((r) => r.participant_id === p.id);
      const isCorrect = resp && resp.answer === q.correct_answer;
      return sum + (isCorrect ? (q.marks ?? q.points ?? 1) : 0);
    }, 0);
    const totalQuizMarks = quizQuestions.reduce((sum, q) => sum + (q.marks ?? q.points ?? 1), 0);

    const quizScoreStr =
      quizQuestions.length > 0 ? `${correctCount} / ${quizQuestions.length}` : "N/A";

    const marksStr =
      quizQuestions.length > 0
        ? totalQuizMarks === 0
          ? "No Marks"
          : `${marksObtained} / ${totalQuizMarks}`
        : "N/A";

    const questionAnswers = session.questions.map((q) => {
      const resp = q.responses?.find((r) => r.participant_id === p.id);
      return resp ? resp.answer : "No Response";
    });

    rows.push([
      p.name,
      new Date(p.joined_at).toLocaleString(),
      `${responsesCount} / ${session.questions.length}`,
      quizScoreStr,
      marksStr,
      ...questionAnswers,
    ]);
  });

  const csvContent =
    "data:text/csv;charset=utf-8,\uFEFF" +
    rows.map((r) => r.map(escapeCSVCell).join(",")).join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute(
    "download",
    `KCT_PULSE_Report_${session.code}_${session.title.replace(/\s+/g, "_")}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Exports a session's full report formatted for MS Excel (.xlsx) using SheetJS
 */
export function exportSessionToExcel(session: ReportSession) {
  const quizQuestions = session.questions.filter((q) => q.type === "quiz");

  // Title rows
  const titleRows: (string | number)[][] = [
    [`KCT PULSE Report: ${session.title} (${session.code})`],
    [`Created: ${new Date(session.created_at).toLocaleString()}`],
    [`Total Participants: ${session.participants.length}  |  Total Questions: ${session.questions.length}`],
    [], // empty spacer row
  ];

  // Data header
  const headers = [
    "Student Name",
    "Joined At",
    "Questions Attempted",
    "Total Questions",
    "Quiz Score",
    "Total Quiz Questions",
    "Marks Obtained",
    ...session.questions.map((q, idx) => `Q${idx + 1}: ${q.title} (${q.type})`),
  ];

  // Data rows
  const dataRows: (string | number)[][] = [];
  session.participants.forEach((p) => {
    const responsesCount = session.questions.reduce((sum, q) => {
      const hasResp = q.responses?.some((r) => r.participant_id === p.id);
      return sum + (hasResp ? 1 : 0);
    }, 0);

    const correctCount = quizQuestions.reduce((sum, q) => {
      const resp = q.responses?.find((r) => r.participant_id === p.id);
      return sum + (resp && resp.answer === q.correct_answer ? 1 : 0);
    }, 0);

    const marksObtained = quizQuestions.reduce((sum, q) => {
      const resp = q.responses?.find((r) => r.participant_id === p.id);
      const isCorrect = resp && resp.answer === q.correct_answer;
      return sum + (isCorrect ? (q.marks ?? q.points ?? 1) : 0);
    }, 0);
    const totalQuizMarks = quizQuestions.reduce((sum, q) => sum + (q.marks ?? q.points ?? 1), 0);

    const questionAnswers = session.questions.map((q) => {
      const resp = q.responses?.find((r) => r.participant_id === p.id);
      return resp ? resp.answer : "No Response";
    });

    dataRows.push([
      p.name,
      new Date(p.joined_at).toLocaleString(),
      responsesCount,
      session.questions.length,
      correctCount,
      quizQuestions.length,
      quizQuestions.length > 0
        ? totalQuizMarks === 0
          ? "No Marks"
          : `${marksObtained} / ${totalQuizMarks}`
        : "N/A",
      ...questionAnswers,
    ]);
  });

  // Combine all rows
  const allRows = [...titleRows, headers, ...dataRows];

  // Create worksheet from array of arrays
  const ws = XLSX.utils.aoa_to_sheet(allRows);

  // Set column widths for better readability
  const colWidths = headers.map((h) => ({ wch: Math.max(h.length + 2, 16) }));
  ws["!cols"] = colWidths;

  // Create workbook and append the worksheet
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Session Assessment Report");

  // Write the file — this produces a real .xlsx (OpenXML ZIP) file
  XLSX.writeFile(
    wb,
    `KCT_PULSE_Assessment_${session.code}_${session.title.replace(/\s+/g, "_")}.xlsx`,
  );
}
