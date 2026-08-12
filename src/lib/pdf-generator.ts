import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { KCT_LOGO_BASE64 } from "./kct-logo-b64";
import { KCT_HEADER_LOGO_BASE64 } from "./kct-header-logo-b64";

export interface SessionReportInfo {
  sessionName: string;
  sessionCode: string;
  sessionDate: string;
  totalParticipants: number;
  totalQuestions: number;
  duration?: string;
  
  // Customizer fields
  collegeName: string;
  departmentName: string;
  courseName: string;
  semester: string;
  subject: string;
  facultyName: string;
  reportTitle: string;
  logoUrl: string | null;
}

export interface StudentPerformanceRow {
  studentName: string;
  attendance: "Present" | "Absent";
  totalQuestions: number;
  attempted: number;
  correct: number;
  wrong: number;
  unanswered: number;
  accuracy: number; // percentage
  timeTaken?: string;
  status: "Excellent" | "Good" | "Average" | "Needs Improvement" | "Absent";
}

export interface QuestionAnalysisItem {
  index: number;
  title: string;
  type: "quiz" | "poll" | "wordcloud";
  correctResponses: number;
  wrongResponses: number;
}

// Helper to load user-supplied image URL if present
const loadUserImage = (url: string | null): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    if (!url || url.trim() === "" || url.startsWith("/kct-logo")) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
};


// Helper to draw Fallback Logo (Academic Crest Shield)
const drawFallbackLogo = (doc: jsPDF, x: number, y: number, size: number) => {
  const centerX = x + size / 2;
  const topY = y;
  const midY = y + size * 0.6;
  const botY = y + size;
  const leftX = x;
  const rightX = x + size;

  // Draw Shield
  doc.setFillColor(30, 58, 138); // Dark blue #1e3a8a
  doc.rect(leftX, topY, size, size * 0.6, "F");
  doc.triangle(leftX, midY, rightX, midY, centerX, botY, "F");

  // Gold border
  doc.setDrawColor(245, 158, 11); // Amber #f59e0b
  doc.setLineWidth(0.5);
  doc.rect(leftX + 1, topY + 1, size - 2, size * 0.6 - 1, "D");
  doc.triangle(leftX + 1, midY, rightX - 1, midY, centerX, botY - 1.5, "D");

  // Book in center
  doc.setFillColor(255, 255, 255);
  const bookW = size * 0.5;
  const bookH = size * 0.3;
  const bookX = centerX - bookW / 2;
  const bookY = topY + size * 0.25;

  doc.rect(bookX, bookY, bookW / 2 - 0.5, bookH, "F");
  doc.rect(centerX + 0.5, bookY, bookW / 2 - 0.5, bookH, "F");

  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(0.2);
  doc.line(bookX + 1, bookY + 1.5, centerX - 1.5, bookY + 1.5);
  doc.line(bookX + 1, bookY + 3, centerX - 1.5, bookY + 3);
  doc.line(centerX + 1.5, bookY + 1.5, centerX + bookW / 2 - 1, bookY + 1.5);
  doc.line(centerX + 1.5, bookY + 3, centerX + bookW / 2 - 1, bookY + 3);
};

