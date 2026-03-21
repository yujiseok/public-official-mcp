import axios from "axios";

export function handleApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      const status = error.response.status;
      switch (status) {
        case 401:
        case 403:
          return "Error: 인증 실패. DATA_GO_KR_SERVICE_KEY가 올바른지 확인해 주세요.";
        case 404:
          return "Error: 요청한 리소스를 찾을 수 없습니다.";
        case 429:
          return "Error: 요청 한도 초과. 잠시 후 다시 시도해 주세요.";
        case 500:
        case 502:
        case 503:
          return `Error: 서버 오류 (${status}). 잠시 후 다시 시도해 주세요.`;
        default:
          return `Error: API 요청 실패 (HTTP ${status}).`;
      }
    }
    if (error.code === "ECONNABORTED") {
      return "Error: 요청 시간 초과. 잠시 후 다시 시도해 주세요.";
    }
    if (error.code === "ECONNREFUSED") {
      return "Error: API 서버에 연결할 수 없습니다.";
    }
  }
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}
