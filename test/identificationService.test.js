const test = require("node:test");
const assert = require("node:assert/strict");

const { createIdentificationService } = require("../src/services/identificationService");

const createDoc = (document) => ({
  ...document,
  async save() {
    return this;
  },
});

const matchesQuery = (document, query = {}) => {
  if (query.owner && String(document.owner) !== String(query.owner)) {
    return false;
  }

  if (query.expiresAt && query.expiresAt.$gt && !(new Date(document.expiresAt) > query.expiresAt.$gt)) {
    return false;
  }

  return true;
};

const createModelStub = (seedDocuments = []) => {
  const rows = seedDocuments.map(createDoc);
  const queries = [];

  return {
    rows,
    queries,
    async find(query = {}) {
      queries.push(query);
      return rows.filter((row) => matchesQuery(row, query));
    },
    async create(document) {
      const created = createDoc({
        _id: document._id || `generated-${rows.length + 1}`,
        ...document,
      });

      rows.push(created);
      return created;
    },
  };
};

test("identifyFaces scopes residents, visitors, and logs to the authenticated user", async () => {
  process.env.FACE_MATCH_THRESHOLD = "0.48";
  process.env.FACE_MATCH_MARGIN = "0.05";
  process.env.FACE_MATCH_THRESHOLD_BUFFER = "0.02";

  const residentModel = createModelStub([
    {
      _id: "resident-owned",
      owner: "user-1",
      name: "Owner Resident",
      faceDescriptors: [[0.2], [0]],
      emergencyContacts: ["+911111111111"],
    },
    {
      _id: "resident-other-user",
      owner: "user-2",
      name: "Other Resident",
      faceDescriptors: [[0.01]],
      emergencyContacts: ["+922222222222"],
    },
  ]);
  const visitorModel = createModelStub([]);
  const logModel = createModelStub([]);

  const { identifyFaces } = createIdentificationService({
    ResidentModel: residentModel,
    VisitorModel: visitorModel,
    LogModel: logModel,
    initiateAlertFn: async () => {
      throw new Error("Alert flow should not run in this test.");
    },
  });

  const result = await identifyFaces({
    userId: "user-1",
    descriptors: [[0]],
  });

  assert.equal(result.status, "Entry");
  assert.equal(result.residents.length, 1);
  assert.equal(result.residents[0].residentId, "resident-owned");
  assert.equal(result.residents[0].matchDistance, 0);
  assert.equal(result.threshold, 0.48);
  assert.equal(result.ambiguityMargin, 0.05);
  assert.equal(result.thresholdBuffer, 0.02);
  assert.deepEqual(residentModel.queries, [{ owner: "user-1" }]);
  assert.equal(visitorModel.queries.length, 2);
  assert.equal(visitorModel.queries[0].owner, "user-1");
  assert.equal(visitorModel.queries[1].owner, "user-1");
  assert.ok(visitorModel.queries[0].expiresAt.$gt instanceof Date);
  assert.equal(logModel.rows.length, 1);
  assert.equal(logModel.rows[0].owner, "user-1");
  assert.equal(logModel.rows[0].status, "Entry");
});

test("identifyFaces does not promote ambiguous unknown faces when a resident is present", async () => {
  process.env.FACE_MATCH_THRESHOLD = "0.48";
  process.env.FACE_MATCH_MARGIN = "0.05";
  process.env.FACE_MATCH_THRESHOLD_BUFFER = "0.02";

  const residentModel = createModelStub([
    {
      _id: "resident-owned",
      owner: "user-1",
      name: "Owner Resident",
      faceDescriptors: [[0]],
      emergencyContacts: ["+911111111111"],
    },
  ]);
  const visitorModel = createModelStub([
    {
      _id: "visitor-a",
      owner: "user-1",
      faceDescriptors: [[1]],
      expiresAt: new Date(Date.now() + 60_000),
      lastSeenWithResident: new Date(),
    },
    {
      _id: "visitor-b",
      owner: "user-1",
      faceDescriptors: [[1.03]],
      expiresAt: new Date(Date.now() + 60_000),
      lastSeenWithResident: new Date(),
    },
  ]);
  const logModel = createModelStub([]);

  const { identifyFaces } = createIdentificationService({
    ResidentModel: residentModel,
    VisitorModel: visitorModel,
    LogModel: logModel,
    initiateAlertFn: async () => {
      throw new Error("Alert flow should not run in this test.");
    },
  });

  const result = await identifyFaces({
    userId: "user-1",
    descriptors: [[0], [1.01]],
  });

  assert.equal(result.status, "Entry");
  assert.equal(result.promotedVisitors.length, 0);
  assert.equal(result.summary.unknownFacesInFrame, 1);
  assert.equal(result.summary.ambiguousFacesRejected, 1);
  assert.equal(visitorModel.rows.length, 2);
  assert.equal(logModel.rows.length, 1);
  assert.equal(
    result.diagnostics.some(
      (diagnostic) =>
        diagnostic.faceIndex === 1 &&
        diagnostic.rejectedDueToAmbiguity === true &&
        diagnostic.visitor.rejectedDueToAmbiguity === true
    ),
    true
  );
});
