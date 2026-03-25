import { REQUEST_TIMEOUT_MS } from "../constants.js";
import type { Config } from "../types.js";

// bun은 .env 파일을 자동으로 로드합니다
export function loadConfig(): Config {
  const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY ?? null;

  return {
    dataGoKrServiceKey: serviceKey,
    requestTimeout: Number(process.env.REQUEST_TIMEOUT_MS) || REQUEST_TIMEOUT_MS,
  };
}
