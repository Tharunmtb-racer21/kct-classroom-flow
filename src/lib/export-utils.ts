/**
 * Export Utilities for KCT PULSE — Exporting Session Reports to CSV & Excel (.xlsx)
 */

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

    const quizScoreStr = quizQuestions.length > 0 ? `${correctCount} / ${quizQuestions.length}` : "N/A";

    const questionAnswers = session.questions.map((q) => {
      const resp = q.responses?.find((r) => r.participant_id === p.id);
      return resp ? resp.answer : "No Response";
    });

    rows.push([
      p.name,
      new Date(p.joined_at).toLocaleString(),
      `${responsesCount} / ${session.questions.length}`,
      quizScoreStr,
      ...questionAnswers,
    ]);
  });

  const csvContent =
    "data:text/csv;charset=utf-8,\uFEFF" +
    rows.map((r) => r.map(escapeCSVCell).join(",")).join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `KCT_PULSE_Report_${session.code}_${session.title.replace(/\s+/g, "_")}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Exports a session's full report formatted for MS Excel (.xlsx)
 */
export function exportSessionToExcel(session: ReportSession) {
  const quizQuestions = session.questions.filter((q) => q.type === "quiz");

  const headers = [
    "Student Name",
    "Joined At",
    "Questions Attempted",
    "Total Questions",
    "Quiz Score",
    "Total Quiz Questions",
    ...session.questions.map((q, idx) => `Q${idx + 1}: ${q.title} (${q.type})`),
  ];

  const rows: string[][] = [headers];

  session.participants.forEach((p) => {
    const responsesCount = session.questions.reduce((sum, q) => {
      const hasResp = q.responses?.some((r) => r.participant_id === p.id);
      return sum + (hasResp ? 1 : 0);
    }, 0);

    const correctCount = quizQuestions.reduce((sum, q) => {
      const resp = q.responses?.find((r) => r.participant_id === p.id);
      return sum + (resp && resp.answer === q.correct_answer ? 1 : 0);
    }, 0);

    const questionAnswers = session.questions.map((q) => {
      const resp = q.responses?.find((r) => r.participant_id === p.id);
      return resp ? resp.answer : "No Response";
    });

    rows.push([
      p.name,
      new Date(p.joined_at).toLocaleString(),
      String(responsesCount),
      String(session.questions.length),
      String(correctCount),
      String(quizQuestions.length),
      ...questionAnswers,
    ]);
  });

  // Generate Excel XML Worksheet Structure
  const xmlHeader = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
 <Style ss:ID="Header">
  <Font ss:Bold="1" ss:Color="#FFFFFF"/>
  <Interior ss:Color="#1E293B" ss:Pattern="Solid"/>
  <Alignment ss:Horizontal="Center"/>
 </Style>
 <Style ss:ID="Title">
  <Font ss:Size="14" ss:Bold="1"/>
 </Style>
</Styles>
<Worksheet ss:Name="Session Assessment Report">
<Table>`;

  const xmlTitle = `
 <Row>
  <Cell ss:StyleID="Title"><Data ss:Type="String">KCT PULSE Report: ${session.title} (${session.code})</Data></Cell>
 </Row>
 <Row><Cell><Data ss:Type="String">Created: ${new Date(session.created_at).toLocaleString()}</Data></Cell></Row>
 <Row></Row>`;

  const xmlRows = rows
    .map((row, idx) => {
      const styleAttr = idx === 0 ? ' ss:StyleID="Header"' : "";
      const cells = row
        .map(
          (val) =>
            `<Cell${styleAttr}><Data ss:Type="String">${String(val).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Data></Cell>`
        )
        .join("");
      return `<Row>${cells}</Row>`;
    })
    .join("");

  const xmlFooter = `</Table>
</Worksheet>
</Workbook>`;

  const blob = new Blob([xmlHeader + xmlTitle + xmlRows + xmlFooter], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `KCT_PULSE_Assessment_${session.code}_${session.title.replace(/\s+/g, "_")}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
