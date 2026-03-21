/** data.go.kr API 응답의 개별 항목 */
export interface PetyItem {
  cntntSeqNo: string;
  cntntSj: string;
  ofcttBookNm: string;
  hopePblictDt: string;
  cmplatSeNm: string;
  themaSe: string;
  pblcnInstNm: string;
  basisLawNm: string;
  crtnYn: string;
  rvsnRsnMainCn: string;
  pdfFilePath: string;
}

/** 정규화된 재산공개 관보 항목 */
export interface AssetPublication {
  gazetteNumber: string;
  title: string;
  gazetteClassification: string;
  publicationDate: string;
  editorialClassification: string;
  publishingOrganization: string;
  legalBasis: string;
  isCorrected: boolean;
  correctionDetails: string | null;
  pdfUrl: string;
}

/** 페이지네이션 메타데이터 */
export interface PaginationMeta {
  currentPage: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
}

/** 페이지네이션이 포함된 결과 */
export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
  source: "data-go-kr" | "gwanbo";
}

/** 서버 설정 */
export interface Config {
  dataGoKrServiceKey: string | null;
  requestTimeout: number;
}
