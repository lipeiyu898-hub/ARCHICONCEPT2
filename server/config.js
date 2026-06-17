import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 5173),
  nodeEnv: process.env.NODE_ENV || "development",
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || "",
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  deepseekModel: process.env.DEEPSEEK_MODEL || "deepseek-chat",
  amapWebServiceKey: process.env.AMAP_WEB_SERVICE_KEY || "",
  amapRestBaseUrl: process.env.AMAP_REST_BASE_URL || "https://restapi.amap.com",
  amapJsKey: process.env.VITE_AMAP_JS_KEY || process.env.AMAP_JS_KEY || "",
  amapSecurityJsCode: process.env.VITE_AMAP_SECURITY_JS_CODE || process.env.AMAP_SECURITY_JS_CODE || "",
  tavilyApiKey: process.env.TAVILY_API_KEY || "",
  serpApiKey: process.env.SERPAPI_API_KEY || ""
};

export function mask(value) {
  if (!value) return "";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
