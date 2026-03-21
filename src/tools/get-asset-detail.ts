import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../types.js";
import {
  searchPerson,
  getPersonAssetText,
  parseAssetDetail,
  formatKrw,
} from "../services/documentcloud.js";
import { searchDataGoKr } from "../services/data-go-kr.js";
import {
  openGazette,
  extractPersonText,
  closeBrowser,
  parsePdfFilePath,
} from "../services/gwanbo-browser.js";
import { handleApiError } from "../utils/errors.js";
import { CHARACTER_LIMIT } from "../constants.js";

const InputSchema = {
  name: z
    .string()
    .min(2, "이름은 2자 이상이어야 합니다")
    .describe("공직자 이름 (예: '오세훈', '이재명')"),
  year: z
    .string()
    .regex(/^\d{4}$/, "YYYY 형식이어야 합니다")
    .optional()
    .describe("조회할 연도 (예: '2025'). 미지정 시 최신 연도"),
  source: z
    .enum(["auto", "documentcloud", "gwanbo"])
    .default("auto")
    .describe(
      "데이터 소스: 'auto' (DocumentCloud 우선, 실패 시 gwanbo), 'documentcloud', 'gwanbo' (관보 직접 조회, agent-browser 필요)"
    ),
  document_id: z
    .number()
    .int()
    .optional()
    .describe("DocumentCloud 문서 ID (직접 지정 시 빠름)"),
  pages: z
    .array(z.number().int())
    .optional()
    .describe("페이지 번호 배열 (직접 지정 시 빠름)"),
  format: z
    .enum(["markdown", "json"])
    .default("markdown")
    .describe("출력 형식: 'markdown' 또는 'json'"),
};

/**
 * DocumentCloud에서 텍스트 추출 시도
 */
async function tryDocumentCloud(
  name: string,
  year: string | undefined,
  documentId: number | undefined,
  pages: number[] | undefined,
  timeout: number
): Promise<{ texts: string[]; source: string; docTitle: string } | null> {
  try {
    let docId = documentId;
    let slug = "";
    let pgs = pages;
    let title = "";

    if (!docId || !pgs || pgs.length === 0) {
      const results = await searchPerson(name, year, timeout);
      if (results.length === 0) return null;
      const target = results[0];
      docId = target.documentId;
      slug = target.documentSlug;
      pgs = target.pages;
      title = target.documentTitle;
    }

    if (!slug) {
      const axios = (await import("axios")).default;
      const docInfo = await axios.get(
        `https://api.www.documentcloud.org/api/documents/${docId}/`,
        { timeout }
      );
      slug = docInfo.data.slug;
      title = docInfo.data.title;
    }

    const texts = await getPersonAssetText(docId!, slug, pgs!, timeout);
    if (texts.length === 0) return null;

    const sourceUrl = `https://www.documentcloud.org/documents/${docId}-${slug}#document/p${pgs![0]}`;
    return { texts, source: sourceUrl, docTitle: title };
  } catch {
    return null;
  }
}

/**
 * gwanbo.go.kr ezpdf + agent-browser로 텍스트 추출
 */
async function tryGwanbo(
  name: string,
  year: string | undefined,
  serviceKey: string | null,
  timeout: number
): Promise<{ texts: string[]; source: string; docTitle: string } | null> {
  try {
    if (!serviceKey) return null;

    // data.go.kr에서 관보 목록 검색
    const yearStr = year ?? new Date().getFullYear().toString();
    const result = await searchDataGoKr(
      serviceKey,
      {
        reqFrom: `${yearStr}0101`,
        reqTo: `${yearStr}1231`,
        pageNo: 1,
        pageSize: 20,
        search: "재산",
      },
      timeout
    );

    if (result.items.length === 0) return null;

    // pdfFilePath에서 contentId/tocId 추출하여 각 관보를 순회
    for (const item of result.items) {
      const ids = parsePdfFilePath(item.pdfUrl);
      if (!ids) continue;

      try {
        // ezpdf 뷰어 열기
        await openGazette(ids.contentId, ids.tocId, timeout);

        // 해당 관보에서 인물 검색
        const personData = await extractPersonText(name, 120000);
        if (personData && personData.texts.length > 0) {
          await closeBrowser();
          return {
            texts: personData.texts,
            source: `https://gwanbo.go.kr/ezpdf/customLayout.jsp?contentId=${ids.contentId}&tocId=${ids.tocId}`,
            docTitle: item.title,
          };
        }

        await closeBrowser();
      } catch {
        await closeBrowser();
      }
    }

    return null;
  } catch {
    await closeBrowser();
    return null;
  }
}

