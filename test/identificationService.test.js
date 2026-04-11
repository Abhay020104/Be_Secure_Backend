const test = require("node:test");
const assert = require("node:assert/strict");

const { createIdentificationService } = require("../src/services/identificationService");
const { FACE_DESCRIPTOR_SIZE } = require("../src/utils/faceMatcher");

const descriptor = (firstValue = 0) =>
  [firstValue, ...Array.from({ length: FACE_DESCRIPTOR_SIZE - 1 }, () => 0)];

const basisDescriptor = (axisIndex = 0) =>
  Array.from({ length: FACE_DESCRIPTOR_SIZE }, (_, index) => (index === axisIndex ? 1 : 0));

const unitDescriptor = () => basisDescriptor(0);

const descriptorWithCosineSimilarity = (similarity, axisIndex = 0) =>
  Array.from({ length: FACE_DESCRIPTOR_SIZE }, (_, index) => {
    if (index === axisIndex) {
      return similarity;
    }

    if (index === axisIndex + 1) {
      return Math.sqrt(1 - similarity * similarity);
    }

    return 0;
  });

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
      faceDescriptors: [descriptor(0.2), descriptor(0)],
      emergencyContacts: ["+911111111111"],
    },
    {
      _id: "resident-other-user",
      owner: "user-2",
      name: "Other Resident",
      faceDescriptors: [descriptor(0.01)],
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
    descriptors: [descriptor(0)],
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
      faceDescriptors: [descriptor(0)],
      emergencyContacts: ["+911111111111"],
    },
  ]);
  const visitorModel = createModelStub([
    {
      _id: "visitor-a",
      owner: "user-1",
      faceDescriptors: [descriptor(1)],
      expiresAt: new Date(Date.now() + 60_000),
      lastSeenWithResident: new Date(),
    },
    {
      _id: "visitor-b",
      owner: "user-1",
      faceDescriptors: [descriptor(1.03)],
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
    descriptors: [descriptor(0), descriptor(1.01)],
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

test("identifyFaces waits for three uncertain unknown hits before alerting", async () => {
  process.env.FACE_MATCH_THRESHOLD = "0.48";
  process.env.FACE_MATCH_MARGIN = "0.05";
  process.env.FACE_MATCH_THRESHOLD_BUFFER = "0.02";
  process.env.FACE_MATCH_MIN_SIMILARITY = "0.7";
  process.env.ALERT_CONFIRMATION_MIN_SIMILARITY = "0.55";
  process.env.ALERT_CONFIRMATION_REQUIRED_HITS = "3";

  const residentModel = createModelStub([
    {
      _id: "resident-owned",
      owner: "user-1",
      name: "Owner Resident",
      faceDescriptors: [descriptorWithCosineSimilarity(0.6)],
      emergencyContacts: ["+911111111111"],
    },
  ]);
  const visitorModel = createModelStub([]);
  const logModel = createModelStub([]);
  const alertCalls = [];

  const { identifyFaces } = createIdentificationService({
    ResidentModel: residentModel,
    VisitorModel: visitorModel,
    LogModel: logModel,
    initiateAlertFn: async (payload) => {
      alertCalls.push(payload);
      return {
        contactsCalled: payload.contacts,
        responseReceived: false,
        policeCallInitiated: true,
      };
    },
  });

  const firstResult = await identifyFaces({
    userId: "user-1",
    descriptors: [unitDescriptor()],
  });
  const secondResult = await identifyFaces({
    userId: "user-1",
    descriptors: [unitDescriptor()],
  });
  const thirdResult = await identifyFaces({
    userId: "user-1",
    descriptors: [unitDescriptor()],
  });

  assert.equal(firstResult.status, "NoAction");
  assert.equal(firstResult.alertConfirmation.pending, true);
  assert.equal(firstResult.alertConfirmation.hits, 1);
  assert.equal(secondResult.status, "NoAction");
  assert.equal(secondResult.alertConfirmation.pending, true);
  assert.equal(secondResult.alertConfirmation.hits, 2);
  assert.equal(thirdResult.status, "Alert");
  assert.equal(thirdResult.alertConfirmation.triggered, true);
  assert.equal(thirdResult.alertConfirmation.hits, 3);
  assert.equal(alertCalls.length, 1);
  assert.deepEqual(alertCalls[0].contacts, ["+911111111111"]);
  assert.equal(logModel.rows.length, 1);
  assert.equal(logModel.rows[0].status, "Alert");
});

test("identifyFaces resets pending alert hits when a known resident or visitor is detected", async () => {
  process.env.FACE_MATCH_THRESHOLD = "0.48";
  process.env.FACE_MATCH_MARGIN = "0.05";
  process.env.FACE_MATCH_THRESHOLD_BUFFER = "0.02";
  process.env.FACE_MATCH_MIN_SIMILARITY = "0.7";
  process.env.ALERT_CONFIRMATION_MIN_SIMILARITY = "0.55";
  process.env.ALERT_CONFIRMATION_REQUIRED_HITS = "3";

  const residentModel = createModelStub([
    {
      _id: "resident-owned",
      owner: "user-1",
      name: "Owner Resident",
      faceDescriptors: [basisDescriptor(0), descriptorWithCosineSimilarity(0.6, 1)],
      emergencyContacts: ["+911111111111"],
    },
  ]);
  const visitorModel = createModelStub([
    {
      _id: "visitor-owned",
      owner: "user-1",
      faceDescriptors: [basisDescriptor(3)],
      expiresAt: new Date(Date.now() + 60_000),
      lastSeenWithResident: new Date(),
    },
  ]);
  const logModel = createModelStub([]);
  const alertCalls = [];

  const { identifyFaces } = createIdentificationService({
    ResidentModel: residentModel,
    VisitorModel: visitorModel,
    LogModel: logModel,
    initiateAlertFn: async (payload) => {
      alertCalls.push(payload);
      return {
        contactsCalled: payload.contacts,
        responseReceived: false,
        policeCallInitiated: true,
      };
    },
  });

  await identifyFaces({
    userId: "user-1",
    descriptors: [basisDescriptor(1)],
  });
  const secondUnknownResult = await identifyFaces({
    userId: "user-1",
    descriptors: [basisDescriptor(1)],
  });
  const residentResult = await identifyFaces({
    userId: "user-1",
    descriptors: [basisDescriptor(0)],
  });
  const resetUnknownResult = await identifyFaces({
    userId: "user-1",
    descriptors: [basisDescriptor(1)],
  });
  await identifyFaces({
    userId: "user-1",
    descriptors: [basisDescriptor(1)],
  });
  const visitorResult = await identifyFaces({
    userId: "user-1",
    descriptors: [basisDescriptor(3)],
  });
  const resetUnknownAfterVisitorResult = await identifyFaces({
    userId: "user-1",
    descriptors: [basisDescriptor(1)],
  });

  assert.equal(secondUnknownResult.status, "NoAction");
  assert.equal(secondUnknownResult.alertConfirmation.hits, 2);
  assert.equal(residentResult.status, "Entry");
  assert.equal(resetUnknownResult.status, "NoAction");
  assert.equal(resetUnknownResult.alertConfirmation.hits, 1);
  assert.equal(visitorResult.status, "Entry");
  assert.equal(resetUnknownAfterVisitorResult.status, "NoAction");
  assert.equal(resetUnknownAfterVisitorResult.alertConfirmation.hits, 1);
  assert.equal(alertCalls.length, 0);
});

test("identifyFaces alerts immediately when unknown similarity is below the confirmation floor", async () => {
  process.env.FACE_MATCH_THRESHOLD = "0.48";
  process.env.FACE_MATCH_MARGIN = "0.05";
  process.env.FACE_MATCH_THRESHOLD_BUFFER = "0.02";
  process.env.FACE_MATCH_MIN_SIMILARITY = "0.7";
  process.env.ALERT_CONFIRMATION_MIN_SIMILARITY = "0.55";
  process.env.ALERT_CONFIRMATION_REQUIRED_HITS = "3";

  const residentModel = createModelStub([
    {
      _id: "resident-owned",
      owner: "user-1",
      name: "Owner Resident",
      faceDescriptors: [descriptorWithCosineSimilarity(0.4)],
      emergencyContacts: ["+911111111111"],
    },
  ]);
  const visitorModel = createModelStub([]);
  const logModel = createModelStub([]);
  const alertCalls = [];

  const { identifyFaces } = createIdentificationService({
    ResidentModel: residentModel,
    VisitorModel: visitorModel,
    LogModel: logModel,
    initiateAlertFn: async (payload) => {
      alertCalls.push(payload);
      return {
        contactsCalled: payload.contacts,
        responseReceived: false,
        policeCallInitiated: true,
      };
    },
  });

  const result = await identifyFaces({
    userId: "user-1",
    descriptors: [unitDescriptor()],
  });

  assert.equal(result.status, "Alert");
  assert.equal(result.alertConfirmation.reason, "low_similarity");
  assert.equal(alertCalls.length, 1);
  assert.deepEqual(alertCalls[0].contacts, ["+911111111111"]);
  assert.equal(logModel.rows.length, 1);
  assert.equal(logModel.rows[0].status, "Alert");
});
