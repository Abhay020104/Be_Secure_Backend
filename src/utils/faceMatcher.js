const DEFAULT_FACE_MATCH_THRESHOLD = 0.48;
const DEFAULT_FACE_MATCH_MARGIN = 0.05;
const DEFAULT_FACE_MATCH_THRESHOLD_BUFFER = 0.02;

const normalizeDescriptor = (descriptor) => {
  if (!Array.isArray(descriptor) || descriptor.length === 0) {
    return null;
  }

  const numericDescriptor = descriptor.map((value) => Number(value));

  if (numericDescriptor.some((value) => Number.isNaN(value))) {
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

const getBestDistanceForRecord = (
  record,
  descriptor,
  selector = (candidate) => candidate.faceDescriptors ?? candidate.faceDescriptor
) => {
  const candidateDescriptors = getRecordDescriptors(record, selector);
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidateDescriptor of candidateDescriptors) {
    const distance = getEuclideanDistance(descriptor, candidateDescriptor);

    if (distance < bestDistance) {
      bestDistance = distance;
    }
  }

  return bestDistance;
};

const rankRecordMatches = (
  records,
  descriptor,
  selector = (candidate) => candidate.faceDescriptors ?? candidate.faceDescriptor
) =>
  records
    .map((record) => ({
      record,
      bestDistance: getBestDistanceForRecord(record, descriptor, selector),
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
    selector,
  }
) => {
  const rankedCandidates = rankRecordMatches(records, descriptor, selector);
  const bestCandidate = rankedCandidates[0] || null;
  const secondBestCandidate = rankedCandidates[1] || null;
  const strictThreshold = threshold - thresholdBuffer;
  const bestDistance = bestCandidate ? bestCandidate.bestDistance : null;
  const secondBestDistance = secondBestCandidate ? secondBestCandidate.bestDistance : null;
  const gap =
    bestCandidate && secondBestCandidate
      ? secondBestCandidate.bestDistance - bestCandidate.bestDistance
      : null;
  const rejectedDueToThreshold = Boolean(bestCandidate) && bestCandidate.bestDistance > threshold;
  const rejectedDueToThresholdBuffer =
    Boolean(bestCandidate) &&
    bestCandidate.bestDistance <= threshold &&
    bestCandidate.bestDistance > strictThreshold;
  const rejectedDueToAmbiguity =
    Boolean(bestCandidate) &&
    !rejectedDueToThreshold &&
    !rejectedDueToThresholdBuffer &&
    Boolean(secondBestCandidate) &&
    gap < margin;
  const accepted =
    Boolean(bestCandidate) &&
    bestCandidate.bestDistance <= strictThreshold &&
    !rejectedDueToAmbiguity;

  return {
    accepted,
    match: accepted ? bestCandidate.record : null,
    bestDistance,
    secondBestDistance,
    gap,
    threshold,
    strictThreshold,
    margin,
    thresholdBuffer,
    candidateCount: rankedCandidates.length,
    rejectedDueToThreshold,
    rejectedDueToThresholdBuffer,
    rejectedDueToAmbiguity,
  };
};

module.exports = {
  DEFAULT_FACE_MATCH_THRESHOLD,
  DEFAULT_FACE_MATCH_MARGIN,
  DEFAULT_FACE_MATCH_THRESHOLD_BUFFER,
  normalizeDescriptor,
  normalizeDescriptorSet,
  getRecordDescriptors,
  getEuclideanDistance,
  getBestDistanceForRecord,
  rankRecordMatches,
  evaluateMatch,
};