export async function generateSessionPDF(
  session: SessionReportInfo,
  students: StudentPerformanceRow[],
  questions: QuestionAnalysisItem[]
) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageHeight = doc.internal.pageSize.height;
  const pageWidth = doc.internal.pageSize.width;
  const margin = 15;

  // Pre-load custom user logo if specified
  const customLogoImg = await loadUserImage(session.logoUrl);

  // Track page numbers where watermark has been drawn to prevent duplicates
  const watermarkedPages = new Set<number>();

  // Watermark template — draws the KCT logo centered on every page at 8% opacity
  const drawPageWatermark = (docInstance: jsPDF) => {
    try {
      const printableWidth = pageWidth - (margin * 2);
      const watermarkSize = printableWidth * 0.85; // 85% of printable page width (~153mm)
      
      const drawX = (pageWidth - watermarkSize) / 2;
      const drawY = (pageHeight - watermarkSize) / 2;
      
      docInstance.saveGraphicsState();
      
      try {
        let gState;
        if (typeof (docInstance as any).GState === "function") {
          gState = new (docInstance as any).GState({ opacity: 0.13 });
        } else if (typeof (jsPDF as any).GState === "function") {
          gState = new (jsPDF as any).GState({ opacity: 0.13 });
        }
        if (gState) {
          docInstance.setGState(gState);
        }
      } catch (err) {
        console.warn("GState opacity failed:", err);
      }
      
      if (customLogoImg) {
        docInstance.addImage(customLogoImg, "JPEG", drawX, drawY, watermarkSize, watermarkSize);
      } else {
        // Direct Base64 string rendering — 100% reliable, zero network overhead
        docInstance.addImage(KCT_LOGO_BASE64, "JPEG", drawX, drawY, watermarkSize, watermarkSize);
      }
      
      docInstance.restoreGraphicsState();
    } catch (e) {
      console.error("Error drawing watermark:", e);
    }
  };

  const drawWatermarkIfNeeded = (pageNum: number) => {
    if (watermarkedPages.has(pageNum)) return;
    doc.setPage(pageNum);
    drawPageWatermark(doc);
    watermarkedPages.add(pageNum);
  };

  // Draw watermark on the first page immediately
  drawWatermarkIfNeeded(1);

  // Header template
  const drawPageHeader = (docInstance: jsPDF) => {
    const logoSize = 16;
    const logoX = margin;
    const logoY = 12;

    if (customLogoImg) {
      try {
        const imgWidth = customLogoImg.width;
        const imgHeight = customLogoImg.height;
        const aspectRatio = imgWidth / imgHeight;
        let drawWidth = logoSize;
        let drawHeight = logoSize;
        if (aspectRatio > 1) {
          drawHeight = logoSize / aspectRatio;
        } else {
          drawWidth = logoSize * aspectRatio;
        }
        const drawX = logoX + (logoSize - drawWidth) / 2;
        const drawY = logoY + (logoSize - drawHeight) / 2;
        docInstance.addImage(customLogoImg, "JPEG", drawX, drawY, drawWidth, drawHeight);
      } catch (e) {
        docInstance.addImage(KCT_HEADER_LOGO_BASE64, "JPEG", logoX, logoY, logoSize, logoSize);
      }
    } else {
      // Dark navy square KCT logo for header
      docInstance.addImage(KCT_HEADER_LOGO_BASE64, "JPEG", logoX, logoY, logoSize, logoSize);
    }

    docInstance.setTextColor(15, 23, 42); // slate-900
    docInstance.setFont("helvetica", "bold");
    docInstance.setFontSize(12);
    docInstance.text(session.collegeName || "Kumaraguru College of Technology", pageWidth / 2, 15, { align: "center" });

    if (session.departmentName) {
      docInstance.setFont("helvetica", "normal");
      docInstance.setFontSize(9);
      docInstance.setTextColor(71, 85, 105);
      docInstance.text(session.departmentName, pageWidth / 2, 20, { align: "center" });
    }

    docInstance.setFont("helvetica", "bold");
    docInstance.setFontSize(10.5);
    docInstance.setTextColor(30, 58, 138); // blue-800
    docInstance.text(session.reportTitle || "Session Engagement & Performance Report", pageWidth / 2, 26, { align: "center" });

    docInstance.setDrawColor(203, 213, 225);
    docInstance.setLineWidth(0.4);
    docInstance.line(margin, 30, pageWidth - margin, 30);
  };

  // Footer template
  const drawPageFooter = (docInstance: jsPDF, pageNum: number, totalPages: number) => {
    docInstance.setDrawColor(226, 232, 240);
    docInstance.setLineWidth(0.3);
    docInstance.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);

    docInstance.setTextColor(100, 116, 139);
    docInstance.setFont("helvetica", "normal");
    docInstance.setFontSize(7.5);

    docInstance.text(`${session.collegeName || "Kumaraguru College of Technology"} · Founder & designed by THARUN N E | developed by NAVNEETH V`, margin, pageHeight - 10);
    docInstance.text(`Generated On: ${new Date().toLocaleString()} | Generated By: ${session.facultyName || "Faculty"}`, pageWidth / 2, pageHeight - 10, {
      align: "center",
    });
    docInstance.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin, pageHeight - 10, {
      align: "right",
    });
  };

  // --- 1. Session Metadata Block (using autoTable for clean alignment) ---
  const greyBg = [248, 250, 252] as any;
  const metadataRows = [
    [
      { content: "Session Name", styles: { fillColor: greyBg, fontStyle: "bold" as const } },
      { content: session.sessionName || "—" },
      { content: "Session Code", styles: { fillColor: greyBg, fontStyle: "bold" as const } },
      { content: session.sessionCode || "—" },
    ],
    [
      { content: "Date & Time", styles: { fillColor: greyBg, fontStyle: "bold" as const } },
      { content: session.sessionDate || "—" },
      { content: "Faculty Name", styles: { fillColor: greyBg, fontStyle: "bold" as const } },
      { content: session.facultyName || "—" },
    ],
    [
      { content: "Course Name", styles: { fillColor: greyBg, fontStyle: "bold" as const } },
      { content: session.courseName || "—" },
      { content: "Semester", styles: { fillColor: greyBg, fontStyle: "bold" as const } },
      { content: session.semester || "—" },
    ],
  ];

  autoTable(doc, {
    startY: 34,
    body: metadataRows,
    theme: "grid",
    styles: {
      fontSize: 8.5,
      cellPadding: 2.5,
      textColor: [51, 65, 85],
      lineColor: [226, 232, 240],
      lineWidth: 0.25,
    },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 58 },
      2: { cellWidth: 32 },
      3: { cellWidth: 58 },
    },
    margin: { left: margin, right: margin, top: 36, bottom: 22 },
    willDrawPage: (data) => {
      drawWatermarkIfNeeded(data.pageNumber);
    },
  });

  // Calculate coordinates for summary box
  let summaryStartY = (doc as any).lastAutoTable.finalY + 6;
  if (summaryStartY + 35 > pageHeight - 22) {
    doc.addPage();
    summaryStartY = 36;
  }

  // --- 2. Session Summary Dashboard Section ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 58, 138);
  doc.text("Session Summary Analytics", margin, summaryStartY);

  const attendedCount = students.filter(s => s.attendance === "Present").length;
  const absentCount = students.filter(s => s.attendance === "Absent").length;
  const totalResponses = students.reduce((sum, s) => sum + s.attempted, 0);
  
  // Calculate average accuracy of present students
  const presentStudentsWithAccuracy = students.filter(s => s.attendance === "Present");
  const avgAccuracy = presentStudentsWithAccuracy.length > 0
    ? presentStudentsWithAccuracy.reduce((sum, s) => sum + s.accuracy, 0) / presentStudentsWithAccuracy.length
    : 0;

  const summaryRows = [
    [
      { content: "Total Participants", styles: { fontStyle: "bold" as const } },
      { content: String(session.totalParticipants) },
      { content: "Students Attended", styles: { fontStyle: "bold" as const, textColor: [16, 185, 129] as any } },
      { content: String(attendedCount) },
      { content: "Students Not Attended", styles: { fontStyle: "bold" as const, textColor: [239, 68, 68] as any } },
      { content: String(absentCount) },
    ],
    [
      { content: "Total Responses", styles: { fontStyle: "bold" as const } },
      { content: String(totalResponses) },
      { content: "Average Accuracy", styles: { fontStyle: "bold" as const, textColor: [30, 58, 138] as any } },
      { content: `${avgAccuracy.toFixed(1)}%`, styles: { fontStyle: "bold" as const } },
      { content: "Total Questions", styles: { fontStyle: "bold" as const } },
      { content: String(session.totalQuestions) },
    ],
  ];

  autoTable(doc, {
    startY: summaryStartY + 3,
    body: summaryRows,
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [51, 65, 85],
      lineColor: [226, 232, 240],
      lineWidth: 0.25,
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 28 },
      2: { cellWidth: 32 },
      3: { cellWidth: 28 },
      4: { cellWidth: 32 },
      5: { cellWidth: 28 },
    },
    margin: { left: margin, right: margin, top: 36, bottom: 22 },
    willDrawPage: (data) => {
      drawWatermarkIfNeeded(data.pageNumber);
    },
  });

  // Calculate coordinates for student performance table
  let studentTableStartY = (doc as any).lastAutoTable.finalY + 6;
  if (studentTableStartY + 25 > pageHeight - 22) {
    doc.addPage();
    studentTableStartY = 36;
  }

  // --- 3. Student Performance Table ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 58, 138);
  doc.text("Student Performance Register", margin, studentTableStartY);

  const studentHeaders = [
    "Student", "Attendance", "Questions", "Attempted", "Correct", "Wrong", "Unanswered", "Accuracy", "Status"
  ];

  const studentRows = students.map(s => [
    s.studentName || "—",
    s.attendance,
    String(s.totalQuestions),
    `${s.attempted}/${s.totalQuestions}`,
    String(s.correct),
    String(s.wrong),
    String(s.unanswered),
    `${s.accuracy.toFixed(0)}%`,
    s.status,
  ]);

  autoTable(doc, {
    startY: studentTableStartY + 3,
    head: [studentHeaders],
    body: studentRows,
    theme: "grid",
    headStyles: {
      fillColor: [30, 58, 138], // academic blue
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      halign: "center",
    },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      textColor: [51, 65, 85],
      lineColor: [226, 232, 240],
      lineWidth: 0.25,
      halign: "center",
    },
    columnStyles: {
      0: { halign: "left", cellWidth: 36 }, // Student name
      1: { cellWidth: 20 },
      2: { cellWidth: 16 },
      3: { cellWidth: 18 },
      4: { cellWidth: 14 },
      5: { cellWidth: 14 },
      6: { cellWidth: 20 },
      7: { cellWidth: 18, fontStyle: "bold" },
      8: { cellWidth: 24, fontStyle: "bold" },
    },
    didParseCell: (data) => {
      // Highlight accuracy & status colors
      if (data.row.section === "body") {
        if (data.column.index === 1) { // Attendance column
          const val = data.cell.raw as string;
          data.cell.styles.textColor = val === "Present" ? [16, 185, 129] : [239, 68, 68];
        }
        if (data.column.index === 8) { // Status column
          const val = data.cell.raw as string;
          if (val === "Excellent" || val === "Good") {
            data.cell.styles.textColor = [16, 185, 129];
          } else if (val === "Average") {
            data.cell.styles.textColor = [245, 158, 11];
          } else {
            data.cell.styles.textColor = [239, 68, 68];
          }
        }
      }
    },
    margin: { left: margin, right: margin, top: 36, bottom: 22 },
    willDrawPage: (data) => {
      drawWatermarkIfNeeded(data.pageNumber);
    },
  });

  // Calculate coordinates for Question analysis
  let qaStartY = (doc as any).lastAutoTable.finalY + 6;
  if (qaStartY + 25 > pageHeight - 22) {
    doc.addPage();
    qaStartY = 36;
  }

  // --- 4. Question-wise Analysis Section ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 58, 138);
  doc.text("Question-wise Response Analysis", margin, qaStartY);

  const qaHeaders = [
    "Q.No", "Question Title", "Question Type", "Correct Responses", "Wrong/Other Responses", "Accuracy Rate"
  ];

  const qaRows = questions.map(q => {
    const total = q.correctResponses + q.wrongResponses;
    const rate = total > 0 ? (q.correctResponses / total) * 100 : 0;
    
    return [
      String(q.index),
      q.title || "—",
      q.type === "quiz" ? "Quiz" : q.type === "poll" ? "Poll" : "Word Cloud",
      String(q.correctResponses),
      String(q.wrongResponses),
      q.type === "quiz" ? `${rate.toFixed(0)}%` : "N/A"
    ];
  });

  autoTable(doc, {
    startY: qaStartY + 3,
    head: [qaHeaders],
    body: qaRows,
    theme: "grid",
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      halign: "center",
    },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      textColor: [51, 65, 85],
      lineColor: [226, 232, 240],
      lineWidth: 0.25,
      halign: "center",
    },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { halign: "left", cellWidth: 70 }, // Question Title
      2: { cellWidth: 24 },
      3: { cellWidth: 28, fontStyle: "bold", textColor: [16, 185, 129] },
      4: { cellWidth: 28, textColor: [239, 68, 68] },
      5: { cellWidth: 18, fontStyle: "bold" },
    },
    margin: { left: margin, right: margin, top: 36, bottom: 22 },
    willDrawPage: (data) => {
      drawWatermarkIfNeeded(data.pageNumber);
    },
  });

  // --- Add Watermarks, Page Numbers, Headers and Footers to All Pages ---
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawWatermarkIfNeeded(i); // Ensure watermark is on every page
    drawPageHeader(doc);
    drawPageFooter(doc, i, totalPages);
  }

  // Trigger file download using explicit Blob approach for reliable PDF downloads
  const sanitizedSession = (session.sessionName || "Session").replace(/[^a-zA-Z0-9]/g, "_");
  const filename = `${sanitizedSession}_Assessment_Report.pdf`;

  const pdfBlob = doc.output("blob");
  const blobUrl = URL.createObjectURL(new Blob([pdfBlob], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}
