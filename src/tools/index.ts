import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../types.js";
import { registerSearchPerson } from "./search-person.js";
import { registerGetAssetDetail } from "./get-asset-detail.js";
import { registerSearchAssets } from "./search-assets.js";

export function registerTools(server: McpServer, config: Config): void {
  registerSearchPerson(server, config);
  registerGetAssetDetail(server, config);
  registerSearchAssets(server, config);
}
