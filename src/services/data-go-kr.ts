import axios from "axios";
import { DATA_GO_KR_BASE_URL } from "../constants.js";
import type { AssetPublication, PaginatedResult, PetyItem } from "../types.js";

interface DataGoKrParams {
  reqFrom: string;
  reqTo: string;
  pageNo: number;
  pageSize: number;
  search?: string;
  pblcnSearch?: string;
  lawNmSearch?: string;
}

interface DataGoKrJsonResponse {
  response: {
    resultCode: string;
    resultMsg: string;
    totalCount: string;
    pageSize: string;
    pageNo: string;
    items?: {
      item: PetyItem | PetyItem[];
    };
  };
}

function normalizePetyItem(item: PetyItem): AssetPublication {
  return {
    gazetteNumber: item.cntntSeqNo ?? "",
    title: item.cntntSj ?? "",
    gazetteClassification: item.ofcttBookNm ?? "",
    publicationDate: item.hopePblictDt ?? "",
    editorialClassification: item.cmplatSeNm ?? "",
    publishingOrganization: item.pblcnInstNm ?? "",
    legalBasis: item.basisLawNm ?? "",
    isCorrected: item.crtnYn === "Y" || item.crtnYn === "예",
    correctionDetails: item.rvsnRsnMainCn || null,
    pdfUrl: item.pdfFilePath
      ? `https://gwanbo.go.kr${item.pdfFilePath}`
      : "",
  };
}

export async function searchDataGoKr(
  serviceKey: string,
  params: DataGoKrParams,
  timeout: number
): Promise<PaginatedResult<AssetPublication>> {
  const queryParams: Record<string, string | number> = {
    serviceKey,
    pageNo: params.pageNo,
    pageSize: params.pageSize,
    reqFrom: params.reqFrom,
    reqTo: params.reqTo,
    type: 1,
  };
  if (params.search) queryParams.search = params.search;
  if (params.pblcnSearch) queryParams.pblcnSearch = params.pblcnSearch;
  if (params.lawNmSearch) queryParams.lawNmSearch = params.lawNmSearch;

  const response = await axios.get<DataGoKrJsonResponse>(DATA_GO_KR_BASE_URL, {
    params: queryParams,
    timeout,
  });

  const body = response.data.response;

  if (body.resultCode !== "0") {
    throw new Error(`data.go.kr API 오류: ${body.resultMsg}`);
  }

  const totalCount = Number(body.totalCount) || 0;
  const pageNo = Number(body.pageNo) || params.pageNo;
  const pageSize = Number(body.pageSize) || params.pageSize;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  let rawItems: PetyItem[] = [];
  if (body.items?.item) {
    rawItems = Array.isArray(body.items.item)
      ? body.items.item
      : [body.items.item];
  }

  return {
    items: rawItems.map(normalizePetyItem),
    pagination: {
      currentPage: pageNo,
      pageSize,
      totalCount,
      totalPages,
      hasNextPage: pageNo < totalPages,
    },
    source: "data-go-kr",
  };
}
