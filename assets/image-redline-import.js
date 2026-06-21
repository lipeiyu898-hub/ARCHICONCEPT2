const MAX_FILE_SIZE = 15 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const PDF_JS_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js";
const PDF_WORKER_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";

const state = {
  mode: "manual",
  fileName: "",
  sourceCanvas: null,
  candidates: [],
  selectedCandidate: -1,
  recognitionStatus: "idle",
  message: "",
  error: "",
  imported: false,
  importPanelCollapsed: false,
  placementConfirmed: false,
  transformAngle: 0,
  transforming: false,
  editorState: "idle",
  activeTool: "node",
  transformOverlays: [],
  activationOverlays: [],
  map: window.__ARCHICONCEPT_MAP__ || null,
  mapEventsBound: false,
  mapToolbar: null,
  ignoreBlankMapClickUntil: 0,
  geometrySignature: "",
  redline: window.__ARCHICONCEPT_REDLINE_STATE__ || {
    points: [],
    areaM2: 0,
    perimeterM: 0,
    status: "未绘制"
  },
  activeBody: null
};

const pageScrollLock = {
  locked: false,
  scrollY: 0,
  bodyCssText: "",
  htmlCssText: ""
};

const text = (element) => (element?.textContent || "").replace(/\s+/g, " ").trim();

const findSiteEditorOverlay = () => {
  const title = [...document.querySelectorAll("h3")].find(
    (element) => text(element) === "场地编辑器"
  );
  let current = title;
  while (current && current !== document.body) {
    const className = String(current.className || "");
    if (className.includes("fixed") && className.includes("inset-0")) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
};

const syncEditorPageScrollLock = () => {
  const editorOpen = Boolean(findSiteEditorOverlay());
  if (editorOpen && !pageScrollLock.locked) {
    pageScrollLock.locked = true;
    pageScrollLock.scrollY = window.scrollY;
    pageScrollLock.bodyCssText = document.body.style.cssText;
    pageScrollLock.htmlCssText = document.documentElement.style.cssText;
    const scrollbarGap = Math.max(
      0,
      window.innerWidth - document.documentElement.clientWidth
    );
    document.documentElement.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${pageScrollLock.scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    if (scrollbarGap > 0) {
      document.body.style.paddingRight = `${scrollbarGap}px`;
    }
    return;
  }
  if (!editorOpen && pageScrollLock.locked) {
    const restoreScrollY = pageScrollLock.scrollY;
    document.body.style.cssText = pageScrollLock.bodyCssText;
    document.documentElement.style.cssText = pageScrollLock.htmlCssText;
    pageScrollLock.locked = false;
    window.scrollTo(0, restoreScrollY);
  }
};

const setMessage = (message, error = "") => {
  state.message = message;
  state.error = error;
  renderActiveShell();
};

const setImageSource = (canvas, fileName) => {
  state.sourceCanvas = canvas;
  state.fileName = fileName;
  state.candidates = [];
  state.selectedCandidate = -1;
  state.recognitionStatus = "ready";
  state.message = "图片已载入，正在尝试识别闭合轮廓。";
  state.error = "";
  state.imported = false;
  state.importPanelCollapsed = false;
  state.placementConfirmed = false;
  state.transformAngle = 0;
  renderActiveShell();
  window.setTimeout(recognizeContours, 40);
};

const loadScript = (src, globalName) =>
  new Promise((resolve, reject) => {
    if (window[globalName]) {
      resolve(window[globalName]);
      return;
    }
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window[globalName]), {
        once: true
      });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve(window[globalName]);
    script.onerror = reject;
    document.head.appendChild(script);
  });

const renderPdfFirstPage = async (file) => {
  const pdfjs = await loadScript(PDF_JS_URL, "pdfjsLib");
  if (!pdfjs) {
    throw new Error("PDF_READER_UNAVAILABLE");
  }
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const original = page.getViewport({ scale: 1 });
  const scale = Math.min(2, 1400 / Math.max(original.width, original.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  await page.render({
    canvasContext: canvas.getContext("2d", { willReadFrequently: true }),
    viewport
  }).promise;
  return canvas;
};

const renderImageFile = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const maxSide = 1400;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas
        .getContext("2d", { willReadFrequently: true })
        .drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("IMAGE_DECODE_FAILED"));
    };
    image.src = url;
  });

const handleFile = async (file) => {
  if (!file) return;
  if (!SUPPORTED_TYPES.has(file.type)) {
    setMessage("", "图片格式不支持。请上传 JPG、PNG 或 PDF 文件。");
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    setMessage("", "图片过大。请上传不超过 15 MB 的文件。");
    return;
  }
  state.recognitionStatus = "loading";
  state.error = "";
  state.message = "正在读取文件...";
  renderActiveShell();
  try {
    const canvas =
      file.type === "application/pdf"
        ? await renderPdfFirstPage(file)
        : await renderImageFile(file);
    setImageSource(canvas, file.name);
  } catch (error) {
    console.error("Redline image read failed:", error);
    setMessage(
      "",
      file.type === "application/pdf"
        ? "PDF 第一页读取失败，请检查网络或改用 JPG、PNG。"
        : "图片读取失败，请重新导出后再上传。"
    );
  }
};

const otsuThreshold = (gray) => {
  const histogram = new Uint32Array(256);
  for (const value of gray) histogram[value] += 1;
  const total = gray.length;
  let sum = 0;
  for (let index = 0; index < 256; index += 1) sum += index * histogram[index];
  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = -1;
  let threshold = 128;
  for (let index = 0; index < 256; index += 1) {
    backgroundWeight += histogram[index];
    if (!backgroundWeight) continue;
    const foregroundWeight = total - backgroundWeight;
    if (!foregroundWeight) break;
    backgroundSum += index * histogram[index];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (sum - backgroundSum) / foregroundWeight;
    const variance =
      backgroundWeight *
      foregroundWeight *
      (backgroundMean - foregroundMean) *
      (backgroundMean - foregroundMean);
    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = index;
    }
  }
  return threshold;
};

const dilate = (mask, width, height, radius = 1) => {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const targetY = y + dy;
        if (targetY < 0 || targetY >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const targetX = x + dx;
          if (targetX < 0 || targetX >= width) continue;
          output[targetY * width + targetX] = 1;
        }
      }
    }
  }
  return output;
};

const erode = (mask, width, height, radius = 1) => {
  const output = new Uint8Array(mask.length);
  for (let y = radius; y < height - radius; y += 1) {
    for (let x = radius; x < width - radius; x += 1) {
      let keep = 1;
      for (let dy = -radius; dy <= radius && keep; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (!mask[(y + dy) * width + x + dx]) {
            keep = 0;
            break;
          }
        }
      }
      output[y * width + x] = keep;
    }
  }
  return output;
};

const closeMask = (mask, width, height) =>
  erode(dilate(mask, width, height, 1), width, height, 1);

