const DATA_CHAIN_SCHEMA_VERSION = 1;
const STORAGE_KEY = "archiconcept:project-data-chain:v1";

const PACKAGE_ORDER = [
  "boundaryAnchorPackage",
  "siteAnalysisPackage",
  "functionConstructPackage",
  "conceptStrategyPackage",
  "massingPlacementPackage",
  "finalConceptPackage"
];

const PACKAGE_STEPS = Object.freeze({
  boundaryAnchorPackage: 1,
  siteAnalysisPackage: 2,
  functionConstructPackage: 3,
  conceptStrategyPackage: 4,
  massingPlacementPackage: 5,
  finalConceptPackage: 6
});

const STALE_DEPENDENCIES = Object.freeze({
  boundaryAnchorPackage: PACKAGE_ORDER.slice(1),
  siteAnalysisPackage: [
    "conceptStrategyPackage",
    "massingPlacementPackage",
    "finalConceptPackage"
  ],
  functionConstructPackage: [
    "conceptStrategyPackage",
    "massingPlacementPackage",
    "finalConceptPackage"
  ],
  conceptStrategyPackage: [
    "massingPlacementPackage",
    "finalConceptPackage"
  ],
  massingPlacementPackage: ["finalConceptPackage"],
  finalConceptPackage: []
});

const COMPLETION_STATUSES = new Set([
  "empty",
  "partial",
  "ready",
  "confirmed"
]);
const CONFIDENCE_LEVELS = new Set(["high", "medium", "low"]);
const SOURCE_TYPES = new Set([
  "userInput",
  "importedBrief",
  "mapAPI",
  "systemInference",
  "manualEdit",
  "legacyMigration"
]);

const now = () => new Date().toISOString();
const clone = (value) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const asArray = (value) => (Array.isArray(value) ? clone(value) : []);
const asObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? clone(value)
    : {};
const hasValue = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const createPackage = (packageName) => {
  const timestamp = now();
  return {
    packageName,
    step: PACKAGE_STEPS[packageName],
    completionStatus: "empty",
    confidenceLevel: "low",
    blockingItems: [],
    assumptions: [],
    sourceTrace: {},
    downstreamHints: {},
    stale: false,
    staleReasons: [],
    revision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    confirmedAt: null,
    data: {}
  };
};

const createProjectDataChain = (seed = {}) => {
  const timestamp = now();
  const chain = {
    schemaVersion: DATA_CHAIN_SCHEMA_VERSION,
    projectId: seed.projectId || globalThis.crypto?.randomUUID?.() || `project-${Date.now()}`,
    currentStep: Number(seed.currentStep) || 1,
    createdAt: seed.createdAt || timestamp,
    updatedAt: timestamp,
    revision: Number(seed.revision) || 0,
    revisionHistory: asArray(seed.revisionHistory),
    metadata: asObject(seed.metadata)
  };

  PACKAGE_ORDER.forEach((packageName) => {
    chain[packageName] = {
      ...createPackage(packageName),
      ...asObject(seed[packageName]),
      packageName,
      step: PACKAGE_STEPS[packageName],
      data: asObject(seed[packageName]?.data)
    };
  });

  return chain;
};

const normalizeCompletionStatus = (value, data) => {
  if (COMPLETION_STATUSES.has(value)) return value;
  return Object.keys(data || {}).length ? "partial" : "empty";
};

const normalizeConfidence = (value) =>
  CONFIDENCE_LEVELS.has(value) ? value : "low";

const normalizeSourceType = (value) =>
  SOURCE_TYPES.has(value) ? value : "systemInference";

const makeSourceTrace = (source, fields = [], detail = {}) => {
  const sourceType = normalizeSourceType(source);
  const timestamp = now();
  return fields.reduce((trace, field) => {
    if (!field) return trace;
    trace[field] = {
      source: sourceType,
      updatedAt: timestamp,
      ...asObject(detail)
    };
    return trace;
  }, {});
};

