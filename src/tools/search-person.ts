import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../types.js";
import { searchPerson } from "../services/documentcloud.js";
import { handleApiError } from "../utils/errors.js";

const InputSchema = {
  name: z
    .string()
    .min(2, "이름은 2자 이상이어야 합니다")
    .describe("검색할 공직자 이름 (예: '이재명', '오세훈')"),
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

export function registerSearchPerson(server: McpServer, config: Config): void {
  server.registerTool(
    "pety_search_person",
    {
      title: "공직자 이름 검색",
      description: `공직자 이름으로 재산공개 대상자를 검색합니다. DocumentCloud에 업로드된 관보 원본 전문 검색을 사용합니다.

동명이인이 여러 기관에 있을 수 있으며, 검색 결과에서 소속 기관과 직위를 확인하세요.
상세 재산 내역은 pety_get_asset_detail 도구에 document_id와 pages를 전달하여 조회합니다.

Args:
  - name (string): 공직자 이름 (최소 2자)
  - year (string, optional): 연도 (미지정 시 최신)
  - format ('markdown' | 'json'): 출력 형식

Returns:
  검색된 인물 목록 (이름, 소속, 직위, 관보 문서 ID, 페이지 번호)`,
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
        const results = await searchPerson(
          params.name,
          params.year,
          config.requestTimeout
        );

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `'${params.name}'에 해당하는 공직자를 찾을 수 없습니다. 연도를 변경하거나 정확한 이름을 입력해 주세요.`,
              },
            ],
          };
        }

        if (params.format === "json") {
          return {
            content: [
              { type: "text" as const, text: JSON.stringify(results, null, 2) },
            ],
          };
        }

        const lines: string[] = [
          `## 공직자 검색 결과: '${params.name}'`,
          "",
          `총 **${results.length}건** 검색됨`,
          "",
        ];

        for (const person of results) {
          lines.push(`### ${person.name} — ${person.organization} ${person.position}`);
          lines.push(`- **관보**: ${person.documentTitle}`);
          lines.push(`- **document_id**: \`${person.documentId}\``);
          lines.push(`- **pages**: \`[${person.pages.join(", ")}]\``);
          lines.push("");
        }

        lines.push(
          "> 상세 재산 내역은 `pety_get_asset_detail`에 document_id와 pages를 전달하세요."
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