const traceBoundary = (labels, componentId, width, height, start) => {
  const directions = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0]
  ];
  const points = [];
  let current = { ...start };
  let previous = { x: start.x - 1, y: start.y };
  const initialPrevious = { ...previous };
  const maxSteps = Math.min(width * height, 18000);

  for (let step = 0; step < maxSteps; step += 1) {
    points.push({ x: current.x, y: current.y });
    let previousDirection = 7;
    for (let index = 0; index < directions.length; index += 1) {
      const [dx, dy] = directions[index];
      if (current.x + dx === previous.x && current.y + dy === previous.y) {
        previousDirection = index;
        break;
      }
    }
    let found = null;
    let foundDirection = -1;
    for (let offset = 1; offset <= directions.length; offset += 1) {
      const direction = (previousDirection + offset) % directions.length;
      const [dx, dy] = directions[direction];
      const x = current.x + dx;
      const y = current.y + dy;
      if (
        x >= 0 &&
        x < width &&
        y >= 0 &&
        y < height &&
        labels[y * width + x] === componentId
      ) {
        found = { x, y };
        foundDirection = direction;
        break;
      }
    }
    if (!found) break;
    const previousIndex = (foundDirection + directions.length - 1) % directions.length;
    previous = {
      x: current.x + directions[previousIndex][0],
      y: current.y + directions[previousIndex][1]
    };
    current = found;
    if (
      current.x === start.x &&
      current.y === start.y &&
      previous.x === initialPrevious.x &&
      previous.y === initialPrevious.y
    ) {
      break;
    }
  }
  return points;
};

const distanceToSegment = (point, start, end) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const amount = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)
    )
  );
  return Math.hypot(
    point.x - (start.x + amount * dx),
    point.y - (start.y + amount * dy)
  );
};

const simplifyOpen = (points, tolerance) => {
  if (points.length <= 2) return points;
  let greatestDistance = 0;
  let greatestIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = distanceToSegment(
      points[index],
      points[0],
      points[points.length - 1]
    );
    if (distance > greatestDistance) {
      greatestDistance = distance;
      greatestIndex = index;
    }
  }
  if (greatestDistance <= tolerance) return [points[0], points[points.length - 1]];
  return [
    ...simplifyOpen(points.slice(0, greatestIndex + 1), tolerance).slice(0, -1),
    ...simplifyOpen(points.slice(greatestIndex), tolerance)
  ];
};

const simplifyClosed = (points, tolerance) => {
  if (points.length < 6) return points;
  const midpoint = Math.floor(points.length / 2);
  const first = simplifyOpen(points.slice(0, midpoint + 1), tolerance);
  const second = simplifyOpen(
    [...points.slice(midpoint), points[0]],
    tolerance
  );
  const combined = [...first.slice(0, -1), ...second.slice(0, -1)];
  if (combined.length > 80) {
    const step = Math.ceil(combined.length / 80);
    return combined.filter((_, index) => index % step === 0);
  }
  return combined;
};

const polygonArea = (points) => {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    area += points[index].x * next.y - next.x * points[index].y;
  }
  return Math.abs(area / 2);
};

const findEnclosedRegions = (lineMask, width, height, maskName) => {
  const outside = new Uint8Array(lineMask.length);
  const queue = new Int32Array(lineMask.length);
  let head = 0;
  let tail = 0;

  const enqueueOutside = (x, y) => {
    const index = y * width + x;
    if (!lineMask[index] && !outside[index]) {
      outside[index] = 1;
      queue[tail++] = index;
    }
  };

  for (let x = 0; x < width; x += 1) {
    enqueueOutside(x, 0);
    enqueueOutside(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueueOutside(0, y);
    enqueueOutside(width - 1, y);
  }

  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueueOutside(x - 1, y);
    if (x + 1 < width) enqueueOutside(x + 1, y);
    if (y > 0) enqueueOutside(x, y - 1);
    if (y + 1 < height) enqueueOutside(x, y + 1);
  }

  const labels = new Int32Array(lineMask.length);
  const candidates = [];
  let componentId = 0;
  const minArea = Math.max(90, Math.round(width * height * 0.0012));
  const maxArea = width * height * 0.82;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const startIndex = y * width + x;
      if (lineMask[startIndex] || outside[startIndex] || labels[startIndex]) continue;
      componentId += 1;
      head = 0;
      tail = 0;
      queue[tail++] = startIndex;
      labels[startIndex] = componentId;
      let area = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let boundaryStart = { x, y };

      while (head < tail) {
        const index = queue[head++];
        const currentX = index % width;
        const currentY = Math.floor(index / width);
        area += 1;
        minX = Math.min(minX, currentX);
        maxX = Math.max(maxX, currentX);
        minY = Math.min(minY, currentY);
        maxY = Math.max(maxY, currentY);
        if (
          currentY < boundaryStart.y ||
          (currentY === boundaryStart.y && currentX < boundaryStart.x)
        ) {
          boundaryStart = { x: currentX, y: currentY };
        }
        const neighbors = [
          index - 1,
          index + 1,
          index - width,
          index + width
        ];
        for (const neighbor of neighbors) {
          if (
            neighbor >= 0 &&
            neighbor < lineMask.length &&
            !lineMask[neighbor] &&
            !outside[neighbor] &&
            !labels[neighbor]
          ) {
            labels[neighbor] = componentId;
            queue[tail++] = neighbor;
          }
        }
      }

      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      if (
        area < minArea ||
        area > maxArea ||
        boxWidth < width * 0.035 ||
        boxHeight < height * 0.035
      ) {
        continue;
      }

      const rawBoundary = traceBoundary(
        labels,
        componentId,
        width,
        height,
        boundaryStart
      );
      if (rawBoundary.length < 8) continue;
      const tolerance = Math.max(1.2, Math.min(boxWidth, boxHeight) * 0.009);
      const simplified = simplifyClosed(rawBoundary, tolerance);
      if (simplified.length < 3) continue;
      const contourArea = polygonArea(simplified);
      if (contourArea < minArea * 0.5) continue;

      const normalized = simplified.map((point) => ({
        x: (point.x - minX) / Math.max(1, boxWidth - 1),
        y: (point.y - minY) / Math.max(1, boxHeight - 1)
      }));
      candidates.push({
        id: `${maskName}-${componentId}`,
        maskName,
        points: normalized,
        previewPoints: simplified.map((point) => ({
          x: point.x / width,
          y: point.y / height
        })),
        area,
        coverage: area / (width * height),
        bbox: { minX, minY, maxX, maxY, width: boxWidth, height: boxHeight },
        aspect: boxWidth / Math.max(1, boxHeight)
      });
    }
  }
  return candidates;
};

const deduplicateCandidates = (candidates) => {
  const sorted = [...candidates].sort((first, second) => second.area - first.area);
  const unique = [];
  for (const candidate of sorted) {
    const centerX = (candidate.bbox.minX + candidate.bbox.maxX) / 2;
    const centerY = (candidate.bbox.minY + candidate.bbox.maxY) / 2;
    const duplicate = unique.some((existing) => {
      const existingCenterX = (existing.bbox.minX + existing.bbox.maxX) / 2;
      const existingCenterY = (existing.bbox.minY + existing.bbox.maxY) / 2;
      const centerDistance = Math.hypot(
        centerX - existingCenterX,
        centerY - existingCenterY
      );
      const scale = Math.max(candidate.bbox.width, candidate.bbox.height);
      const areaRatio =
        Math.min(candidate.area, existing.area) /
        Math.max(candidate.area, existing.area);
      return centerDistance < scale * 0.08 && areaRatio > 0.82;
    });
    if (!duplicate) unique.push(candidate);
    if (unique.length >= 8) break;
  }
  return unique;
};

