import axios from "axios";
import * as cache from "./cache.js";

const DC_API_BASE = "https://api.www.documentcloud.org/api/documents";
const DC_TEXT_BASE = "https://s3.documentcloud.org/documents";
const NEWSTAPA_ORG_ID = 1063;

export { parseAssetDetail, formatKrw } from "./parser.js";
export type { AssetSection, ParsedAssetDetail } from "./parser.js";

export interface DocumentSearchResult {
  id: number;
  slug: string;
  title: string;
  pageCount: number;
  createdAt: string;
}

export interface PersonSearchResult {
  name: string;
  organization: string;
  position: string;
  documentId: number;
  documentSlug: string;
  documentTitle: string;
  pages: number[];
}

/**
 * 뉴스타파가 업로드한 관보 문서 목록 검색
 */
export async function searchGazetteDocuments(
  query: string,
  timeout: number,
  perPage = 10
): Promise<DocumentSearchResult[]> {
  const response = await axios.get(`${DC_API_BASE}/search/`, {
    params: {
      q: `organization:${NEWSTAPA_ORG_ID} ${query}`,
      per_page: perPage,
    },
    timeout,
  });

  return (response.data.results ?? []).map(
    (doc: Record<string, unknown>) => ({
      id: doc.id as number,
      slug: doc.slug as string,
      title: doc.title as string,
      pageCount: doc.page_count as number,
      createdAt: doc.created_at as string,
    })
  );
}

/**
 * 특정 관보 문서 내에서 인물 검색 (페이지 번호 반환)
 */
export async function searchPersonInDocument(
  documentId: number,
  name: string,
  timeout: number
): Promise<{ pages: Record<string, string[]> }> {
  const response = await axios.get(`${DC_API_BASE}/${documentId}/search/`, {
    params: { q: name },
    timeout,
  });
  return { pages: response.data ?? {} };
}

/**
 * 이름으로 공직자 검색 — 캐시 + "성명 {이름}" 전문 검색
 */
export async function searchPerson(
  name: string,
  year: string | undefined,
  timeout: number
): Promise<PersonSearchResult[]> {
  const yearQuery = year ?? new Date().getFullYear().toString();
  const cacheKey = `person:${name}:${yearQuery}`;
  const cached = cache.get<PersonSearchResult[]>(cacheKey);
  if (cached) return cached;

  // "성명 오세훈"으로 전문 검색
  const response = await axios.get(`${DC_API_BASE}/search/`, {
    params: {
      q: `organization:${NEWSTAPA_ORG_ID} "성명 ${name}"`,
      per_page: 25,
    },
    timeout,
  });

  const docs: DocumentSearchResult[] = (response.data.results ?? []).map(
    (doc: Record<string, unknown>) => ({
      id: doc.id as number,
      slug: doc.slug as string,
      title: doc.title as string,
      pageCount: doc.page_count as number,
      createdAt: doc.created_at as string,
    })
  );

  if (docs.length === 0) return [];

  // 연도 필터링
  const yearDocs = docs.filter((d) => d.title.includes(yearQuery));
  const targetDocs = (yearDocs.length > 0 ? yearDocs : docs).slice(0, 3);

  // 각 문서에서 페이지 번호 확인 (병렬, 최대 3개)
  const results: PersonSearchResult[] = [];
  const searchPromises = targetDocs.map(async (doc) => {
    try {
      const search = await searchPersonInDocument(doc.id, name, timeout);
      const pageKeys = Object.keys(search.pages).filter((k) =>
        k.startsWith("page_no_")
      );
      if (pageKeys.length === 0) return;

      const firstPageText =
        (search.pages[pageKeys[0]] as string[])?.[0] ?? "";
      const headerMatch = firstPageText.match(
        /소속\s+(.+?)\s+직위\s+(.+?)\s+성명\s+/
      );

      results.push({
        name,
        organization:
          headerMatch?.[1]?.trim() ??
          doc.title.replace(/\(.*\)/, "").trim(),
        position: headerMatch?.[2]?.trim() ?? "",
        documentId: doc.id,
        documentSlug: doc.slug,
        documentTitle: doc.title,
        pages: pageKeys.map((k) =>
          parseInt(k.replace("page_no_", ""), 10)
        ),
      });
    } catch {
      // 개별 문서 검색 실패는 무시
    }
  });

  await Promise.all(searchPromises);
  cache.set(cacheKey, results);
  return results;
}

export interface AssetKeywordResult {
  keyword: string;
  name: string;
  organization: string;
  position: string;
  documentId: number;
  documentTitle: string;
  page: number;
  highlight: string;
}

/**
 * 키워드(종목명 등)로 관보 전문 검색 → 해당 페이지의 인물 정보 역추출
 */
