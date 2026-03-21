import { execFile, exec as execCb } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const execAsync = promisify(execCb);

const EZPDF_BASE_URL = "https://gwanbo.go.kr/ezpdf/customLayout.jsp";

/**
 * agent-browser CLI 실행 헬퍼
 */
async function runBrowser(
  args: string[],
  timeout: number
): Promise<string> {
  const { stdout } = await execFileAsync("agent-browser", args, {
    timeout,
    env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: String(timeout) },
  });
  return stdout;
}

/**
 * agent-browser로 eval 실행 (base64 방식)
 */
async function evalInBrowser(
  js: string,
  timeout: number
): Promise<string> {
  const b64 = Buffer.from(js).toString("base64");
  const { stdout } = await execFileAsync(
    "agent-browser",
    ["eval", "-b", b64],
    {
      timeout,
      env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: String(timeout) },
    }
  );
  return stdout.trim().replace(/^"|"$/g, "");
}

/**
 * gwanbo.go.kr ezpdf 뷰어에서 PDF 텍스트 추출
 */
export async function openGazette(
  contentId: string,
  tocId: string,
  timeout: number
): Promise<void> {
  const url = `${EZPDF_BASE_URL}?contentId=${contentId}&tocId=${tocId}&isTocOrder=N&name=gazette`;
  await runBrowser(["open", url], timeout);
  await runBrowser(["wait", "--load", "networkidle"], timeout);
  await runBrowser(["wait", "3000"], timeout);
}

/**
 * 현재 열린 관보에서 특정 이름의 페이지를 찾고 텍스트 추출
 */
export async function extractPersonText(
  name: string,
  timeout: number
): Promise<{ pages: number[]; texts: string[] } | null> {
  const js = `
(async () => {
  const iframe = document.getElementById('viewerFrame');
  if (!iframe) return JSON.stringify({ error: 'no viewerFrame' });
  const app = iframe.contentWindow.PDFViewerApplication;
  if (!app || !app.pdfDocument) return JSON.stringify({ error: 'pdf not loaded' });

  const pdf = app.pdfDocument;
  const numPages = pdf.numPages;
  const name = ${JSON.stringify(name)};
  const foundPages = [];
  const texts = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const text = tc.items.map(item => item.str).join(' ');
    if (text.includes('성명 ' + name) || text.includes('성명  ' + name)) {
      foundPages.push(i);
      texts.push(text);
    }
  }

  return JSON.stringify({ pages: foundPages, texts });
})()
`;

  const result = await evalInBrowser(js, timeout);
  try {
    const parsed = JSON.parse(result);
    if (parsed.error) return null;
    if (parsed.pages.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * 특정 페이지의 텍스트만 추출
 */
export async function extractPageText(
  pageNumber: number,
  timeout: number
): Promise<string | null> {
  const js = `
(async () => {
  const iframe = document.getElementById('viewerFrame');
  if (!iframe) return JSON.stringify({ error: 'no viewerFrame' });
  const app = iframe.contentWindow.PDFViewerApplication;
  if (!app || !app.pdfDocument) return JSON.stringify({ error: 'pdf not loaded' });

  const page = await app.pdfDocument.getPage(${pageNumber});
  const tc = await page.getTextContent();
  const text = tc.items.map(item => item.str).join(' ');
  return JSON.stringify({ text });
})()
`;

  const result = await evalInBrowser(js, timeout);
  try {
    const parsed = JSON.parse(result);
    if (parsed.error) return null;
    return parsed.text;
  } catch {
    return null;
  }
}

/**
 * 브라우저 세션 종료
 */
export async function closeBrowser(): Promise<void> {
  try {
    await execFileAsync("agent-browser", ["close"], { timeout: 5000 });
  } catch {
    // 이미 닫혀있으면 무시
  }
}

/**
 * data.go.kr API 결과의 pdfFilePath에서 contentId, tocId 추출
 */
export function parsePdfFilePath(
  pdfFilePath: string
): { contentId: string; tocId: string } | null {
  const contentMatch = pdfFilePath.match(/contentId=([^&]+)/);
  const tocMatch = pdfFilePath.match(/tocId=([^&]+)/);
  if (!contentMatch || !tocMatch) return null;
  return {
    contentId: contentMatch[1],
    tocId: tocMatch[1],
  };
}
