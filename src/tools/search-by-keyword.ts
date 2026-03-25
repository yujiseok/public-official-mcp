import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../types.js";
import { searchByKeyword } from "../services/documentcloud.js";
import { handleApiError } from "../utils/errors.js";

const InputSchema = {
  keyword: z
    .string()
    .min(2, "키워드는 2자 이상이어야 합니다")
    .describe(
      "검색할 키워드 — 주식 종목명, 부동산 지역, 금융기관 등 (예: '엔비디아', '테슬라', '비트코인', '강남구')"
    ),
  year: z
    .string()
    .regex(/^\d{4}$/, "YYYY 형식이어야 합니다")
    .optional()
    .describe("검색할 연도 (예: '2025'). 미지정 시 최신 연도"),
  format: z
    .enum(["markdown", "json"])
    .default("markdown")
    .describe("출력 형식: 'markdown' 또는 'json'"),
};

export function registerSearchByKeyword(
  server: McpServer,
  config: Config
): void {
  server.registerTool(
    "pety_search_by_keyword",
    {
      title: "재산 키워드 검색",
      description: `관보 원본에서 키워드(주식 종목명, 부동산 지역, 금융기관, 가상자산 등)를 전문 검색하여 해당 재산을 보유한 공직자를 찾습니다.

예시 질문:
  - "엔비디아를 가진 공직자는?"
  - "테슬라 주식 보유 공직자"
  - "비트코인 보유 공직자"
  - "강남구 부동산 보유 공직자"

Args:
  - keyword (string): 검색 키워드 (최소 2자)
  - year (string, optional): 연도 (미지정 시 최신)
  - format ('markdown' | 'json'): 출력 형식

Returns:
  키워드가 포함된 재산을 보유한 공직자 목록 (이름, 소속, 직위, 관보 페이지)`,
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
        const results = await searchByKeyword(
          params.keyword,
          params.year,
          config.requestTimeout
        );

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `'${params.keyword}'이(가) 포함된 재산 내역을 찾을 수 없습니다. 키워드나 연도를 변경해 보세요.`,
              },
            ],
          };
        }

        if (params.format === "json") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }

        const lines: string[] = [
          `## '${params.keyword}' 보유 공직자 검색 결과`,
          "",
          `총 **${results.length}명** 발견`,
          "",
        ];

        for (const r of results) {
          lines.push(
            `### ${r.name} — ${r.organization} ${r.position}`
          );
          lines.push(`- **관보**: ${r.documentTitle} (p.${r.page})`);
          if (r.highlight) {
            lines.push(`- **내용**: ${r.highlight}`);
          }
          lines.push("");
        }

        lines.push(
          "> 상세 재산 내역은 `pety_search_person`으로 이름 검색 후 `pety_get_asset_detail`로 조회하세요."
        );

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: handleApiError(error) }],
        };
      }
    }
  );
}