const mergeSourceTrace = (current, incoming) => {
  const next = { ...asObject(current) };
  Object.entries(asObject(incoming)).forEach(([field, trace]) => {
    next[field] = {
      ...asObject(next[field]),
      ...asObject(trace),
      source: normalizeSourceType(trace?.source),
      updatedAt: trace?.updatedAt || now()
    };
  });
  return next;
};

const buildBoundaryData = (brief = {}) => ({
  projectIdentity: {
    projectName: brief.name || brief.projectName || "",
    buildingType: brief.type || brief.buildingType || "",
    location: brief.location || ""
  },
  hardControls: {
    siteAreaM2: brief.area || brief.siteArea || "",
    grossFloorAreaM2: brief.gfa || "",
    floorAreaRatio: brief.far || "",
    buildingDensityPercent: brief.density || brief.buildingDensity || "",
    greenRatioPercent: brief.greenery || brief.greenRatio || "",
    heightLimitM: brief.height || brief.heightLimit || "",
    floorRange: brief.floors || "",
    buildableBoundaryAreaM2:
      brief.buildableArea || brief.buildableBoundaryArea || ""
  },
  areaProgram: brief.areaProgram || "",
  functionRequirements: {
    program: brief.needs || brief.program || "",
    targetUsers: brief.users || brief.targetUsers || "",
    siteCondition: brief.siteCondition || brief.siteInfo || ""
  },
  normConstraints: asArray(brief.normConstraints),
  missingItems: asArray(brief.validationSkippedDetails),
  conflicts: asArray(brief.conflicts)
});

const inferBoundaryStatus = (brief = {}) => {
  const required = [
    brief.name || brief.projectName,
    brief.type || brief.buildingType,
    brief.area || brief.siteArea,
    brief.needs || brief.program || brief.siteCondition || brief.siteInfo
  ];
  const completed = required.filter(hasValue).length;
  if (completed === required.length) return "ready";
  return completed > 0 ? "partial" : "empty";
};

const adaptSitePackage = (site = {}) => ({
  siteLocation: clone(site.location || site.siteLocation || null),
  redline: clone(site.boundary || site.redline || null),
  accessPoints: asArray(site.entrances || site.accessPoints),
  poiContext: asObject(site.surroundings || site.poiContext),
  analysisRadiusM: site.analysisRadiusM || site.radius || null,
  siteLimits: asArray(site.siteLimits),
  siteOpportunities: asArray(site.siteOpportunities),
  swot: asObject(site.swot),
  climateNotes: asArray(site.climateNotes),
  designImpactHints: asArray(site.designImpactHints)
});

const inferSiteStatus = (site = {}) => {
  const location = site.location || site.siteLocation;
  const redline = site.boundary || site.redline;
  if (location && redline?.geometry?.length >= 3) {
    return redline.status === "已确认" || redline.status === "confirmed"
      ? "confirmed"
      : "ready";
  }
  if (location || redline) return "partial";
  return "empty";
};