function formatResult(
  detail: ReturnType<typeof parseAssetDetail>,
  source: string,
  docTitle: string,
  year: string | undefined,
  format: string
): { content: { type: "text"; text: string }[] } {
  if (format === "json") {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              name: detail.name,
              organization: detail.organization,
              position: detail.position,
              year: year ?? new Date().getFullYear().toString(),
              document: docTitle,
              sections: detail.sections,
              source,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const lines: string[] = [
    `## ${detail.name} (${detail.organization} ${detail.position}) — 재산 상세`,
    "",
    `> 출처: [관보 원본](${source})`,
    "",
  ];

  for (const section of detail.sections) {
    const currentKrwStr = formatKrw(section.currentTotal);
    const change = section.currentTotal - section.previousTotal;
    const changeStr = formatKrw(change);
    const changeSign = change >= 0 ? "+" : "";

    lines.push(
      `### ${section.category} — ${currentKrwStr} (${changeSign}${changeStr})`
    );
    lines.push("");
    for (const d of section.details) {
      lines.push(`- ${d}`);
    }
    lines.push("");
  }

  let text = lines.join("\n");
  if (text.length > CHARACTER_LIMIT) {
    text =
      text.slice(0, CHARACTER_LIMIT) +
      "\n\n... (결과가 잘렸습니다. 전체 내용은 관보 원본 링크를 참고하세요.)";
  }

  return { content: [{ type: "text" as const, text }] };
}

export function registerGetAssetDetail(
  server: McpServer,
  config: Config
): void {
  server.registerTool(
    "pety_get_asset_detail",
    {
      title: "공직자 재산 상세 조회",
      description: `공직자의 재산 상세 내역을 관보 원본에서 추출합니다.
개별 부동산 주소, 주식 종목명/수량, 예금 금융기관별 잔액, 채무 내역, 가상자산 등
기사에서 볼 수 있는 수준의 상세 정보를 제공합니다.

데이터 소스:
- auto (기본): DocumentCloud 우선, 실패 시 gwanbo.go.kr 직접 조회
- documentcloud: DocumentCloud API만 사용
- gwanbo: 관보 사이트에서 직접 추출 (agent-browser 필요, 최신 데이터)

Args:
  - name (string): 공직자 이름
  - year (string, optional): 연도 (미지정 시 최신)
  - source ('auto' | 'documentcloud' | 'gwanbo'): 데이터 소스
  - document_id (number, optional): DocumentCloud 문서 ID
  - pages (number[], optional): 페이지 번호 배열
  - format ('markdown' | 'json'): 출력 형식

Returns:
  관보 원본 기반 재산 상세 (토지/건물 주소, 주식 종목별 수량, 예금 기관별 잔액 등)`,
      inputSchema: InputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        let data: { texts: string[]; source: string; docTitle: string } | null =
          null;

        if (params.source === "documentcloud" || params.source === "auto") {
          data = await tryDocumentCloud(
            params.name,
            params.year,
            params.document_id,
            params.pages,
            config.requestTimeout
          );
        }

        if (!data && (params.source === "gwanbo" || params.source === "auto")) {
          data = await tryGwanbo(
            params.name,
            params.year,
            config.dataGoKrServiceKey,
            config.requestTimeout
          );
        }

        if (!data) {
          return {
            content: [
              {
                type: "text" as const,
                text: `'${params.name}'의 재산공개 데이터를 찾을 수 없습니다. 연도를 변경하거나 source를 'gwanbo'로 지정해 보세요.`,
              },
            ],
          };
        }

        const detail = parseAssetDetail(data.texts);
        return formatResult(
          detail,
          data.source,
          data.docTitle,
          params.year,
          params.format
        );
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: handleApiError(error) }],
        };
      }
    }
  );
}