const recognizeContours = () => {
  if (!state.sourceCanvas) return;
  state.recognitionStatus = "recognizing";
  state.error = "";
  state.message = "正在识别候选闭合轮廓...";
  renderActiveShell();

  window.setTimeout(() => {
    try {
      const source = state.sourceCanvas;
      const maxSide = 720;
      const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
      const width = Math.max(1, Math.round(source.width * scale));
      const height = Math.max(1, Math.round(source.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(source, 0, 0, width, height);
      const image = context.getImageData(0, 0, width, height);
      const gray = new Uint8Array(width * height);
      const redMask = new Uint8Array(width * height);
      const saturatedMask = new Uint8Array(width * height);

      for (let index = 0; index < gray.length; index += 1) {
        const offset = index * 4;
        const red = image.data[offset];
        const green = image.data[offset + 1];
        const blue = image.data[offset + 2];
        const maximum = Math.max(red, green, blue);
        const minimum = Math.min(red, green, blue);
        gray[index] = Math.round(red * 0.299 + green * 0.587 + blue * 0.114);
        redMask[index] =
          red > 95 && red > green * 1.24 && red > blue * 1.24 ? 1 : 0;
        saturatedMask[index] =
          maximum - minimum > 68 && gray[index] < 218 ? 1 : 0;
      }

      const threshold = Math.min(185, Math.max(82, otsuThreshold(gray) + 18));
      const darkMask = new Uint8Array(gray.length);
      for (let index = 0; index < gray.length; index += 1) {
        darkMask[index] = gray[index] < threshold ? 1 : 0;
      }

      const masks = [
        ["红色线", dilate(closeMask(redMask, width, height), width, height, 1)],
        ["深色线", dilate(closeMask(darkMask, width, height), width, height, 1)],
        [
          "彩色线",
          dilate(closeMask(saturatedMask, width, height), width, height, 1)
        ]
      ];

      let candidates = [];
      for (const [name, mask] of masks) {
        candidates.push(...findEnclosedRegions(mask, width, height, name));
      }
      candidates = deduplicateCandidates(candidates);
      state.candidates = candidates;
      state.selectedCandidate = candidates.length === 1 ? 0 : -1;
      state.recognitionStatus = "done";
      if (!candidates.length) {
        state.error =
          "未识别到可用红线轮廓，请尝试上传对比更清晰的场地图，或改用手动绘制。";
        state.message = "";
      } else if (candidates.length > 1) {
        state.message = `识别到 ${candidates.length} 个候选轮廓，请选择一个后导入地图。`;
        state.error = "";
      } else {
        state.message = "已识别到 1 个候选轮廓，可导入地图。";
        state.error = "";
      }
      renderActiveShell();
    } catch (error) {
      console.error("Contour recognition failed:", error);
      state.recognitionStatus = "done";
      state.error =
        "未识别到可用红线轮廓，请尝试上传对比更清晰的场地图，或改用手动绘制。";
      state.message = "";
      renderActiveShell();
    }
  }, 20);
};

const orientation = (a, b, c) =>
  (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);

const onSegment = (a, b, point) =>
  point.lng >= Math.min(a.lng, b.lng) - 1e-12 &&
  point.lng <= Math.max(a.lng, b.lng) + 1e-12 &&
  point.lat >= Math.min(a.lat, b.lat) - 1e-12 &&
  point.lat <= Math.max(a.lat, b.lat) + 1e-12;

const segmentsIntersect = (a, b, c, d) => {
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  if (
    ((first > 0 && second < 0) || (first < 0 && second > 0)) &&
    ((third > 0 && fourth < 0) || (third < 0 && fourth > 0))
  ) {
    return true;
  }
  if (Math.abs(first) < 1e-12 && onSegment(a, b, c)) return true;
  if (Math.abs(second) < 1e-12 && onSegment(a, b, d)) return true;
  if (Math.abs(third) < 1e-12 && onSegment(c, d, a)) return true;
  if (Math.abs(fourth) < 1e-12 && onSegment(c, d, b)) return true;
  return false;
};

const hasSelfIntersection = (points) => {
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      if (
        first === second ||
        firstNext === second ||
        secondNext === first ||
        (first === 0 && secondNext === 0)
      ) {
        continue;
      }
      if (
        segmentsIntersect(
          points[first],
          points[firstNext],
          points[second],
          points[secondNext]
        )
      ) {
        return true;
      }
    }
  }
  return false;
};

const validateRedline = (points, areaM2, source) => {
  const unique = [];
  for (const point of points || []) {
    const previous = unique[unique.length - 1];
    if (
      !previous ||
      Math.abs(previous.lng - point.lng) > 1e-10 ||
      Math.abs(previous.lat - point.lat) > 1e-10
    ) {
      unique.push(point);
    }
  }
  if (unique.length < 3) return "红线节点数量不能少于 3 个。";
  if (hasSelfIntersection(unique)) return "轮廓存在自相交，请调整节点后再确认。";
  if (!Number.isFinite(areaM2) || areaM2 <= 1)
    return "轮廓面积异常，请调整比例后再确认。";
  if (areaM2 > 100000000) return "轮廓面积异常，请缩小轮廓后再确认。";
  return "";
};

const getConfirmDisabledReason = () => {
  const points = state.redline.points || [];
  if (!points.length) return "请先绘制或导入用地红线";
  if (points.length < 3) return "红线至少需要 3 个节点";
  if (state.editorState === "drawing") return "请先完成红线闭合";
  return validateRedline(
    points,
    state.redline.areaM2,
    state.redline.source || window.__ARCHICONCEPT_REDLINE_SOURCE__
  );
};

window.__ARCHICONCEPT_VALIDATE_REDLINE__ = validateRedline;
window.__ARCHICONCEPT_REDLINE_SOURCE__ =
  window.__ARCHICONCEPT_REDLINE_SOURCE__ || "manual_draw";

const dispatchImport = (detail) => {
  window.__ARCHICONCEPT_REDLINE_SOURCE__ = "image_import";
  window.dispatchEvent(
    new CustomEvent("archiconcept:redline-import", {
      detail
    })
  );
};

const dispatchTransform = (phase, points = null) => {
  window.dispatchEvent(
    new CustomEvent("archiconcept:redline-transform", {
      detail: { phase, points }
    })
  );
};

const toPixel = (map, point) => {
  const lngLat = new window.AMap.LngLat(point.lng, point.lat);
  const pixel =
    map.lngLatToContainer?.(lngLat) || map.lngLatToPixel?.(lngLat);
  return { x: pixel.getX(), y: pixel.getY() };
};

const toGeoPoint = (map, point) => {
  const pixel = new window.AMap.Pixel(point.x, point.y);
  const lngLat =
    map.containerToLngLat?.(pixel) || map.pixelToLngLat?.(pixel);
  return { lng: lngLat.getLng(), lat: lngLat.getLat() };
};

const clearTransformOverlays = () => {
  const map = state.map || window.__ARCHICONCEPT_MAP__;
  if (map && state.transformOverlays.length) {
    try {
      map.remove(state.transformOverlays);
    } catch {}
  }
  state.transformOverlays = [];
};

const clearActivationOverlays = () => {
  const map = state.map || window.__ARCHICONCEPT_MAP__;
  if (map && state.activationOverlays.length) {
    try {
      map.remove(state.activationOverlays);
    } catch {}
  }
  state.activationOverlays = [];
};

const setActiveTool = (tool) => {
  const points = state.redline.points || [];
  if (points.length < 3 || state.redline.status === "已确认") return;
  const nextTool =
    tool === "freeTransform" && state.activeTool === "freeTransform"
      ? "node"
      : tool;
  state.activeTool = nextTool;
  state.editorState =
    nextTool === "freeTransform" ? "freeTransform" : "polygonEditing";
  state.ignoreBlankMapClickUntil = performance.now() + 180;
  const nativeMode = {
    node: "node",
    insert: "insert",
    delete: "delete",
    freeTransform: "freeTransform"
  }[nextTool];
  if (nativeMode) {
    window.dispatchEvent(
      new CustomEvent("archiconcept:redline-mode", {
        detail: { mode: nativeMode }
      })
    );
  }
  renderMapEditingOverlays();
  renderMapToolbar();
  renderActiveShell();
};