const legacyAdapters = Object.freeze({
  boundaryAnchorPackage(legacy = {}, context = {}) {
    const brief = legacy.projectData || legacy.brief || legacy;
    const skipped = asArray(brief.validationSkippedDetails);
    return {
      completionStatus: inferBoundaryStatus(brief),
      confidenceLevel: skipped.length ? "medium" : "high",
      blockingItems: asArray(context.blockingItems),
      assumptions: skipped.map((item) => ({
        key: item.key || item.field,
        value: item.state || "待确认",
        reason: item.impact || "",
        source: "userInput"
      })),
      sourceTrace: makeSourceTrace(
        context.source === "import" ? "importedBrief" : "userInput",
        [
          "projectIdentity",
          "hardControls",
          "areaProgram",
          "functionRequirements"
        ]
      ),
      downstreamHints: {
        validationSkipped: asObject(brief.validationSkipped)
      },
      data: buildBoundaryData(brief)
    };
  },

  siteAnalysisPackage(legacy = {}) {
    const site =
      legacy.siteIntelligencePackage ||
      legacy.siteAnalysisPackage ||
      legacy.sitePackage ||
      legacy;
    return {
      completionStatus: inferSiteStatus(site),
      confidenceLevel:
        site?.boundary?.geometry?.length >= 3 ? "high" : "medium",
      sourceTrace: makeSourceTrace("mapAPI", [
        "siteLocation",
        "redline",
        "accessPoints",
        "poiContext"
      ]),
      data: adaptSitePackage(site)
    };
  },

  functionConstructPackage(legacy = {}) {
    const project = legacy.projectData || legacy;
    const spatial = legacy.spatialIntentAnalysis || legacy.spatialIntent || {};
    const answers = asObject(legacy.followUpAnswers || legacy.answers);
    const functionData = {
      functionTree: asArray(legacy.functionTree),
      areaAllocation: project.areaProgram || legacy.areaAllocation || "",
      functionAttributes: asObject(legacy.functionAttributes),
      relationshipGraph: asObject(legacy.relationshipGraph),
      circulationSystem: asObject(legacy.circulationSystem),
      conflicts: asArray(legacy.conflicts),
      legacySpatialIntent: clone(spatial),
      legacyAnswers: answers
    };
    const hasContent =
      hasValue(functionData.areaAllocation) ||
      Object.keys(spatial).length > 0 ||
      Object.keys(answers).length > 0;
    return {
      completionStatus: hasContent ? "partial" : "empty",
      confidenceLevel: hasContent ? "medium" : "low",
      sourceTrace: makeSourceTrace("legacyMigration", [
        "areaAllocation",
        "legacySpatialIntent",
        "legacyAnswers"
      ]),
      data: functionData
    };
  },

  conceptStrategyPackage(legacy = {}) {
    const problems =
      legacy.problemAnalysis || legacy.analyzedData || legacy.problemResult || {};
    const strategy =
      legacy.strategyMatchAnalysis || legacy.strategyPackage || {};
    const hasProblems =
      asArray(problems.problemCards || problems.issues).length > 0;
    const hasStrategy =
      asArray(strategy.strategyCards || strategy.strategies).length > 0;
    return {
      completionStatus: hasStrategy ? "ready" : hasProblems ? "partial" : "empty",
      confidenceLevel: hasStrategy ? "high" : hasProblems ? "medium" : "low",
      sourceTrace: makeSourceTrace("legacyMigration", [
        "coreProblems",
        "designStrategies",
        "strategyBindings"
      ]),
      data: {
        coreProblems: asArray(problems.problemCards || problems.issues),
        problemEvidence: asArray(problems.problemEvidence),
        designStrategies: asArray(
          strategy.strategyCards || strategy.strategies
        ),
        conceptName: strategy.conceptName || "",
        conceptStatement:
          strategy.strategyDirection || strategy.conceptStatement || "",
        strategyBindings: asArray(strategy.strategyBindings),
        legacyProblemAnalysis: clone(problems),
        legacyStrategyAnalysis: clone(strategy)
      }
    };
  },

  massingPlacementPackage(legacy = {}) {
    const concept =
      legacy.prototypeGenerationAnalysis ||
      legacy.conceptPlanPackage ||
      legacy.prototype ||
      legacy;
    const options = asArray(concept.prototypes || concept.massingOptions);
    return {
      completionStatus: options.length >= 2 ? "ready" : options.length ? "partial" : "empty",
      confidenceLevel: options.length >= 2 ? "medium" : "low",
      sourceTrace: makeSourceTrace("legacyMigration", [
        "massingOptions",
        "metricCheck",
        "programPlacement"
      ]),
      data: {
        entryLayout: asObject(concept.entryLayout),
        massingOptions: options,
        operationChain: asArray(concept.operationChain),
        metricCheck: asObject(concept.baseline || concept.metricCheck),
        sitePlanDraft: clone(concept.sitePlanDraft || concept.diagramData || null),
        programPlacement: asObject(concept.programPlacement),
        legacyConceptPlan: clone(concept)
      }
    };
  },

  finalConceptPackage(legacy = {}) {
    const finalData =
      legacy.finalConceptPackage ||
      legacy.explanationOutput ||
      legacy.outcome ||
      legacy;
    const selected = finalData.selectedOption || finalData.selectedPrototypeId;
    return {
      completionStatus: selected ? "confirmed" : "empty",
      confidenceLevel: selected ? "medium" : "low",
      sourceTrace: makeSourceTrace("legacyMigration", [
        "selectedOption",
        "validationRecords",
        "exportReport"
      ]),
      data: {
        optionScores: asArray(finalData.optionScores),
        hardCheckResults: asArray(finalData.hardCheckResults),
        selectedOption: clone(selected || null),
        validationRecords: asArray(finalData.validationRecords),
        riskFlags: asArray(finalData.riskFlags),
        exportReport: clone(finalData.exportReport || null),
        legacyOutcome: clone(finalData)
      }
    };
  }
});

