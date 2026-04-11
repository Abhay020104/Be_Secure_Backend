const DEFAULT_FACE_DESCRIPTOR_SIZE = 1024;
const FACE_DESCRIPTOR_SIZE = (() => {
  const configuredValue = Number(process.env.FACE_DESCRIPTOR_SIZE);
  return Number.isFinite(configuredValue) && configuredValue > 0
    ? Math.trunc(configuredValue)
    : DEFAULT_FACE_DESCRIPTOR_SIZE;
})();
const DEFAULT_FACE_MATCH_THRESHOLD = 0.6;
const DEFAULT_FACE_MATCH_MARGIN = 0.05;
const DEFAULT_FACE_MATCH_THRESHOLD_BUFFER = 0.02;
const DEFAULT_FACE_MATCH_MIN_SIMILARITY = 0.7;

const normalizeDescriptor = (descriptor) => {
  if (!Array.isArray(descriptor) || descriptor.length !== FACE_DESCRIPTOR_SIZE) {
    return null;
  }

  const numericDescriptor = descriptor.map((value) => Number(value));

  if (numericDescriptor.some((value) => !Number.isFinite(value))) {
    return null;
  }

  return numericDescriptor;
};

const normalizeDescriptorSet = (input) => {
  if (!Array.isArray(input) || input.length === 0) {
    return [];
  }

  if (Array.isArray(input[0])) {
    return input.map(normalizeDescriptor).filter(Boolean);
  }

  const descriptor = normalizeDescriptor(input);
  return descriptor ? [descriptor] : [];
};

const getRecordDescriptors = (record, selector = (candidate) => candidate.faceDescriptors ?? candidate.faceDescriptor) =>
  normalizeDescriptorSet(selector(record));

const getEuclideanDistance = (leftDescriptor, rightDescriptor) => {
  if (!leftDescriptor || !rightDescriptor || leftDescriptor.length !== rightDescriptor.length) {
    return Number.POSITIVE_INFINITY;
  }

  let sum = 0;

  for (let index = 0; index < leftDescriptor.length; index += 1) {
    const difference = leftDescriptor[index] - rightDescriptor[index];
    sum += difference * difference;
  }

  return Math.sqrt(sum);
};

const getCosineSimilarity = (leftDescriptor, rightDescriptor) => {
  if (!leftDescriptor || !rightDescriptor || leftDescriptor.length !== rightDescriptor.length) {
    return null;
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < leftDescriptor.length; index += 1) {
    const leftValue = leftDescriptor[index];
    const rightValue = rightDescriptor[index];

    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (!leftMagnitude || !rightMagnitude) {
    return null;
  }

  return dotProduct / Math.sqrt(leftMagnitude * rightMagnitude);
};

const getBestDistanceForRecord = (
  record,
  descriptor,
  selector = (candidate) => candidate.faceDescriptors ?? candidate.faceDescriptor
) => {
  const candidateDescriptors = getRecordDescriptors(record, selector);
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestSimilarity = null;
  let bestDescriptor = null;

  for (const candidateDescriptor of candidateDescriptors) {
    const distance = getEuclideanDistance(descriptor, candidateDescriptor);
    const similarity = getCosineSimilarity(descriptor, candidateDescriptor);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestSimilarity = similarity;
      bestDescriptor = candidateDescriptor;
    }
  }

  return {
    bestDistance,
    bestSimilarity,
    bestDescriptor,
  };
};

const rankRecordMatches = (
  records,
  descriptor,
  selector = (candidate) => candidate.faceDescriptors ?? candidate.faceDescriptor
) =>
  records
    .map((record) => ({
      record,
      ...getBestDistanceForRecord(record, descriptor, selector),
    }))
    .filter((candidate) => Number.isFinite(candidate.bestDistance))
    .sort((leftCandidate, rightCandidate) => leftCandidate.bestDistance - rightCandidate.bestDistance);