const startMapTransform = (kind, startEvent, cornerIndex = 0) => {
  const map = state.map || window.__ARCHICONCEPT_MAP__;
  const points = state.redline.points || [];
  if (!map || !window.AMap || points.length < 3) return;

  startEvent.originEvent?.preventDefault?.();
  startEvent.originEvent?.stopPropagation?.();
  const originalPixels = points.map((point) => toPixel(map, point));
  const bounds = originalPixels.reduce(
    (result, point) => ({
      minX: Math.min(result.minX, point.x),
      minY: Math.min(result.minY, point.y),
      maxX: Math.max(result.maxX, point.x),
      maxY: Math.max(result.maxY, point.y)
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );
  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2
  };
  const startPixel = toPixel(map, {
    lng: startEvent.lnglat.getLng(),
    lat: startEvent.lnglat.getLat()
  });
  const startGeo = {
    lng: startEvent.lnglat.getLng(),
    lat: startEvent.lnglat.getLat()
  };
  const geoCenter = {
    lng: points.reduce((sum, point) => sum + point.lng, 0) / points.length,
    lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length
  };
  const latitudeScale = Math.max(
    0.2,
    Math.cos((geoCenter.lat * Math.PI) / 180)
  );
  const transformGeo = (scale, angle) => {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return points.map((point) => {
      const x = (point.lng - geoCenter.lng) * latitudeScale * scale;
      const y = (point.lat - geoCenter.lat) * scale;
      return {
        lng: geoCenter.lng + (x * cosine - y * sine) / latitudeScale,
        lat: geoCenter.lat + x * sine + y * cosine
      };
    });
  };
  const startDistance = Math.max(
    1,
    Math.hypot(startPixel.x - center.x, startPixel.y - center.y)
  );
  const startAngle = Math.atan2(
    startPixel.y - center.y,
    startPixel.x - center.x
  );
  state.transforming = true;
  state.editorState = "freeTransform";
  state.placementConfirmed = false;
  dispatchTransform("start");
  map.setStatus?.({ dragEnable: false });

  let pendingPoints = points;
  let frame = 0;
  const update = (event) => {
    const originEvent = event.originEvent || event;
    const mapRect = map.getContainer().getBoundingClientRect();
    const eventLngLat =
      event.lnglat ||
      map.containerToLngLat(
        new window.AMap.Pixel(
          originEvent.clientX - mapRect.left,
          originEvent.clientY - mapRect.top
        )
      );
    const current = toPixel(map, {
      lng: eventLngLat.getLng(),
      lat: eventLngLat.getLat()
    });
    if (kind === "move") {
      const currentGeo = {
        lng: eventLngLat.getLng(),
        lat: eventLngLat.getLat()
      };
      const deltaLng = currentGeo.lng - startGeo.lng;
      const deltaLat = currentGeo.lat - startGeo.lat;
      pendingPoints = points.map((point) => ({
        lng: point.lng + deltaLng,
        lat: point.lat + deltaLat
      }));
    } else if (kind === "scale") {
      const distance = Math.max(
        1,
        Math.hypot(current.x - center.x, current.y - center.y)
      );
      const scale = Math.max(0.05, Math.min(20, distance / startDistance));
      pendingPoints = transformGeo(scale, 0);
    } else if (kind === "rotate") {
      const angle =
        Math.atan2(current.y - center.y, current.x - center.x) - startAngle;
      state.transformAngle = Math.round((angle * 180) / Math.PI);
      pendingPoints = transformGeo(1, angle);
    }
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      dispatchTransform("update", pendingPoints);
      renderActiveShell();
    });
  };
  const finish = () => {
    window.removeEventListener("mousemove", update);
    window.removeEventListener("mouseup", finish);
    cancelAnimationFrame(frame);
    dispatchTransform("end", pendingPoints);
    state.transforming = false;
    state.transformAngle = 0;
    map.setStatus?.({ dragEnable: true });
    window.setTimeout(renderMapEditingOverlays, 30);
  };

  window.addEventListener("mousemove", update);
  window.addEventListener("mouseup", finish, { once: true });
};

const makeTransformHandle = (map, point, className, label, onMouseDown) => {
  const marker = new window.AMap.Marker({
    position: new window.AMap.LngLat(point.lng, point.lat),
    content: `<button type="button" class="${className}" aria-label="${label}"></button>`,
    offset: new window.AMap.Pixel(-9, -9),
    zIndex: 122,
    bubble: false,
    map
  });
  marker.on("mousedown", onMouseDown);
  return marker;
};

const renderFreeTransform = () => {
  if (state.transforming) return;
  clearTransformOverlays();
  const map = state.map || window.__ARCHICONCEPT_MAP__;
  const points = state.redline.points || [];
  if (
    !map ||
    !window.AMap ||
    points.length < 3 ||
    state.redline.status === "已确认" ||
    state.activeTool !== "freeTransform"
  ) {
    return;
  }
  state.map = map;
  const pixels = points.map((point) => toPixel(map, point));
  const bounds = pixels.reduce(
    (result, point) => ({
      minX: Math.min(result.minX, point.x),
      minY: Math.min(result.minY, point.y),
      maxX: Math.max(result.maxX, point.x),
      maxY: Math.max(result.maxY, point.y)
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );
  const cornersPx = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY }
  ];
  const corners = cornersPx.map((point) => toGeoPoint(map, point));
  const topCenterPx = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: bounds.minY
  };
  const centerPx = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2
  };
  const rotatePx = { x: topCenterPx.x, y: topCenterPx.y - 38 };
  const topCenter = toGeoPoint(map, topCenterPx);
  const rotatePoint = toGeoPoint(map, rotatePx);
  const centerPoint = toGeoPoint(map, centerPx);

  const box = new window.AMap.Polyline({
    path: [...corners, corners[0]].map(
      (point) => new window.AMap.LngLat(point.lng, point.lat)
    ),
    strokeColor: "#111827",
    strokeOpacity: 0.82,
    strokeWeight: 1.5,
    strokeStyle: "dashed",
    zIndex: 118,
    map
  });
  const rotateLine = new window.AMap.Polyline({
    path: [topCenter, rotatePoint].map(
      (point) => new window.AMap.LngLat(point.lng, point.lat)
    ),
    strokeColor: "#111827",
    strokeOpacity: 0.65,
    strokeWeight: 1.5,
    zIndex: 119,
    map
  });
  const moveWidth = Math.max(28, bounds.maxX - bounds.minX - 22);
  const moveHeight = Math.max(28, bounds.maxY - bounds.minY - 22);
  const moveSurface = document.createElement("div");
  moveSurface.className = "redline-transform-move-surface";
  moveSurface.style.width = `${moveWidth}px`;
  moveSurface.style.height = `${moveHeight}px`;
  moveSurface.setAttribute("aria-label", "拖动整体红线");
  moveSurface.addEventListener("mousedown", (originEvent) => {
    const rect = map.getContainer().getBoundingClientRect();
    const lnglat = map.containerToLngLat(
      new window.AMap.Pixel(
        originEvent.clientX - rect.left,
        originEvent.clientY - rect.top
      )
    );
    startMapTransform("move", { originEvent, lnglat });
  });
  const mover = new window.AMap.Marker({
    position: new window.AMap.LngLat(centerPoint.lng, centerPoint.lat),
    content: moveSurface,
    offset: new window.AMap.Pixel(-moveWidth / 2, -moveHeight / 2),
    bubble: false,
    zIndex: 80,
    map
  });

  const handles = corners.map((point, index) =>
    makeTransformHandle(
      map,
      point,
      "redline-transform-handle is-scale",
      `缩放控制点 ${index + 1}`,
      (event) => startMapTransform("scale", event, index)
    )
  );
  const rotateHandle = makeTransformHandle(
    map,
    rotatePoint,
    "redline-transform-handle is-rotate",
    "旋转控制点",
    (event) => startMapTransform("rotate", event)
  );
  state.transformOverlays = [
    box,
    rotateLine,
    mover,
    ...handles,
    rotateHandle
  ];
};