const migrateLegacyProject = (legacy = {}, context = {}) => {
  const chain = createProjectDataChain({
    projectId: legacy.projectId,
    metadata: {
      migratedFromLegacy: true,
      migratedAt: now(),
      legacyInputSource: context.source || legacy.projectSource || "manual"
    }
  });

  PACKAGE_ORDER.forEach((packageName) => {
    const adapted = legacyAdapters[packageName](legacy, context);
    chain[packageName] = {
      ...chain[packageName],
      ...adapted,
      packageName,
      step: PACKAGE_STEPS[packageName],
      data: asObject(adapted.data)
    };
  });

  chain.updatedAt = now();
  return chain;
};

const createMemoryStorage = () => {
  let value = null;
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
    removeItem: () => {
      value = null;
    }
  };
};

const resolveStorage = () => {
  try {
    if (globalThis.localStorage) return globalThis.localStorage;
  } catch {
    // Browser privacy modes can deny storage access.
  }
  return createMemoryStorage();
};

class ProjectDataChainStore {
  constructor(options = {}) {
    this.storage = options.storage || resolveStorage();
    this.storageKey = options.storageKey || STORAGE_KEY;
    this.listeners = new Set();
    this.state = this.load() || createProjectDataChain();
  }

  load() {
    try {
      const saved = this.storage.getItem(this.storageKey);
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      return createProjectDataChain(parsed);
    } catch (error) {
      console.warn("[ARCHICONCEPT data chain] Failed to load saved data.", error);
      return null;
    }
  }

  persist() {
    this.storage.setItem(this.storageKey, JSON.stringify(this.state));
  }

  emit(type, detail = {}) {
    const event = { type, detail, state: this.getState() };
    this.listeners.forEach((listener) => listener(event));
    if (typeof globalThis.dispatchEvent === "function") {
      globalThis.dispatchEvent(
        new CustomEvent("archiconcept:data-chain-change", { detail: event })
      );
    }
  }

  getState() {
    return clone(this.state);
  }

  getPackage(packageName) {
    this.assertPackage(packageName);
    return clone(this.state[packageName]);
  }

