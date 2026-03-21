export interface AssetSection {
  category: string;
  previousTotal: number;
  increaseTotal: number;
  decreaseTotal: number;
  currentTotal: number;
  details: string[];
}

export interface ParsedAssetDetail {
  name: string;
  organization: string;
  position: string;
  sections: AssetSection[];
  rawText: string;
}

// 소계 패턴들 (연도별 형식 차이 대응)
const SECTION_PATTERNS = [
  // 2025: ▶ 건물(소계) 1234 5678 9012 3456
  /[▶►▷]\s*(.+?)(?:\(소계\))\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/,
  // 2023~2024: ▶ 건물 소계 ( ) 1234 5678 9012 3456
  /[▶►▷]\s*(.+?)소계\s*\([^)]*\)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/,
  // 공백 포함: ▶ 건물 ( 소계 ) 1234 ...
  /[▶►▷]\s*(.+?)\(\s*소계\s*\)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/,
];

// 헤더 패턴 (소속/직위/성명)
const HEADER_PATTERNS = [
  /소속\s+(.+?)\s+직위\s+(.+?)\s+성명\s+(.+)/,
  /소\s*속\s+(.+?)\s+직\s*위\s+(.+?)\s+성\s*명\s+(.+)/,
];

function tryMatchSection(
  line: string
): { category: string; nums: number[] } | null {
  for (const pattern of SECTION_PATTERNS) {
    const m = line.match(pattern);
    if (m) {
      return {
        category: m[1].trim(),
        nums: [m[2], m[3], m[4], m[5]].map((s) =>
          parseInt(s.replace(/,/g, ""), 10)
        ),
      };
    }
  }
  return null;
}

function parseHeader(text: string): {
  name: string;
  organization: string;
  position: string;
} {
  for (const pattern of HEADER_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      return {
        organization: m[1].trim(),
        position: m[2].trim(),
        name: m[3].trim(),
      };
    }
  }
  return { name: "", organization: "", position: "" };
}

export function parseAssetDetail(pageTexts: string[]): ParsedAssetDetail {
  const fullText = pageTexts.join("\n");
  const lines = fullText.split("\n");

  const header = parseHeader(fullText);
  const sections: AssetSection[] = [];
  let currentSection: AssetSection | null = null;

  const skipPrefixes = [
    "▶",
    "►",
    "▷",
    "변동액",
    "본인과의",
    "(단위",
    "( :",
    "단위",
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const sectionMatch = tryMatchSection(trimmed);
    if (sectionMatch) {
      if (currentSection) sections.push(currentSection);
      currentSection = {
        category: sectionMatch.category,
        previousTotal: sectionMatch.nums[0],
        increaseTotal: sectionMatch.nums[1],
        decreaseTotal: sectionMatch.nums[2],
        currentTotal: sectionMatch.nums[3],
        details: [],
      };
      continue;
    }

    if (currentSection) {
      const shouldSkip = skipPrefixes.some((p) => trimmed.startsWith(p));
      if (!shouldSkip) {
        currentSection.details.push(trimmed);
      }
    }
  }
  if (currentSection) sections.push(currentSection);

  return {
    name: header.name,
    organization: header.organization,
    position: header.position,
    sections,
    rawText: fullText,
  };
}

export function formatKrw(amountThousand: number): string {
  if (amountThousand === 0) return "0원";
  const abs = Math.abs(amountThousand);
  const sign = amountThousand < 0 ? "-" : "";
  const eok = Math.floor(abs / 100000);
  const man = Math.floor((abs % 100000) / 10);
  const parts: string[] = [];
  if (eok > 0) parts.push(`${eok}억`);
  if (man > 0) parts.push(`${man}만`);
  if (parts.length === 0) parts.push(`${abs}천`);
  return `${sign}${parts.join(" ")}원`;
}
