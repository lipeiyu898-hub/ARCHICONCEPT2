import { config } from "./config.js";

const categoryMap = {
  traffic: { label: "交通与可达性", keywords: "地铁站|公交站|停车场|火车站", types: "150000" },
  public: { label: "公共服务", keywords: "学校|医院|政务服务|图书馆|文化馆", types: "120000|130000|140000" },
  eco: { label: "开放空间与生态资源", keywords: "公园|广场|绿地|风景区", types: "110000" },
  commercial: { label: "商业与生活服务", keywords: "商场|餐饮|超市|便利店", types: "050000|060000|070000" },
  sensitive: { label: "敏感对象", keywords: "学校|幼儿园|医院|养老院", types: "120000|140000" },
  disturbance: { label: "潜在干扰", keywords: "加油站|工厂|物流园|变电站", types: "010000|170000" }
};

function requireAmapKey() {
  if (!config.amapWebServiceKey) {
    const err = new Error("KEY_MISSING");
    err.status = 503;
    throw err;
  }
}

function normalizeLocation(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const [lng, lat] = value.split(",").map(Number);
    return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
  }
  const lng = Number(value.lng ?? value.longitude);
  const lat = Number(value.lat ?? value.latitude);
  return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
}

export async function amapSuggest(req, res) {
  try {
    requireAmapKey();
    const keywords = String(req.query.keywords || "").trim();
    if (!keywords) return res.json({ ok: true, tips: [] });
    const url = new URL("https://restapi.amap.com/v3/assistant/inputtips");
    url.searchParams.set("key", config.amapWebServiceKey);
    url.searchParams.set("keywords", keywords);
    url.searchParams.set("datatype", "all");
    if (req.query.city) url.searchParams.set("city", String(req.query.city));

    const data = await fetch(url).then((r) => r.json());
    if (data.status !== "1") throw new Error(data.info || "AMAP_SUGGEST_FAILED");

    const tips = (data.tips || [])
      .filter((tip) => tip && tip.name)
      .map((tip) => ({
        id: tip.id || `${tip.name}-${tip.location || ""}`,
        name: tip.name,
        address: Array.isArray(tip.address) ? tip.address.join("") : tip.address || "",
        district: tip.district || "",
        city: tip.city || "",
        type: tip.typecode || tip.type || "",
        location: normalizeLocation(tip.location)
      }));
    res.json({ ok: true, tips });
  } catch (error) {
    res.status(error.status || 502).json({
      ok: false,
      error: error.message === "KEY_MISSING" ? "KEY_MISSING" : "AMAP_SUGGEST_FAILED",
      message: error.message === "KEY_MISSING" ? "地点搜索服务尚未配置，请检查 AMAP_WEB_SERVICE_KEY。" : error.message
    });
  }
}

export async function amapGeocode(req, res) {
  try {
    requireAmapKey();
    const address = String(req.query.address || "").trim();
    if (!address) return res.status(400).json({ ok: false, error: "ADDRESS_REQUIRED" });
    const url = new URL("https://restapi.amap.com/v3/geocode/geo");
    url.searchParams.set("key", config.amapWebServiceKey);
    url.searchParams.set("address", address);
    if (req.query.city) url.searchParams.set("city", String(req.query.city));

    const data = await fetch(url).then((r) => r.json());
    if (data.status !== "1") throw new Error(data.info || "AMAP_GEOCODE_FAILED");
    const geo = data.geocodes?.[0];
    res.json({
      ok: Boolean(geo),
      location: normalizeLocation(geo?.location),
      formattedAddress: geo?.formatted_address || "",
      raw: geo || null
    });
  } catch (error) {
    res.status(error.status || 502).json({
      ok: false,
      error: error.message === "KEY_MISSING" ? "KEY_MISSING" : "AMAP_GEOCODE_FAILED",
      message: error.message === "KEY_MISSING" ? "地理编码服务尚未配置，请检查 AMAP_WEB_SERVICE_KEY。" : error.message
    });
  }
}

export async function amapAnalyzeContext(req, res) {
  try {
    requireAmapKey();
    const center = normalizeLocation(req.body.center);
    if (!center) return res.status(400).json({ ok: false, message: "center is required" });
    const radius = Math.min(Number(req.body.radius || 800), 5000);
    const categories = req.body.categoriesToAnalyze || Object.keys(categoryMap);
    const results = {};
    const failedCategories = [];

    for (const category of categories) {
      const configItem = categoryMap[category] || categoryMap.commercial;
      try {
        const url = new URL("https://restapi.amap.com/v5/place/around");
        url.searchParams.set("key", config.amapWebServiceKey);
        url.searchParams.set("location", `${center.lng},${center.lat}`);
        url.searchParams.set("radius", String(radius));
        url.searchParams.set("page_size", "20");
        url.searchParams.set("keywords", configItem.keywords);
        url.searchParams.set("types", configItem.types);
        url.searchParams.set("show_fields", "business,photos");
        const data = await fetch(url).then((r) => r.json());
        if (data.status !== "1") throw new Error(data.info || "AMAP_PLACE_FAILED");
        const pois = (data.pois || []).map((poi) => {
          const loc = normalizeLocation(poi.location);
          return {
            id: poi.id,
            name: poi.name,
            type: poi.type || configItem.label,
            address: poi.address || "",
            lng: loc?.lng,
            lat: loc?.lat,
            distance: Number(poi.distance || 0)
          };
        });
        results[category] = { status: "success", label: configItem.label, count: pois.length, pois };
      } catch (error) {
        failedCategories.push(category);
        results[category] = { status: "failed", label: configItem.label, count: 0, pois: [], message: error.message };
      }
    }

    res.json({ ok: true, results, failedCategories });
  } catch (error) {
    res.status(error.status || 502).json({
      ok: false,
      error: error.message === "KEY_MISSING" ? "KEY_MISSING" : "AMAP_CONTEXT_FAILED",
      message: error.message === "KEY_MISSING" ? "周边分析服务尚未配置，请检查 AMAP_WEB_SERVICE_KEY。" : error.message
    });
  }
}