  assertPackage(packageName) {
    if (!PACKAGE_ORDER.includes(packageName)) {
      throw new Error(`Unknown ARCHICONCEPT package: ${packageName}`);
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(seed = {}) {
    this.state = createProjectDataChain(seed);
    this.persist();
    this.emit("reset");
    return this.getState();
  }

  replace(nextState, options = {}) {
    this.state = createProjectDataChain(nextState);
    this.recordRevision("replace", options.reason || "Replace project data chain");
    this.persist();
    this.emit("replace", { reason: options.reason || "" });
    return this.getState();
  }

  setCurrentStep(step) {
    const normalized = Math.min(6, Math.max(1, Number(step) || 1));
    this.state.currentStep = normalized;
    this.state.updatedAt = now();
    this.persist();
    this.emit("step", { step: normalized });
  }

  recordRevision(type, reason, packageName = null, metadata = {}) {
    this.state.revision += 1;
    this.state.updatedAt = now();
    this.state.revisionHistory.push({
      revision: this.state.revision,
      type,
      packageName,
      reason,
      timestamp: this.state.updatedAt,
      ...asObject(metadata)
    });
    if (this.state.revisionHistory.length > 100) {
      this.state.revisionHistory = this.state.revisionHistory.slice(-100);
    }
  }

  markDownstreamStale(packageName, reason, options = {}) {
    this.assertPackage(packageName);
    const targets = STALE_DEPENDENCIES[packageName] || [];
    const timestamp = now();
    targets.forEach((targetName) => {
      const target = this.state[targetName];
      if (target.completionStatus === "empty" && !options.includeEmpty) return;
      target.stale = true;
      target.updatedAt = timestamp;
      target.staleReasons = [
        ...target.staleReasons.filter(
          (item) => item.sourcePackage !== packageName
        ),
        {
          sourcePackage: packageName,
          reason,
          timestamp
        }
      ];
    });
    return targets;
  }

  updatePackage(packageName, patch = {}, options = {}) {
    this.assertPackage(packageName);
    const current = this.state[packageName];
    const nextData = options.replaceData
      ? asObject(patch.data)
      : { ...asObject(current.data), ...asObject(patch.data) };
    const timestamp = now();
    const sourceTrace = mergeSourceTrace(
      current.sourceTrace,
      patch.sourceTrace ||
        makeSourceTrace(
          options.source || "systemInference",
          options.changedFields || Object.keys(asObject(patch.data)),
          options.sourceDetail
        )
    );

    const next = {
      ...current,
      ...asObject(patch),
      packageName,
      step: PACKAGE_STEPS[packageName],
      completionStatus: normalizeCompletionStatus(
        patch.completionStatus,
        nextData
      ),
      confidenceLevel: normalizeConfidence(
        patch.confidenceLevel || current.confidenceLevel
      ),
      blockingItems:
        patch.blockingItems === undefined
          ? current.blockingItems
          : asArray(patch.blockingItems),
      assumptions:
        patch.assumptions === undefined
          ? current.assumptions
          : asArray(patch.assumptions),
      downstreamHints:
        patch.downstreamHints === undefined
          ? current.downstreamHints
          : {
              ...asObject(current.downstreamHints),
              ...asObject(patch.downstreamHints)
            },
      sourceTrace,
      data: nextData,
      stale: false,
      staleReasons: [],
      revision: current.revision + 1,
      updatedAt: timestamp,
      confirmedAt:
        patch.completionStatus === "confirmed"
          ? timestamp
          : patch.confirmedAt === undefined
            ? current.confirmedAt
            : patch.confirmedAt
    };

    const meaningfulChange =
      JSON.stringify(current.data) !== JSON.stringify(next.data) ||
      current.completionStatus !== next.completionStatus ||
      JSON.stringify(current.assumptions) !== JSON.stringify(next.assumptions) ||
      JSON.stringify(current.blockingItems) !==
        JSON.stringify(next.blockingItems);

    this.state[packageName] = next;
    const reason =
      options.reason || `${packageName} updated from ${options.source || "system"}`;
    const staleTargets =
      meaningfulChange && options.invalidateDownstream !== false
        ? this.markDownstreamStale(packageName, reason)
        : [];
    this.recordRevision("package-update", reason, packageName, {
      staleTargets
    });
    this.persist();
    this.emit("package-update", { packageName, staleTargets, reason });
    return this.getPackage(packageName);
  }

  confirmPackage(packageName, options = {}) {
    const current = this.getPackage(packageName);
    return this.updatePackage(
      packageName,
      {
        completionStatus: "confirmed",
        confidenceLevel: options.confidenceLevel || current.confidenceLevel,
        blockingItems: options.blockingItems || current.blockingItems,
        data: current.data
      },
      {
        source: options.source || "userInput",
        reason: options.reason || `${packageName} confirmed`,
        invalidateDownstream: options.invalidateDownstream
      }
    );
  }

  migrateLegacy(legacy, context = {}) {
    const migrated = migrateLegacyProject(legacy, context);
    this.state = migrated;
    this.recordRevision(
      "legacy-migration",
      context.reason || "Migrate legacy project state"
    );
    this.persist();
    this.emit("legacy-migration");
    return this.getState();
  }

  syncLegacy(packageName, legacy, context = {}) {
    this.assertPackage(packageName);
    const adapted = legacyAdapters[packageName](legacy, context);
    return this.updatePackage(packageName, adapted, {
      replaceData: true,
      source: context.source || "legacyMigration",
      reason: context.reason || `Sync legacy data into ${packageName}`,
      invalidateDownstream: context.invalidateDownstream
    });
  }
}

const store = new ProjectDataChainStore();

let pendingProjectSync = null;

const bridge = {
  scheduleProjectBrief(projectData, source = "manual") {
    globalThis.clearTimeout?.(pendingProjectSync);
    pendingProjectSync = globalThis.setTimeout?.(
      () => this.syncProjectBrief(projectData, source),
      160
    );
  },

  syncProjectBrief(projectData, source = "manual") {
    store.syncLegacy(
      "boundaryAnchorPackage",
      { projectData },
      {
        source: source === "import" ? "importedBrief" : "userInput",
        reason: "Project brief changed"
      }
    );
    if (projectData?.siteIntelligencePackage) {
      store.syncLegacy(
        "siteAnalysisPackage",
        projectData.siteIntelligencePackage,
        {
          source: "mapAPI",
          reason: "Site editor data changed"
        }
      );
    }
    return store.getState();
  },

  syncProblemAnalysis(problemAnalysis, answers = {}) {
    store.syncLegacy(
      "conceptStrategyPackage",
      { problemAnalysis },
      {
        source: "systemInference",
        reason: "Legacy problem analysis changed"
      }
    );
    if (Object.keys(asObject(answers)).length) {
      store.syncLegacy(
        "functionConstructPackage",
        { followUpAnswers: answers },
        {
          source: "userInput",
          reason: "Legacy problem answers changed"
        }
      );
    }
  },

  syncSpatialIntent(spatialIntentAnalysis, answers = {}) {
    store.syncLegacy(
      "functionConstructPackage",
      { spatialIntentAnalysis, followUpAnswers: answers },
      {
        source: "systemInference",
        reason: "Legacy spatial intent changed"
      }
    );
  },

  syncStrategy(strategyMatchAnalysis) {
    store.syncLegacy(
      "conceptStrategyPackage",
      { strategyMatchAnalysis },
      {
        source: "systemInference",
        reason: "Legacy strategy package changed"
      }
    );
  },

  syncMassing(prototypeGenerationAnalysis) {
    store.syncLegacy(
      "massingPlacementPackage",
      { prototypeGenerationAnalysis },
      {
        source: "systemInference",
        reason: "Legacy concept prototype changed"
      }
    );
  },

  syncFinal(finalConceptPackage) {
    store.syncLegacy(
      "finalConceptPackage",
      { finalConceptPackage },
      {
        source: "manualEdit",
        reason: "Final concept selection changed"
      }
    );
  }
};

export {
  DATA_CHAIN_SCHEMA_VERSION,
  PACKAGE_ORDER,
  PACKAGE_STEPS,
  STALE_DEPENDENCIES,
  ProjectDataChainStore,
  bridge,
  createPackage,
  createProjectDataChain,
  legacyAdapters,
  makeSourceTrace,
  migrateLegacyProject,
  store
};

globalThis.ARCHICONCEPT_DATA_CHAIN = Object.freeze({
  schemaVersion: DATA_CHAIN_SCHEMA_VERSION,
  packageOrder: PACKAGE_ORDER,
  packageSteps: PACKAGE_STEPS,
  staleDependencies: STALE_DEPENDENCIES,
  store,
  bridge,
  createProjectDataChain,
  migrateLegacyProject,
  legacyAdapters
});