export async function searchByKeyword(
  keyword: string,
  year: string | undefined,
  timeout: number
): Promise<AssetKeywordResult[]> {
  const yearQuery = year ?? new Date().getFullYear().toString();
  const cacheKey = `keyword:${keyword}:${yearQuery}`;
  const cached = cache.get<AssetKeywordResult[]>(cacheKey);
  if (cached) return cached;

  // 1) 연도에 해당하는 관보 문서 검색
  const docsResponse = await axios.get(`${DC_API_BASE}/search/`, {
    params: {
      q: `organization:${NEWSTAPA_ORG_ID} ${yearQuery}`,
      per_page: 25,
    },
    timeout,
  });

  const docs: DocumentSearchResult[] = (docsResponse.data.results ?? []).map(
    (doc: Record<string, unknown>) => ({
      id: doc.id as number,
      slug: doc.slug as string,
      title: doc.title as string,
      pageCount: doc.page_count as number,
      createdAt: doc.created_at as string,
    })
  );

  const yearDocs = docs.filter((d) => d.title.includes(yearQuery));
  if (yearDocs.length === 0) return [];

  // 2) 각 문서에서 키워드 검색 (병렬)
  const results: AssetKeywordResult[] = [];
  const searchPromises = yearDocs.map(async (doc) => {
    try {
      const response = await axios.get(
        `${DC_API_BASE}/${doc.id}/search/`,
        { params: { q: keyword }, timeout }
      );
      const pages = response.data ?? {};
      const pageKeys = Object.keys(pages).filter((k) =>
        k.startsWith("page_no_")
      );
      if (pageKeys.length === 0) return;

      // 3) 각 페이지에서 인물 정보 추출
      for (const pageKey of pageKeys) {
        const pageNum = parseInt(pageKey.replace("page_no_", ""), 10);
        const highlights: string[] = pages[pageKey] ?? [];
        const highlightText = highlights
          .filter((h: string) => h.toLowerCase().includes(keyword.toLowerCase()))
          .join(" | ")
          .slice(0, 200);

        try {
          const pageText = await getPageText(doc.id, doc.slug, pageNum, timeout);

          // 해당 페이지에서 "소속 X 직위 Y 성명 Z" 헤더 찾기
          const headerMatches = [
            ...pageText.matchAll(
              /소속\s+(.+?)\s+직위\s+(.+?)\s+성명\s+(.+)/g
            ),
          ];

          if (headerMatches.length > 0) {
            for (const m of headerMatches) {
              results.push({
                keyword,
                name: m[3].trim(),
                organization: m[1].trim(),
                position: m[2].trim(),
                documentId: doc.id,
                documentTitle: doc.title,
                page: pageNum,
                highlight: highlightText || highlights[0]?.slice(0, 200) || "",
              });
            }
          } else {
            // 이전 페이지에서 헤더 찾기
            if (pageNum > 1) {
              const prevText = await getPageText(
                doc.id, doc.slug, pageNum - 1, timeout
              );
              const prevHeaders = [
                ...prevText.matchAll(
                  /소속\s+(.+?)\s+직위\s+(.+?)\s+성명\s+(.+)/g
                ),
              ];
              const lastHeader = prevHeaders[prevHeaders.length - 1];
              if (lastHeader) {
                results.push({
                  keyword,
                  name: lastHeader[3].trim(),
                  organization: lastHeader[1].trim(),
                  position: lastHeader[2].trim(),
                  documentId: doc.id,
                  documentTitle: doc.title,
                  page: pageNum,
                  highlight:
                    highlightText || highlights[0]?.slice(0, 200) || "",
                });
              }
            }
          }
        } catch {
          // 페이지 텍스트 추출 실패 무시
        }
      }
    } catch {
      // 개별 문서 검색 실패 무시
    }
  });

  await Promise.all(searchPromises);

  // 중복 제거 (같은 이름+소속)
  const seen = new Set<string>();
  const unique = results.filter((r) => {
    const key = `${r.name}:${r.organization}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  cache.set(cacheKey, unique);
  return unique;
}

/**
 * DocumentCloud 문서의 특정 페이지 텍스트 추출 (캐시 포함)
 */
export async function getPageText(
  documentId: number,
  slug: string,
  pageNumber: number,
  timeout: number
): Promise<string> {
  const cacheKey = `page:${documentId}:${pageNumber}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const url = `${DC_TEXT_BASE}/${documentId}/pages/${slug}-p${pageNumber}.txt`;
  const response = await axios.get(url, { timeout, responseType: "text" });
  cache.set(cacheKey, response.data);
  return response.data;
}

/**
 * 특정 인물의 재산 상세 텍스트 추출 (병렬 패칭)
 */
export async function getPersonAssetText(
  documentId: number,
  slug: string,
  pages: number[],
  timeout: number
): Promise<string[]> {
  const startPage = Math.min(...pages);
  const pageNumbers = Array.from({ length: 5 }, (_, i) => startPage + i);

  // 5페이지 동시 요청
  const results = await Promise.allSettled(
    pageNumbers.map((p) => getPageText(documentId, slug, p, timeout))
  );

  // 순서대로 조합, 총계 이후 자르기
  const texts: string[] = [];
  for (const result of results) {
    if (result.status === "rejected") break;
    texts.push(result.value);
    if (result.value.includes("총계") || result.value.includes("총 계")) break;
  }
  return texts;
}
