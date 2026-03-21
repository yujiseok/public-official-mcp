import type { AssetPublication, PaginatedResult } from "../types.js";
import { CHARACTER_LIMIT } from "../constants.js";

export function formatAsMarkdown(result: PaginatedResult<AssetPublication>): string {
  const { items, pagination, source } = result;

  if (items.length === 0) {
    return "검색 결과가 없습니다.";
  }

  const lines: string[] = [
    "## 공직자 재산공개 검색 결과",
    "",
    `총 **${pagination.totalCount}건** | 페이지 ${pagination.currentPage}/${pagination.totalPages} | 출처: ${source}`,
    "",
    "| 번호 | 제목 | 발행기관 | 발행일자 | 근거법령 |",
    "|------|------|---------|---------|---------|",
  ];

  for (const item of items) {
    lines.push(
      `| ${item.gazetteNumber} | ${item.title} | ${item.publishingOrganization} | ${item.publicationDate} | ${item.legalBasis} |`
    );
  }

  if (pagination.hasNextPage) {
    lines.push("", `> 다음 페이지: page_no=${pagination.currentPage + 1}`);
  }

  let output = lines.join("\n");
  if (output.length > CHARACTER_LIMIT) {
    output =
      output.slice(0, CHARACTER_LIMIT) +
      "\n\n... (결과가 잘렸습니다. page_size를 줄이거나 검색 조건을 좁혀 주세요.)";
  }

  return output;
}