const renderTransformActivationOverlay = () => {
  clearActivationOverlays();
  const map = state.map || window.__ARCHICONCEPT_MAP__;
  const points = state.redline.points || [];
  if (
    !map ||
    !window.AMap ||
    points.length < 3 ||
    state.redline.status === "已确认" ||
    state.activeTool === "freeTransform"
  ) {
    return;
  }
  const activation = new window.AMap.Polygon({
    path: points.map((point) => new window.AMap.LngLat(point.lng, point.lat)),
    fillColor: "#111827",
    fillOpacity: 0.001,
    strokeColor: "#111827",
    strokeOpacity: 0.001,
    strokeWeight: 10,
    cursor: "pointer",
    bubble: false,
    zIndex: 62,
    map
  });
  activation.on("click", (event) => {
    if (performance.now() <= state.ignoreBlankMapClickUntil) return;
    event.originEvent?.preventDefault?.();
    event.originEvent?.stopPropagation?.();
    setActiveTool("freeTransform");
  });
  state.activationOverlays = [activation];
};

const renderMapEditingOverlays = () => {
  clearTransformOverlays();
  clearActivationOverlays();
  if (state.activeTool === "freeTransform") renderFreeTransform();
  else renderTransformActivationOverlay();
};

const flipRedline = (axis) => {
  const points = state.redline.points || [];
  if (points.length < 3) return;
  const center = {
    lng: points.reduce((sum, point) => sum + point.lng, 0) / points.length,
    lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length
  };
  const latitudeScale = Math.max(
    0.2,
    Math.cos((center.lat * Math.PI) / 180)
  );
  const flipped = points.map((point) => {
    const x = (point.lng - center.lng) * latitudeScale;
    const y = point.lat - center.lat;
    return {
      lng:
        center.lng +
        (axis === "horizontal" ? -x : x) / latitudeScale,
      lat: center.lat + (axis === "vertical" ? -y : y)
    };
  });
  state.placementConfirmed = false;
  dispatchTransform("start");
  dispatchTransform("update", flipped);
  dispatchTransform("end", flipped);
};

const completeCurrentRedline = () => {
  const body = state.activeBody;
  if (!body) return false;
  if (state.redline.status === "待确认") return true;
  return runNativeEditorAction(body, "完成闭合");
};

const confirmCurrentRedline = () => {
  const body = state.activeBody;
  if (!body) return;
  const error = getConfirmDisabledReason();
  if (error) {
    setMessage("", error);
    return;
  }
  const confirm = () => {
    if (!clickNativeButton(body, "确认用地红线")) {
      setMessage("", "请先完成闭合，再确认用地红线。");
    }
  };
  if (state.redline.status === "待确认") confirm();
  else if (completeCurrentRedline()) window.setTimeout(confirm, 80);
};

const syncMapToolbarLayout = () => {
  const toolbar = state.mapToolbar;
  const map = state.map || window.__ARCHICONCEPT_MAP__;
  if (!toolbar || !map) return;
  const rect = map.getContainer().getBoundingClientRect();
  toolbar.style.left = `${Math.round(rect.left + rect.width / 2)}px`;
  toolbar.style.top = `${Math.round(rect.bottom - 18)}px`;
  toolbar.style.maxWidth = `${Math.round(rect.width * 0.8)}px`;
};

