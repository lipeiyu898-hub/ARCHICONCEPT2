import { config } from "./config.js";

const categoryMap = {
  traffic: {
    label: "\u4ea4\u901a\u4e0e\u53ef\u8fbe\u6027",
    keywords: "\u5730\u94c1\u7ad9|\u516c\u4ea4\u7ad9|\u505c\u8f66\u573a|\u706b\u8f66\u7ad9",
    types: "150000",
    judgement: "\u5230\u8fbe\u6761\u4ef6\u5c06\u5f71\u54cd\u9996\u5c42\u516c\u5171\u754c\u9762\u4e0e\u4eba\u6d41\u7ec4\u7ec7\u65b9\u5411\u3002",
    designImpact: "\u4e3b\u8981\u4eba\u884c\u5165\u53e3\u3001\u843d\u5ba2\u70b9\u4e0e\u516c\u5171\u5230\u8fbe\u8def\u5f84\u9700\u8981\u8fdb\u4e00\u6b65\u6838\u5bf9\u3002"
  },
  public: {
    label: "\u516c\u5171\u670d\u52a1",
    keywords: "\u5b66\u6821|\u533b\u9662|\u653f\u52a1\u670d\u52a1|\u56fe\u4e66\u9986|\u6587\u5316\u9986",
    types: "120000|130000|140000",
    judgement: "\u5468\u8fb9\u516c\u5171\u670d\u52a1\u8d44\u6e90\u51b3\u5b9a\u9879\u76ee\u5bf9\u57ce\u5e02\u65e5\u5e38\u529f\u80fd\u7684\u8865\u5145\u65b9\u5f0f\u3002",
    designImpact: "\u9996\u5c42\u5f00\u653e\u7a0b\u5ea6\u3001\u914d\u5957\u529f\u80fd\u4e0e\u5bf9\u5916\u5171\u4eab\u65f6\u6bb5\u5efa\u8bae\u7ed3\u5408\u5468\u8fb9\u670d\u52a1\u5bc6\u5ea6\u5224\u65ad\u3002"
  },
  eco: {
    label: "\u5f00\u653e\u7a7a\u95f4\u4e0e\u751f\u6001\u8d44\u6e90",
    keywords: "\u516c\u56ed|\u5e7f\u573a|\u7eff\u5730|\u98ce\u666f\u533a",
    types: "110000",
    judgement: "\u5468\u8fb9\u7eff\u5730\u4e0e\u5f00\u653e\u7a7a\u95f4\u5c06\u5f71\u54cd\u9879\u76ee\u7684\u666f\u89c2\u63a5\u7eed\u548c\u6d3b\u52a8\u5916\u6ea2\u3002",
    designImpact: "\u5efa\u8bae\u6838\u5bf9\u5c4b\u9876\u3001\u7070\u7a7a\u95f4\u4e0e\u5730\u9762\u516c\u5171\u8def\u5f84\u662f\u5426\u53ef\u4e0e\u5468\u8fb9\u7eff\u5730\u5f62\u6210\u8fde\u7eed\u7cfb\u7edf\u3002"
  },
  commercial: {
    label: "\u5546\u4e1a\u4e0e\u751f\u6d3b\u670d\u52a1",
    keywords: "\u5546\u573a|\u9910\u996e|\u8d85\u5e02|\u4fbf\u5229\u5e97",
    types: "050000|060000|070000",
    judgement: "\u751f\u6d3b\u670d\u52a1\u5bc6\u5ea6\u4f1a\u5f71\u54cd\u9879\u76ee\u914d\u5957\u529f\u80fd\u662f\u8865\u5145\u578b\u8fd8\u662f\u76ee\u7684\u5730\u578b\u3002",
    designImpact: "\u9996\u5c42\u5546\u4e1a\u3001\u5496\u5561\u8f7b\u9910\u6216\u4fbf\u6c11\u670d\u52a1\u7684\u6bd4\u4f8b\u5efa\u8bae\u907f\u514d\u4e0e\u5468\u8fb9\u4e1a\u6001\u91cd\u590d\u3002"
  },
  sensitive: {
    label: "\u654f\u611f\u5bf9\u8c61",
    keywords: "\u5b66\u6821|\u5e7c\u513f\u56ed|\u533b\u9662|\u517b\u8001\u9662",
    types: "120000|140000",
    judgement: "\u654f\u611f\u5bf9\u8c61\u5bf9\u566a\u58f0\u3001\u4eba\u6d41\u3001\u8f66\u6d41\u4e0e\u5b89\u5168\u7ba1\u63a7\u66f4\u654f\u611f\u3002",
    designImpact: "\u540e\u52e4\u5165\u53e3\u3001\u8bbe\u5907\u51fa\u98ce\u3001\u591c\u95f4\u8fd0\u8425\u4e0e\u65bd\u5de5\u7ec4\u7ec7\u9700\u8981\u9884\u7559\u7f13\u51b2\u4e0e\u907f\u8ba9\u7b56\u7565\u3002"
  },
  disturbance: {
    label: "\u6f5c\u5728\u5e72\u6270",
    keywords: "\u52a0\u6cb9\u7ad9|\u5de5\u5382|\u7269\u6d41\u56ed|\u53d8\u7535\u7ad9",
    types: "010000|170000",
    judgement: "\u6f5c\u5728\u5e72\u6270\u6e90\u53ef\u80fd\u5f71\u54cd\u573a\u5730\u5b89\u5168\u3001\u566a\u58f0\u63a7\u5236\u548c\u73af\u5883\u8212\u9002\u5ea6\u3002",
    designImpact: "\u529f\u80fd\u6392\u5e03\u5efa\u8bae\u5728\u5e72\u6270\u65b9\u5411\u589e\u52a0\u5b9e\u4f53\u5c4f\u969c\u3001\u7eff\u5316\u7f13\u51b2\u6216\u670d\u52a1\u7a7a\u95f4\u8fc7\u6e21\u3002"
  }
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

function buildCategoryReport(category, radius, pois) {
  const item = categoryMap[category] || categoryMap.commercial;
  const nearest = pois.length ? Math.min(...pois.map((poi) => Number(poi.distance || 0))) : null;
  const summary = nearest === null
    ? `${radius}m \u5185\u6682\u672a\u8bc6\u522b\u5230\u76f4\u63a5\u76f8\u5173\u7684${item.label}\u70b9\u4f4d\u3002`
    : `${radius}m \u5185\u8bc6\u522b\u5230 ${pois.length} \u5904${item.label}\u70b9\u4f4d\uff0c\u6700\u8fd1\u7ea6 ${nearest}m\u3002`;
  return {
    summary,
    judgement: pois.length ? item.judgement : `\u5f53\u524d\u8303\u56f4\u5185${item.label}\u5f71\u54cd\u76f8\u5bf9\u6709\u9650\uff0c\u4f46\u4ecd\u5efa\u8bae\u5728\u66f4\u5927\u534a\u5f84\u5185\u590d\u6838\u3002`,
    designImpact: pois.length ? item.designImpact : `\u8bbe\u8ba1\u4e0a\u53ef\u5148\u6309\u9879\u76ee\u5185\u90e8\u9700\u6c42\u7ec4\u7ec7${item.label}\u76f8\u5173\u7a7a\u95f4\uff0c\u540e\u7eed\u518d\u6838\u5bf9\u57ce\u5e02\u8d44\u6e90\u63a5\u5165\u3002`
  };
}

export async function amapSuggest(req, res) {
  try {
    requireAmapKey();
    const keywords = String(req.query.keywords || "").trim();
    if (!keywords) return res.json({ ok: true, tips: [] });
    const url = new URL("/v3/assistant/inputtips", config.amapRestBaseUrl);
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
      message: error.message === "KEY_MISSING" ? "\u5730\u70b9\u641c\u7d22\u670d\u52a1\u5c1a\u672a\u914d\u7f6e\uff0c\u8bf7\u68c0\u67e5 AMAP_WEB_SERVICE_KEY\u3002" : error.message
    });
  }
}

