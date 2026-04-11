const test = require("node:test");
const assert = require("node:assert/strict");

const { evaluateMatch, FACE_DESCRIPTOR_SIZE } = require("../src/utils/faceMatcher");

const descriptor = (firstValue = 0) =>
  [firstValue, ...Array.from({ length: FACE_DESCRIPTOR_SIZE - 1 }, () => 0)];

test("accepts a clear best match across multiple stored descriptors", () => {
  const records = [
    { _id: "resident-a", faceDescriptors: [descriptor(0.25), descriptor(0.02)] },
    { _id: "resident-b", faceDescriptors: [descriptor(0.4)] },
  ];

  const result = evaluateMatch(records, descriptor(0), {
    threshold: 0.5,
    margin: 0.05,
    thresholdBuffer: 0.02,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.match._id, "resident-a");
  assert.equal(result.bestDistance, 0.02);
  assert.equal(result.secondBestDistance, 0.4);
});

test("rejects an ambiguous match when the second-best candidate is too close", () => {
  const records = [
    { _id: "resident-a", faceDescriptor: descriptor(0.1) },
    { _id: "resident-b", faceDescriptor: descriptor(0.12) },
  ];

  const result = evaluateMatch(records, descriptor(0), {
    threshold: 0.5,
    margin: 0.05,
    thresholdBuffer: 0.02,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.rejectedDueToAmbiguity, true);
  assert.equal(result.bestDistance, 0.1);
  assert.equal(result.secondBestDistance, 0.12);
});

test("rejects matches that only pass the loose threshold but fail the safety buffer", () => {
  const records = [{ _id: "resident-a", faceDescriptor: descriptor(0.47) }];

  const result = evaluateMatch(records, descriptor(0), {
    threshold: 0.48,
    margin: 0.05,
    thresholdBuffer: 0.02,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.rejectedDueToThresholdBuffer, true);
  assert.equal(result.bestDistance, 0.47);
});