const renderMapToolbar = () => {
  const points = state.redline.points || [];
  const shouldShow =
    points.length > 0 &&
    state.redline.status !== "已确认" &&
    Boolean(state.activeBody?.isConnected);
  if (!shouldShow) {
    state.mapToolbar?.remove();
    state.mapToolbar = null;
    return;
  }
  let toolbar = state.mapToolbar;
  if (!toolbar?.isConnected) {
    toolbar = document.createElement("div");
    toolbar.className = "redline-map-toolbar";
    document.body.appendChild(toolbar);
    state.mapToolbar = toolbar;
  }
  const validationError = getConfirmDisabledReason();
  const isDrawing = state.editorState === "drawing";
  const canTransform = points.length >= 3 && !isDrawing;
  const freeActive = state.activeTool === "freeTransform";
  toolbar.innerHTML = `
    <div class="redline-map-toolbar-group" aria-label="历史操作">
      <button type="button" data-toolbar-action="undo">撤销</button>
      <button type="button" data-toolbar-action="redo">重做</button>
    </div>
    <span class="redline-map-toolbar-divider"></span>
    <div class="redline-map-toolbar-group" aria-label="编辑工具">
      <button type="button" data-toolbar-tool="node" class="${
        state.activeTool === "node" ? "is-active" : ""
      }">节点编辑</button>
      <button type="button" data-toolbar-tool="insert" class="${
        state.activeTool === "insert" ? "is-active" : ""
      }">边线加点</button>
      <button type="button" data-toolbar-tool="delete" class="${
        state.activeTool === "delete" ? "is-active" : ""
      }">删除节点</button>
      <button type="button" data-toolbar-tool="freeTransform" class="${
        freeActive ? "is-active" : ""
      }" aria-pressed="${freeActive}" ${canTransform ? "" : "disabled"} title="${
        canTransform ? "" : "请先完成红线闭合"
      }">
        ${freeActive ? "完成变换" : "自由变换"}
      </button>
    </div>
    <span class="redline-map-toolbar-divider"></span>
    <div class="redline-map-toolbar-group" aria-label="变换操作">
      <button type="button" data-toolbar-action="flip-horizontal" ${
        canTransform ? "" : "disabled"
      } title="${canTransform ? "" : "请先完成红线闭合"}">水平翻转</button>
      <button type="button" data-toolbar-action="flip-vertical" ${
        canTransform ? "" : "disabled"
      } title="${canTransform ? "" : "请先完成红线闭合"}">垂直翻转</button>
    </div>
    <span class="redline-map-toolbar-divider"></span>
    <div class="redline-map-toolbar-group is-confirm" aria-label="确认操作">
      ${
        isDrawing
          ? `<button type="button" data-toolbar-action="complete" ${
              points.length >= 3 ? "" : "disabled"
            } title="${
              points.length >= 3 ? "" : "至少添加 3 个节点后才能闭合"
            }">完成闭合</button>`
          : ""
      }
      <span class="redline-toolbar-tooltip" title="${validationError}">
        <button type="button" class="is-primary" data-toolbar-action="confirm" ${
          validationError ? "disabled" : ""
        }>确认用地红线</button>
      </span>
    </div>
  `;
  toolbar.querySelectorAll("[data-toolbar-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      const tool = button.dataset.toolbarTool;
      if (tool === "freeTransform") {
        setActiveTool("freeTransform");
        return;
      }
      setActiveTool(tool);
      const action = {
        node: "节点编辑",
        insert: "边线加点",
        delete: "删除节点"
      }[tool];
      action && runNativeEditorAction(state.activeBody, action);
    });
  });
  toolbar.querySelectorAll("[data-toolbar-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.toolbarAction;
      if (
        [
          "undo",
          "redo",
          "flip-horizontal",
          "flip-vertical",
          "complete",
          "confirm"
        ].includes(action)
      ) {
        if (state.activeTool === "freeTransform") setActiveTool("node");
      }
      if (action === "undo") runNativeEditorAction(state.activeBody, "撤销");
      if (action === "redo") runNativeEditorAction(state.activeBody, "重做");
      if (action === "flip-horizontal") flipRedline("horizontal");
      if (action === "flip-vertical") flipRedline("vertical");
      if (action === "complete") completeCurrentRedline();
      if (action === "confirm") confirmCurrentRedline();
    });
  });
  syncMapToolbarLayout();
};

const focusImportedMapEdit = () => {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      (
        document.querySelector(".image-redline-import-summary") ||
        document.querySelector(".image-redline-map-edit")
      )?.scrollIntoView({ behavior: "auto", block: "start" });
    });
  });
};

const importSelectedCandidate = () => {
  const candidate = state.candidates[state.selectedCandidate];
  if (!candidate) {
    setMessage("", "请先选择一个候选轮廓。");
    return;
  }
  state.imported = true;
  state.importPanelCollapsed = true;
  state.placementConfirmed = false;
  state.transformAngle = 0;
  state.message = "候选轮廓已导入地图。请调整位置、比例和方向后确认。";
  state.error = "";
  dispatchImport({
    points: candidate.points,
    aspect: candidate.aspect
  });
  renderActiveShell();
  focusImportedMapEdit();
};

const findNativeButton = (body, label) =>
  [...body.querySelectorAll("button")].find((button) =>
    text(button).includes(label)
  );

const clickNativeButton = (body, label) => {
  const button = findNativeButton(body, label);
  if (!button || button.disabled) return false;
  button.click();
  return true;
};

const resetImageImportState = () => {
  state.fileName = "";
  state.sourceCanvas = null;
  state.candidates = [];
  state.selectedCandidate = -1;
  state.recognitionStatus = "idle";
  state.message = "";
  state.error = "";
  state.imported = false;
  state.importPanelCollapsed = false;
  state.placementConfirmed = false;
  state.transformAngle = 0;
};

const clearImportedResult = (body) => {
  const clearButton = [...body.querySelectorAll("button")].find(
    (button) => text(button) === "清除红线"
  );
  if (clearButton && !clearButton.disabled) clearButton.click();
  resetImageImportState();
  window.__ARCHICONCEPT_REDLINE_SOURCE__ = "manual_draw";
  renderActiveShell();
};

const drawPreview = (canvas) => {
  if (!canvas || !state.sourceCanvas) return;
  const context = canvas.getContext("2d");
  const source = state.sourceCanvas;
  const ratio = window.devicePixelRatio || 1;
  const displayWidth = Math.max(260, canvas.clientWidth || 300);
  const displayHeight = Math.min(230, Math.max(150, displayWidth / (source.width / source.height)));
  canvas.width = Math.round(displayWidth * ratio);
  canvas.height = Math.round(displayHeight * ratio);
  context.scale(ratio, ratio);
  context.clearRect(0, 0, displayWidth, displayHeight);
  const fit = Math.min(displayWidth / source.width, displayHeight / source.height);
  const width = source.width * fit;
  const height = source.height * fit;
  const left = (displayWidth - width) / 2;
  const top = (displayHeight - height) / 2;
  context.fillStyle = "#f4f4f2";
  context.fillRect(0, 0, displayWidth, displayHeight);
  context.drawImage(source, left, top, width, height);

  const candidate = state.candidates[state.selectedCandidate];
  if (!candidate) return;
  context.beginPath();
  candidate.previewPoints.forEach((point, index) => {
    const x = left + point.x * width;
    const y = top + point.y * height;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
  context.fillStyle = "rgba(17, 24, 39, 0.12)";
  context.strokeStyle = "#111827";
  context.lineWidth = 2;
  context.fill();
  context.stroke();
};

const statusMarkup = () => {
  if (state.error) {
    return `<div class="image-redline-status is-error">${state.error}</div>`;
  }
  if (state.message) {
    return `<div class="image-redline-status">${state.message}</div>`;
  }
  return "";
};

const candidateMarkup = () => {
  if (!state.candidates.length) return "";
  return `
    <div class="image-redline-candidates">
      <div class="image-redline-section-label">候选轮廓</div>
      <div class="image-redline-candidate-list">
        ${state.candidates
          .map(
            (candidate, index) => `
              <label class="image-redline-candidate ${
                state.selectedCandidate === index ? "is-selected" : ""
              }">
                <input type="radio" name="image-redline-candidate" value="${index}" ${
                  state.selectedCandidate === index ? "checked" : ""
                }>
                <span>
                  <strong>候选 ${index + 1}</strong>
                  <small>${candidate.maskName} · 约 ${(
                    candidate.coverage * 100
                  ).toFixed(1)}% 图幅</small>
                </span>
              </label>
            `
          )
          .join("")}
      </div>
    </div>
  `;
};

const editMarkup = (showClearAction = true) => {
  const redline = state.redline || {};
  const displayStatus =
    state.editorState === "drawing"
      ? "绘制中"
      : redline.status === "已确认"
        ? "已确认"
        : "待确认";
  return `
    <div class="image-redline-map-edit">
      <div class="image-redline-map-heading">
        <strong>当前红线</strong>
      </div>
      <div class="image-redline-metrics">
        <span>面积 <strong>${Math.round(redline.areaM2 || 0).toLocaleString()} ㎡</strong></span>
        <span>周长 <strong>${Math.round(redline.perimeterM || 0).toLocaleString()} m</strong></span>
        <span>节点 <strong>${(redline.points || []).length} 个</strong></span>
        <span>状态 <strong>${displayStatus}</strong></span>
      </div>
      ${
        showClearAction
          ? `<button type="button" class="image-redline-quiet image-redline-clear-current" data-action="clear-current">清除红线</button>`
          : ""
      }
    </div>
  `;
};

const runNativeEditorAction = (body, action) => {
  const modeByAction = {
    节点编辑: "node",
    边线加点: "insert",
    整体移动: "move",
    删除节点: "delete"
  };
  if (modeByAction[action]) {
    window.dispatchEvent(
      new CustomEvent("archiconcept:redline-mode", {
        detail: { mode: modeByAction[action] }
      })
    );
  }
  if (clickNativeButton(body, action)) return true;
  const reEdit = findNativeButton(body, "重新编辑");
  if (!reEdit || reEdit.disabled) return Boolean(modeByAction[action]);
  reEdit.click();
  window.setTimeout(() => clickNativeButton(body, action), 50);
  return true;
};

const acquisitionMarkup = (hasEditableRedline) => {
  const source =
    state.redline.source ||
    window.__ARCHICONCEPT_REDLINE_SOURCE__ ||
    "manual_draw";
  if (hasEditableRedline) {
    const imageSource = source === "image_import";
    return `
      <div class="image-redline-import-summary">
        <div>
          <strong>${imageSource ? "图片轮廓已导入地图" : "手动绘制轮廓已生成"}</strong>
          <span>${
            imageSource
              ? `${state.fileName || "已识别图片"} · 已进入统一地图编辑`
              : "闭合多边形已进入统一地图编辑"
          }</span>
        </div>
        <button type="button" class="image-redline-secondary" data-action="${
          imageSource
            ? state.importPanelCollapsed
              ? "expand-import"
              : "collapse-import"
            : "restart-acquisition"
        }">
          ${
            imageSource
              ? state.importPanelCollapsed
                ? "查看识别结果"
                : "收起识别结果"
              : "重新绘制"
          }
        </button>
      </div>
      ${
        imageSource && !state.importPanelCollapsed
          ? `
            <div class="image-redline-acquisition-detail">
              ${
                state.sourceCanvas
                  ? `<div class="image-redline-preview"><canvas data-role="preview" aria-label="上传图片与候选轮廓预览"></canvas></div>`
                  : ""
              }
              ${candidateMarkup()}
              ${statusMarkup()}
              <div class="image-redline-actions">
                <button type="button" class="image-redline-secondary" data-action="recognize">重新识别候选</button>
                <button type="button" class="image-redline-primary" data-action="import" ${
                  state.selectedCandidate < 0 ? "disabled" : ""
                }>重新导入所选轮廓</button>
              </div>
            </div>
          `
          : ""
      }
    `;
  }
  if (state.mode === "manual") {
    const hasPoints = (state.redline.points || []).length > 0;
    return `
      <div class="image-redline-heading">
        <h4>手动绘制红线</h4>
        <p>在地图上逐点绘制红线，双击或点击首点完成闭合。</p>
      </div>
      <div class="image-redline-manual-actions">
        <button type="button" class="image-redline-primary" data-action="manual-draw">
          ${hasPoints ? "重新绘制" : "开始绘制红线"}
        </button>
        ${
          hasPoints
            ? `<button type="button" class="image-redline-quiet" data-action="clear-current">清除红线</button>`
            : ""
        }
      </div>
    `;
  }
  return `
    <input type="file" data-role="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" hidden>
    ${
      !state.sourceCanvas
        ? `
          <div class="image-redline-heading">
            <h4>图片识别导入</h4>
            <p>上传线条清晰的场地图，选择轮廓并导入地图。支持 JPG、PNG、PDF，文件上限 15 MB。</p>
          </div>
          <div class="image-redline-manual-actions">
            <button type="button" class="image-redline-primary" data-action="upload">上传图片</button>
          </div>
        `
        : `
          <div class="image-redline-import-summary">
            <div>
              <strong>${state.fileName || "已上传图片"}</strong>
              <span>选择候选轮廓后导入地图</span>
            </div>
            <button type="button" class="image-redline-secondary" data-action="upload">重新上传</button>
          </div>
          <div class="image-redline-preview"><canvas data-role="preview" aria-label="上传图片与候选轮廓预览"></canvas></div>
        `
    }
    ${candidateMarkup()}
    ${statusMarkup()}
    ${
      state.sourceCanvas
        ? `
          <div class="image-redline-actions">
            <button type="button" class="image-redline-secondary" data-action="recognize" ${
              state.recognitionStatus === "recognizing" ? "disabled" : ""
            }>${
              state.recognitionStatus === "recognizing"
                ? "正在识别..."
                : "识别候选轮廓"
            }</button>
            <button type="button" class="image-redline-primary" data-action="import" ${
              state.selectedCandidate < 0 ? "disabled" : ""
            }>导入到地图</button>
            <button type="button" class="image-redline-quiet" data-action="clear">清除识别结果</button>
          </div>
        `
        : ""
    }
  `;
};

const renderShell = (shell, body) => {
  const isConfirmed = state.redline.status === "已确认";
  const pointCount = (state.redline.points || []).length;
  const hasAnyRedline = pointCount > 0 && !isConfirmed;
  const hasEditableRedline =
    pointCount >= 3 &&
    state.editorState !== "drawing" &&
    !isConfirmed;
  body.classList.toggle("redline-unified-edit-mode", !isConfirmed);
  body.classList.remove("redline-image-mode");
  shell.innerHTML = `
    <div class="image-redline-mode-tabs" role="tablist" aria-label="红线获取方式">
      <button type="button" role="tab" data-mode="manual" aria-selected="${
        state.mode === "manual"
      }" class="${state.mode === "manual" ? "is-active" : ""}" ${
        hasAnyRedline ? "disabled" : ""
      }>手动绘制</button>
      <button type="button" role="tab" data-mode="image" aria-selected="${
        state.mode === "image"
      }" class="${state.mode === "image" ? "is-active" : ""}" ${
        hasAnyRedline ? "disabled" : ""
      }>图片识别导入</button>
    </div>
    ${
      isConfirmed
        ? ""
        : `<div class="image-redline-panel ${
            hasEditableRedline ? "is-unified-edit" : "is-acquisition"
          }">
            ${acquisitionMarkup(hasEditableRedline)}
            ${hasAnyRedline ? editMarkup(hasEditableRedline) : ""}
          </div>`
    }
  `;

  shell.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      const hasEditableRedline =
        (state.redline.points || []).length >= 3 &&
        state.redline.status !== "已确认";
      body.style.paddingTop =
        state.redline.status === "已确认" ? "62px" : "16px";
      renderShell(shell, body);
      syncPortalLayout();
    });
  });

  const fileInput = shell.querySelector('[data-role="file"]');
  shell.querySelector('[data-action="upload"]')?.addEventListener("click", () =>
    fileInput?.click()
  );
  fileInput?.addEventListener("change", () => handleFile(fileInput.files?.[0]));
  shell
    .querySelector('[data-action="recognize"]')
    ?.addEventListener("click", recognizeContours);
  shell
    .querySelector('[data-action="import"]')
    ?.addEventListener("click", importSelectedCandidate);
  shell
    .querySelector('[data-action="clear"]')
    ?.addEventListener("click", () => clearImportedResult(body));
  shell
    .querySelector('[data-action="expand-import"]')
    ?.addEventListener("click", () => {
      state.importPanelCollapsed = false;
      renderShell(shell, body);
      syncPortalLayout();
    });
  shell
    .querySelector('[data-action="collapse-import"]')
    ?.addEventListener("click", () => {
      state.importPanelCollapsed = true;
      renderShell(shell, body);
      syncPortalLayout();
    });
  shell
    .querySelector('[data-action="restart-acquisition"]')
    ?.addEventListener("click", () => {
      const clearButton = findNativeButton(body, "清除红线");
      clearButton?.click();
      state.placementConfirmed = false;
      window.__ARCHICONCEPT_REDLINE_SOURCE__ = "manual_draw";
    });
  shell
    .querySelector('[data-action="manual-draw"]')
    ?.addEventListener("click", () => {
      const hasPoints = (state.redline.points || []).length > 0;
      if (hasPoints) {
        findNativeButton(body, "清除红线")?.click();
        window.setTimeout(
          () => findNativeButton(body, "开始绘制红线")?.click(),
          50
        );
      } else {
        findNativeButton(body, "开始绘制红线")?.click();
      }
    });

  shell.querySelectorAll('input[name="image-redline-candidate"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.selectedCandidate = Number(input.value);
      state.error = "";
      state.message = "已选择候选轮廓，可导入地图。";
      renderShell(shell, body);
    });
  });

  shell
    .querySelector('[data-action="clear-current"]')
    ?.addEventListener("click", () => {
      const clearButton = findNativeButton(body, "清除红线");
      clearButton?.click();
      state.placementConfirmed = false;
      state.activeTool = "node";
    });

  drawPreview(shell.querySelector('[data-role="preview"]'));
  renderMapEditingOverlays();
  renderMapToolbar();
};

const renderActiveShell = () => {
  const body = state.activeBody;
  if (!body?.isConnected) return;
  const shell = document.querySelector(".image-redline-portal");
  if (shell) {
    renderShell(shell, body);
    syncPortalLayout();
  }
};

const locateRedlineBody = () => {
  const title = [...document.querySelectorAll("span")].find(
    (element) => text(element) === "2/4 用地红线"
  );
  if (!title) return null;
  let card = title.parentElement;
  while (card && card.parentElement) {
    if (
      card.children.length === 2 &&
      text(card.children[0]).includes("2/4 用地红线") &&
      String(card.children[1].className).includes("p-4")
    ) {
      return card.children[1];
    }
    card = card.parentElement;
  }
  return null;
};

const installShell = () => {
  const body = locateRedlineBody();
  if (!body) {
    clearTransformOverlays();
    clearActivationOverlays();
    state.mapToolbar?.remove();
    state.mapToolbar = null;
    state.activeBody?.classList.remove(
      "redline-image-mode",
      "redline-unified-edit-mode"
    );
    if (state.activeBody) {
      state.activeBody.style.removeProperty("padding-top");
      state.activeBody.style.removeProperty("min-height");
    }
    state.activeBody = null;
    document.querySelector(".image-redline-portal")?.remove();
    return;
  }
  const bodyChanged = state.activeBody !== body;
  if (bodyChanged) {
    state.activeBody?.classList.remove(
      "redline-image-mode",
      "redline-unified-edit-mode"
    );
    if (state.activeBody) {
      state.activeBody.style.removeProperty("padding-top");
      state.activeBody.style.removeProperty("min-height");
    }
    state.activeBody = body;
    state.mode = "manual";
  }
  let shell = document.querySelector(".image-redline-portal");
  const shellCreated = !shell;
  if (!shell) {
    shell = document.createElement("div");
    shell.className = "image-redline-shell image-redline-portal";
  }
  if (shell.parentElement !== document.body) {
    document.body.appendChild(shell);
  }
  const hasEditableRedline =
    (state.redline.points || []).length >= 3 &&
    state.redline.status !== "已确认";
  body.style.paddingTop =
    state.redline.status === "已确认" ? "62px" : "16px";
  if (bodyChanged || shellCreated) {
    renderShell(shell, body);
  }
  syncPortalLayout();
  bindTransformMap(window.__ARCHICONCEPT_MAP__);
};

const bindTransformMap = (map) => {
  if (!map || state.map === map && state.mapEventsBound) return;
  state.map = map;
  state.mapEventsBound = true;
  map.on?.("zoomend", () => {
    renderMapEditingOverlays();
    syncMapToolbarLayout();
  });
  map.on?.("moveend", () => {
    renderMapEditingOverlays();
    syncMapToolbarLayout();
  });
  map.on?.("click", () => {
    if (
      state.activeTool === "freeTransform" &&
      !state.transforming &&
      performance.now() > state.ignoreBlankMapClickUntil
    ) {
      setActiveTool("node");
    }
  });
  map.getContainer()?.addEventListener("pointerdown", (event) => {
    if (
      state.activeTool === "freeTransform" &&
      !state.transforming &&
      performance.now() > state.ignoreBlankMapClickUntil &&
      !event.target.closest(
        ".redline-transform-handle,.redline-transform-move-surface"
      )
    ) {
      setActiveTool("node");
    }
  }, true);
  renderMapEditingOverlays();
  renderMapToolbar();
};

const syncPortalLayout = () => {
  const body = state.activeBody;
  const shell = document.querySelector(".image-redline-portal");
  if (!body?.isConnected || !shell) return;
  const rect = body.getBoundingClientRect();
  const inset = 22;
  let scrollContainer = body.parentElement;
  while (scrollContainer && scrollContainer !== document.body) {
    const overflowY = window.getComputedStyle(scrollContainer).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") break;
    scrollContainer = scrollContainer.parentElement;
  }
  const containerRect =
    scrollContainer && scrollContainer !== document.body
      ? scrollContainer.getBoundingClientRect()
      : {
          top: 0,
          bottom: window.innerHeight
        };
  const availableHeight = Math.max(
    260,
    Math.min(
      620,
      (scrollContainer?.clientHeight || window.innerHeight) - inset * 2
    )
  );
  const shellTop = rect.top + inset;
  const visibleAvailableHeight = Math.max(
    260,
    Math.min(availableHeight, containerRect.bottom - inset - shellTop)
  );
  shell.style.left = `${Math.round(rect.left + inset)}px`;
  shell.style.top = `${Math.round(shellTop)}px`;
  shell.style.width = `${Math.max(250, Math.round(rect.width - inset * 2))}px`;
  const hasEditableRedline =
    (state.redline.points || []).length >= 3 &&
    state.redline.status !== "已确认";
  const needsScrollablePortal =
    (state.mode === "image" && Boolean(state.sourceCanvas)) ||
    hasEditableRedline;
  shell.style.maxHeight = needsScrollablePortal
    ? `${visibleAvailableHeight}px`
    : "none";
  const visibleShellHeight = needsScrollablePortal
    ? Math.min(shell.scrollHeight, visibleAvailableHeight)
    : shell.scrollHeight;
  body.style.minHeight = `${Math.max(
    128,
    visibleShellHeight + inset * 2
  )}px`;
  shell.style.removeProperty("clip-path");
  syncMapToolbarLayout();
};

window.addEventListener("archiconcept:redline-state", (event) => {
  const previousPoints = state.redline.points || [];
  const previousSource = state.redline.source;
  const nextSignature = (event.detail.points || [])
    .map((point) => `${point.lng.toFixed(9)},${point.lat.toFixed(9)}`)
    .join("|");
  if (
    state.geometrySignature &&
    nextSignature &&
    nextSignature !== state.geometrySignature
  ) {
    state.placementConfirmed = false;
  }
  state.geometrySignature = nextSignature;
  state.redline = event.detail;
  const pointCount = event.detail.points?.length || 0;
  if (event.detail.status === "已确认") {
    state.editorState = "confirmed";
    state.activeTool = "node";
  } else if (pointCount >= 3) {
    const remainsManualDrawing =
      event.detail.source === "manual_draw" &&
      event.detail.status === "编辑中" &&
      (state.editorState === "drawing" || previousPoints.length < 3);
    if (previousPoints.length < 3 || previousSource !== event.detail.source) {
      state.activeTool = "node";
    }
    state.editorState =
      remainsManualDrawing
        ? "drawing"
        : state.activeTool === "freeTransform"
        ? "freeTransform"
        : "polygonEditing";
  } else {
    state.activeTool = "node";
    state.editorState =
      event.detail.status === "编辑中" ? "drawing" : "idle";
  }
  if (event.detail.source === "image_import" && event.detail.points?.length >= 3) {
    state.imported = true;
    state.mode = "image";
  } else if (event.detail.source === "manual_draw") {
    state.mode = "manual";
  }
  renderActiveShell();
  renderMapEditingOverlays();
  renderMapToolbar();
});

window.addEventListener("archiconcept:map-ready", (event) => {
  bindTransformMap(event.detail?.map || window.__ARCHICONCEPT_MAP__);
});

window.addEventListener("archiconcept:site-location-reset", () => {
  resetImageImportState();
  state.mode = "manual";
  state.activeTool = "node";
  state.editorState = "idle";
  state.geometrySignature = "";
  clearTransformOverlays();
  clearActivationOverlays();
  renderActiveShell();
});

document.addEventListener(
  "click",
  (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const label = text(button);
    if (label === "开始绘制红线" || label === "创建矩形范围") {
      window.__ARCHICONCEPT_REDLINE_SOURCE__ = "manual_draw";
      state.imported = false;
      state.placementConfirmed = false;
    }
  },
  true
);

const observer = new MutationObserver((mutations) => {
  syncEditorPageScrollLock();
  const portal = document.querySelector(".image-redline-portal");
  if (
    portal &&
    mutations.every(
      (mutation) =>
        mutation.target === portal || portal.contains(mutation.target)
    )
  ) {
    return;
  }
  window.clearTimeout(observer.timer);
  observer.timer = window.setTimeout(installShell, 20);
});

observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener("resize", () => {
  syncPortalLayout();
  syncMapToolbarLayout();
});
document.addEventListener("scroll", syncPortalLayout, true);
syncEditorPageScrollLock();
installShell();