export async function amapGeocode(req, res) {
  try {
    requireAmapKey();
    const address = String(req.query.address || "").trim();
    if (!address) return res.status(400).json({ ok: false, error: "ADDRESS_REQUIRED" });
    const url = new URL("/v3/geocode/geo", config.amapRestBaseUrl);
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
      message: error.message === "KEY_MISSING" ? "\u5730\u7406\u7f16\u7801\u670d\u52a1\u5c1a\u672a\u914d\u7f6e\uff0c\u8bf7\u68c0\u67e5 AMAP_WEB_SERVICE_KEY\u3002" : error.message
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
        const url = new URL("/v5/place/around", config.amapRestBaseUrl);
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
            location: loc ? `${loc.lng},${loc.lat}` : "",
            lng: loc?.lng,
            lat: loc?.lat,
            distance: Number(poi.distance || 0)
          };
        });
        results[category] = {
          status: "success",
          label: configItem.label,
          count: pois.length,
          pois,
          ...buildCategoryReport(category, radius, pois)
        };
      } catch (error) {
        failedCategories.push(category);
        results[category] = {
          status: "failed",
          label: configItem.label,
          count: 0,
          pois: [],
          message: error.message,
          summary: "\u8be5\u5206\u7c7b\u6682\u672a\u8fd4\u56de\u53ef\u7528\u6570\u636e\u3002",
          judgement: "\u8be5\u5206\u7c7b\u9700\u8981\u7a0d\u540e\u91cd\u8bd5\u6216\u7ed3\u5408\u4eba\u5de5\u8d44\u6599\u590d\u6838\u3002",
          designImpact: "\u672a\u83b7\u5f97\u6570\u636e\u524d\uff0c\u8bbe\u8ba1\u5224\u65ad\u4e0d\u5b9c\u8fc7\u5ea6\u4f9d\u8d56\u8be5\u7c7b\u5468\u8fb9\u6761\u4ef6\u3002"
        };
      }
    }

    res.json({ ok: true, results, failedCategories });
  } catch (error) {
    res.status(error.status || 502).json({
      ok: false,
      error: error.message === "KEY_MISSING" ? "KEY_MISSING" : "AMAP_CONTEXT_FAILED",
      message: error.message === "KEY_MISSING" ? "\u5468\u8fb9\u5206\u6790\u670d\u52a1\u5c1a\u672a\u914d\u7f6e\uff0c\u8bf7\u68c0\u67e5 AMAP_WEB_SERVICE_KEY\u3002" : error.message
    });
  }
}
