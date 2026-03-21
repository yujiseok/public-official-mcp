import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../types.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";
import { searchDataGoKr } from "../services/data-go-kr.js";
import { searchGazetteDocuments } from "../services/documentcloud.js";
import { handleApiError } from "../utils/errors.js";
import { formatAsMarkdown } from "../utils/formatters.js";

const InputSchema = {
  query: z
    .string()
    .optional()
    .describe("검색 키워드 (예: '재산공개', '재산변동'). 기본값: '재산공개'"),
  year: z
    .string()
    .regex(/^\d{4}$/, "YYYY 형식이어야 합니다 (예: 2025)")
    .optional()
    .describe("연도 필터 (예: '2025')"),
  organization: z
    .string()
    .optional()
    .describe("발행기관 필터 (예: '인사혁신처', '중앙선거관리위원회')"),
  page_no: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe("페이지 번호 (기본값: 1)"),
  page_size: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
    .describe(`페이지당 결과 수 (기본값: ${DEFAULT_PAGE_SIZE}, 최대: ${MAX_PAGE_SIZE})`),
  format: z
    .enum(["markdown", "json"])
    .default("markdown")
    .describe("출력 형식: 'markdown' 또는 'json'"),
};

export function registerSearchAssets(server: McpServer, config: Config): void {
  server.registerTool(
    "pety_search_assets",
    {
      title: "재산공개 관보 검색",
      description: `공직자 재산공개 관보 공고를 검색합니다. 공공데이터포털(data.go.kr) API를 사용합니다.
개인별 재산 조회는 pety_search_person 또는 pety_get_asset_detail을 사용하세요.

Args:
  - query (string, optional): 검색 키워드 (기본값: '재산공개')
  - year (string, optional): 연도 필터 (YYYY)
  - organization (string, optional): 발행기관 필터
  - page_no (number): 페이지 번호 (기본값: 1)
  - page_size (number): 페이지당 결과 수 (기본값: 10, 최대: 100)
  - format ('markdown' | 'json'): 출력 형식

Returns:
  관보 공고 목록 (제목, 발행기관, 발행일자, 근거법령) + 페이지네이션 정보`,
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
        if (config.dataGoKrServiceKey) {
          const now = new Date();
          const threeYearsAgo = new Date(now);
          threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
          const reqFrom = params.year
            ? `${params.year}0101`
            : threeYearsAgo.toISOString().slice(0, 10).replace(/-/g, "");
          const reqTo = params.year
            ? `${params.year}1231`
            : now.toISOString().slice(0, 10).replace(/-/g, "");

          const result = await searchDataGoKr(
            config.dataGoKrServiceKey,
            {
              reqFrom,
              reqTo,
              pageNo: params.page_no,
              pageSize: params.page_size,
              search: params.query || "재산공개",
              pblcnSearch: params.organization,
            },
            config.requestTimeout
          );

          const text =
            params.format === "json"
              ? JSON.stringify(result, null, 2)
              : formatAsMarkdown(result);

          return { content: [{ type: "text" as const, text }] };
        }

        // data.go.kr 키 없으면 DocumentCloud에서 관보 문서 목록 검색
        const query = `${params.query || "재산공개"} ${params.year || ""}`.trim();
        const docs = await searchGazetteDocuments(
          query,
          config.requestTimeout,
          params.page_size
        );

        if (docs.length === 0) {
          return {
            content: [
              { type: "text" as const, text: "검색 결과가 없습니다." },
            ],
          };
        }

        if (params.format === "json") {
          return {
            content: [
              { type: "text" as const, text: JSON.stringify(docs, null, 2) },
            ],
          };
        }

        const lines = [
          "## 관보 문서 검색 결과 (DocumentCloud)",
          "",
          `총 **${docs.length}건**`,
          "",
          "| 문서 ID | 제목 | 페이지 수 |",
          "|---------|------|----------|",
        ];
        for (const doc of docs) {
          lines.push(`| ${doc.id} | ${doc.title} | ${doc.pageCount} |`);
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: handleApiError(error) }],
        };
      }
    }
  );
}