const evaluateMatch = (
  records,
  descriptor,
  {
    threshold,
    margin = DEFAULT_FACE_MATCH_MARGIN,
    thresholdBuffer = DEFAULT_FACE_MATCH_THRESHOLD_BUFFER,
    minSimilarity = DEFAULT_FACE_MATCH_MIN_SIMILARITY,
    selector,
  }
) => {
  const rankedCandidates = rankRecordMatches(records, descriptor, selector);
  const bestCandidate = rankedCandidates[0] || null;
  const secondBestCandidate = rankedCandidates[1] || null;
  const strictThreshold = threshold - thresholdBuffer;
  const bestDistance = bestCandidate ? bestCandidate.bestDistance : null;
  const bestSimilarity = bestCandidate ? bestCandidate.bestSimilarity : null;
  const secondBestDistance = secondBestCandidate ? secondBestCandidate.bestDistance : null;
  const secondBestSimilarity = secondBestCandidate ? secondBestCandidate.bestSimilarity : null;
  const gap =
    bestCandidate && secondBestCandidate
      ? secondBestCandidate.bestDistance - bestCandidate.bestDistance
      : null;
  const meetsDistanceThreshold = Boolean(bestCandidate) && bestCandidate.bestDistance <= strictThreshold;
  const meetsSimilarityThreshold =
    Boolean(bestCandidate) &&
    typeof bestCandidate.bestSimilarity === "number" &&
    bestCandidate.bestSimilarity >= minSimilarity;
  const rejectedDueToThreshold =
    Boolean(bestCandidate) &&
    !meetsSimilarityThreshold &&
    bestCandidate.bestDistance > threshold;
  const rejectedDueToThresholdBuffer =
    Boolean(bestCandidate) &&
    !meetsSimilarityThreshold &&
    bestCandidate.bestDistance <= threshold &&
    bestCandidate.bestDistance > strictThreshold;
  const rejectedDueToSimilarity =
    Boolean(bestCandidate) &&
    !meetsDistanceThreshold &&
    !meetsSimilarityThreshold;
  const rejectedDueToAmbiguity =
    Boolean(bestCandidate) &&
    (meetsDistanceThreshold || meetsSimilarityThreshold) &&
    Boolean(secondBestCandidate) &&
    gap < margin;
  const accepted =
    Boolean(bestCandidate) &&
    (meetsDistanceThreshold || meetsSimilarityThreshold) &&
    !rejectedDueToAmbiguity;

  return {
    accepted,
    match: accepted ? bestCandidate.record : null,
    closestRecord: bestCandidate ? bestCandidate.record : null,
    secondClosestRecord: secondBestCandidate ? secondBestCandidate.record : null,
    closestDescriptor: bestCandidate ? bestCandidate.bestDescriptor : null,
    secondClosestDescriptor: secondBestCandidate ? secondBestCandidate.bestDescriptor : null,
    bestDistance,
    bestSimilarity,
    secondBestDistance,
    secondBestSimilarity,
    gap,
    threshold,
    strictThreshold,
    margin,
    thresholdBuffer,
    minSimilarity,
    candidateCount: rankedCandidates.length,
    rejectedDueToThreshold,
    rejectedDueToThresholdBuffer,
    rejectedDueToSimilarity,
    rejectedDueToAmbiguity,
  };
};

module.exports = {
  FACE_DESCRIPTOR_SIZE,
  FACE_API_DESCRIPTOR_SIZE: FACE_DESCRIPTOR_SIZE,
  DEFAULT_FACE_MATCH_THRESHOLD,
  DEFAULT_FACE_MATCH_MARGIN,
  DEFAULT_FACE_MATCH_THRESHOLD_BUFFER,
  DEFAULT_FACE_MATCH_MIN_SIMILARITY,
  normalizeDescriptor,
  normalizeDescriptorSet,
  getRecordDescriptors,
  getEuclideanDistance,
  getCosineSimilarity,
  getBestDistanceForRecord,
  rankRecordMatches,
  evaluateMatch,
};
