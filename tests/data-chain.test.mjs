import test from "node:test";
import assert from "node:assert/strict";

import {
  PACKAGE_ORDER,
  ProjectDataChainStore,
  createProjectDataChain,
  migrateLegacyProject
} from "../assets/archiconcept-data-chain.js";

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
};

test("initializes all six packages with a shared envelope", () => {
  const chain = createProjectDataChain({ projectId: "demo-project" });

  assert.equal(chain.projectId, "demo-project");
  assert.deepEqual(
    PACKAGE_ORDER.map((packageName) => chain[packageName].step),
    [1, 2, 3, 4, 5, 6]
  );
  PACKAGE_ORDER.forEach((packageName) => {
    assert.equal(chain[packageName].completionStatus, "empty");
    assert.equal(chain[packageName].confidenceLevel, "low");
    assert.deepEqual(chain[packageName].blockingItems, []);
    assert.deepEqual(chain[packageName].assumptions, []);
    assert.deepEqual(chain[packageName].sourceTrace, {});
    assert.deepEqual(chain[packageName].downstreamHints, {});
  });
});

test("marks dependent downstream packages stale", () => {
  const store = new ProjectDataChainStore({ storage: createStorage() });

  store.updatePackage(
    "massingPlacementPackage",
    {
      completionStatus: "ready",
      confidenceLevel: "medium",
      data: { massingOptions: [{ id: "A" }, { id: "B" }] }
    },
    { invalidateDownstream: false }
  );
  store.updatePackage(
    "finalConceptPackage",
    {
      completionStatus: "confirmed",
      confidenceLevel: "medium",
      data: { selectedOption: "A" }
    },
    { invalidateDownstream: false }
  );

  store.updatePackage(
    "boundaryAnchorPackage",
    {
      completionStatus: "ready",
      confidenceLevel: "high",
      data: { hardControls: { siteAreaM2: 40000 } }
    },
    { source: "userInput", reason: "Site area changed" }
  );

  assert.equal(store.getPackage("massingPlacementPackage").stale, true);
  assert.equal(store.getPackage("finalConceptPackage").stale, true);
  assert.equal(store.getPackage("siteAnalysisPackage").stale, false);
});

test("site changes do not invalidate the function package", () => {
  const store = new ProjectDataChainStore({ storage: createStorage() });

  store.updatePackage(
    "functionConstructPackage",
    {
      completionStatus: "ready",
      data: { functionTree: [{ id: "public" }] }
    },
    { invalidateDownstream: false }
  );
  store.updatePackage(
    "conceptStrategyPackage",
    {
      completionStatus: "ready",
      data: { coreProblems: [{ id: "problem-1" }] }
    },
    { invalidateDownstream: false }
  );
  store.updatePackage(
    "siteAnalysisPackage",
    {
      completionStatus: "confirmed",
      data: { redline: { areaM2: 39594 } }
    },
    { source: "manualEdit", reason: "Redline changed" }
  );

  assert.equal(store.getPackage("functionConstructPackage").stale, false);
  assert.equal(store.getPackage("conceptStrategyPackage").stale, true);
});

test("records field source trace and persists revisions", () => {
  const storage = createStorage();
  const store = new ProjectDataChainStore({ storage });

  store.updatePackage(
    "boundaryAnchorPackage",
    {
      completionStatus: "partial",
      assumptions: [{ key: "setback", value: "系统暂估" }],
      data: { hardControls: { heightLimitM: 30 } }
    },
    {
      source: "importedBrief",
      changedFields: ["hardControls.heightLimitM"],
      reason: "Imported task brief"
    }
  );

  const packageData = store.getPackage("boundaryAnchorPackage");
  assert.equal(
    packageData.sourceTrace["hardControls.heightLimitM"].source,
    "importedBrief"
  );
  assert.equal(packageData.assumptions[0].key, "setback");

  const restored = new ProjectDataChainStore({ storage });
  assert.equal(restored.getState().revision, 1);
  assert.equal(
    restored.getPackage("boundaryAnchorPackage").data.hardControls.heightLimitM,
    30
  );
});

test("migrates current project and site editor fields", () => {
  const migrated = migrateLegacyProject(
    {
      projectData: {
        name: "前海数据中心",
        type: "工业与基础设施建筑",
        location: "前海石公园",
        area: "40000",
        needs: "数据中心与公共活动空间",
        siteIntelligencePackage: {
          location: { name: "前海石公园", lng: 113.9, lat: 22.5 },
          boundary: {
            status: "已确认",
            areaM2: 39594,
            geometry: [
              { lng: 113.9, lat: 22.5 },
              { lng: 113.91, lat: 22.5 },
              { lng: 113.91, lat: 22.51 }
            ]
          }
        }
      },
      siteIntelligencePackage: {
        location: { name: "前海石公园", lng: 113.9, lat: 22.5 },
        boundary: {
          status: "已确认",
          areaM2: 39594,
          geometry: [
            { lng: 113.9, lat: 22.5 },
            { lng: 113.91, lat: 22.5 },
            { lng: 113.91, lat: 22.51 }
          ]
        }
      }
    },
    { source: "example" }
  );

  assert.equal(migrated.boundaryAnchorPackage.completionStatus, "ready");
  assert.equal(migrated.siteAnalysisPackage.completionStatus, "confirmed");
  assert.equal(
    migrated.siteAnalysisPackage.data.siteLocation.name,
    "前海石公园"
  );
});
