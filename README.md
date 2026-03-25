# public-official-mcp-server

한국 공직자 재산공개 데이터를 조회하는 MCP (Model Context Protocol) 서버입니다.

공직자 이름만 입력하면 관보 원본에서 부동산 주소, 주식 종목/수량, 예금 기관별 잔액, 가상자산 내역까지 추출합니다.

## 기능

| 도구 | 설명 |
|------|------|
| `pety_search_person` | 이름으로 공직자 검색 |
| `pety_get_asset_detail` | 종목별 재산 상세 조회 (주식, 부동산, 예금, 가상자산) |
| `pety_search_assets` | 재산공개 관보 공고 검색 |
| `pety_search_by_keyword` | 키워드로 재산 보유 공직자 검색 (종목명, 지역, 금융기관 등) |

## 사용 예시

```
"오세훈 자산 알려줘"
→ MicroStrategy 371주, 엔비디아 1,100주, 아이온큐 2,500주...

"이재명 재산"
→ 분당구 수내동 아파트 7.28억, 예금 15.8억, 채권 7억...

"이준석 가상자산"
→ 비트코인, 루나 등 40종 전량 매각

"엔비디아 보유한 공직자는?"
→ 오세훈(서울시장) 1,100주, ...
```

## 설치

MCP 클라이언트(Claude Desktop, Claude Code 등)에 등록하여 사용합니다. 별도 설치 없이 `npx`로 실행됩니다.

### Claude Desktop

`claude_desktop_config.json`에 추가:

```json
{
  "mcpServers": {
    "public-official-mcp-server": {
      "command": "npx",
      "args": ["-y", "public-official-mcp-server"],
      "env": {
        "DATA_GO_KR_SERVICE_KEY": "<your-key>"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add public-official-mcp-server -- npx -y public-official-mcp-server
```

### 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `DATA_GO_KR_SERVICE_KEY` | 선택 | [공공데이터포털](https://www.data.go.kr/data/15109164/openapi.do) 서비스 키. 관보 공고 검색에 사용. 없어도 인물 검색은 동작 |

## 데이터 소스

| 소스 | 용도 | 인증 |
|------|------|------|
| [DocumentCloud](https://www.documentcloud.org/) | 인물 검색 + 관보 텍스트 추출 | 불필요 |
| [공공데이터포털](https://www.data.go.kr/) | 관보 공고 목록 검색 | 서비스 키 |
| [전자관보](https://gwanbo.go.kr/) ezpdf | 최신 관보 직접 조회 (폴백) | 불필요 (agent-browser 필요) |

## 개발

```bash
git clone https://github.com/yujiseok/public-official-mcp.git
cd public-official-mcp
bun install
bun run dev
```

## 라이선스

MIT
