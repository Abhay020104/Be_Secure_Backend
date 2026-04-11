const Resident = require("../models/Resident");
const Visitor = require("../models/Visitor");
const Log = require("../models/Log");
const { initiateAlert } = require("./alertService");
const {
  DEFAULT_FACE_MATCH_THRESHOLD,
  DEFAULT_FACE_MATCH_MARGIN,
  DEFAULT_FACE_MATCH_THRESHOLD_BUFFER,
  DEFAULT_FACE_MATCH_MIN_SIMILARITY,
  evaluateMatch,
  getRecordDescriptors,
  normalizeDescriptor,
} = require("../utils/faceMatcher");

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const getNumericEnv = (name, fallbackValue) => {
  const configuredValue = Number(process.env[name]);
  return Number.isFinite(configuredValue) ? configuredValue : fallbackValue;
};

const getFaceMatchThreshold = () =>
  getNumericEnv("FACE_MATCH_THRESHOLD", DEFAULT_FACE_MATCH_THRESHOLD);

const getFaceMatchMargin = () => getNumericEnv("FACE_MATCH_MARGIN", DEFAULT_FACE_MATCH_MARGIN);

const getFaceMatchThresholdBuffer = () =>
  getNumericEnv("FACE_MATCH_THRESHOLD_BUFFER", DEFAULT_FACE_MATCH_THRESHOLD_BUFFER);

const getFaceMatchMinSimilarity = () =>
  getNumericEnv("FACE_MATCH_MIN_SIMILARITY", DEFAULT_FACE_MATCH_MIN_SIMILARITY);

const areDescriptorsEqual = (leftDescriptor, rightDescriptor) =>
  Array.isArray(leftDescriptor) &&
  Array.isArray(rightDescriptor) &&
  leftDescriptor.length === rightDescriptor.length &&
  leftDescriptor.every((value, index) => value === rightDescriptor[index]);

const buildDescriptorSnapshot = (record, descriptor) => {
  const existingDescriptors = getRecordDescriptors(record);
  const nextDescriptors = existingDescriptors.some((candidate) => areDescriptorsEqual(candidate, descriptor))
    ? existingDescriptors
    : [descriptor, ...existingDescriptors].slice(0, 5);

  return {
    faceDescriptor: nextDescriptors[0],
    faceDescriptors: nextDescriptors,
  };
};

const buildDecisionPayload = (result) => ({
  accepted: result.accepted,
  acceptedMatchDistance: result.accepted ? result.bestDistance : null,
  bestDistance: result.bestDistance,
  secondBestDistance: result.secondBestDistance,
  bestSimilarity: result.bestSimilarity,
  secondBestSimilarity: result.secondBestSimilarity,
  closestMatch: result.closestRecord
    ? {
        id: result.closestRecord._id,
        label: result.closestRecord.name || String(result.closestRecord._id),
        distance: result.bestDistance,
        similarityPercent:
          typeof result.bestSimilarity === "number"
            ? Math.max(0, Math.min(100, result.bestSimilarity * 100))
            : null,
      }
    : null,
  secondClosestMatch: result.secondClosestRecord
    ? {
        id: result.secondClosestRecord._id,
        label: result.secondClosestRecord.name || String(result.secondClosestRecord._id),
        distance: result.secondBestDistance,
        similarityPercent:
          typeof result.secondBestSimilarity === "number"
            ? Math.max(0, Math.min(100, result.secondBestSimilarity * 100))
            : null,
      }
    : null,
  gap: result.gap,
  rejectedDueToThreshold: result.rejectedDueToThreshold,
  rejectedDueToThresholdBuffer: result.rejectedDueToThresholdBuffer,
  rejectedDueToSimilarity: result.rejectedDueToSimilarity,
  rejectedDueToAmbiguity: result.rejectedDueToAmbiguity,
});

const createIdentificationService = ({
  ResidentModel = Resident,
  VisitorModel = Visitor,
  LogModel = Log,
  initiateAlertFn = initiateAlert,
} = {}) => {
  const createEntryLog = async (ownerId, screenshotUrl) => {
    await LogModel.create({
      owner: ownerId,
      status: "Entry",
      screenshotUrl: screenshotUrl || null,
    });
  };

  const createAlertLog = async (ownerId, screenshotUrl) => {
    await LogModel.create({
      owner: ownerId,
      status: "Alert",
      screenshotUrl: screenshotUrl || null,
    });
  };

  const identifyFaces = async ({ userId, descriptors, screenshotUrl }) => {
    if (!userId) {
      const error = new Error("userId is required for identification.");
      error.statusCode = 401;
      throw error;
    }

    const normalizedDescriptors = descriptors.map(normalizeDescriptor);

    if (normalizedDescriptors.some((descriptor) => !descriptor)) {
      const error = new Error("Each face descriptor must be a non-empty numeric array.");
      error.statusCode = 400;
      throw error;
    }

    const now = new Date();
    const threshold = getFaceMatchThreshold();
    const ambiguityMargin = getFaceMatchMargin();
    const thresholdBuffer = getFaceMatchThresholdBuffer();
    const minSimilarity = getFaceMatchMinSimilarity();
    const matchingOptions = {
      threshold,
      margin: ambiguityMargin,
      thresholdBuffer,
      minSimilarity,
    };

    const [residents, validVisitors, allVisitors] = await Promise.all([
      ResidentModel.find({ owner: userId }),
      VisitorModel.find({ owner: userId, expiresAt: { $gt: now } }),
      VisitorModel.find({ owner: userId }),
    ]);

    const residentMatches = [];
    const visitorMatches = [];
    const unknownFaces = [];
    const diagnostics = [];

    for (const [faceIndex, descriptor] of normalizedDescriptors.entries()) {
      const residentDecision = evaluateMatch(residents, descriptor, matchingOptions);

      if (residentDecision.accepted) {
        residentMatches.push({
          residentId: residentDecision.match._id,
          name: residentDecision.match.name,
          matchDistance: residentDecision.bestDistance,
        });

        diagnostics.push({
          faceIndex,
          classification: "Resident",
          rejectedDueToAmbiguity: false,
          resident: buildDecisionPayload(residentDecision),
          visitor: null,
        });
        continue;
      }

      const visitorDecision = evaluateMatch(validVisitors, descriptor, matchingOptions);

      if (visitorDecision.accepted) {
        visitorMatches.push({
          visitorId: visitorDecision.match._id,
          expiresAt: visitorDecision.match.expiresAt,
          matchDistance: visitorDecision.bestDistance,
        });

        diagnostics.push({
          faceIndex,
          classification: "Visitor",
          rejectedDueToAmbiguity: false,
          resident: buildDecisionPayload(residentDecision),
          visitor: buildDecisionPayload(visitorDecision),
        });
        continue;
      }

      const rejectedDueToAmbiguity =
        residentDecision.rejectedDueToAmbiguity || visitorDecision.rejectedDueToAmbiguity;

      unknownFaces.push({
        descriptor,
        faceIndex,
        rejectedDueToAmbiguity,
        residentDecision,
        visitorDecision,
      });

      diagnostics.push({
        faceIndex,
        classification: rejectedDueToAmbiguity ? "UnknownAmbiguous" : "Unknown",
        rejectedDueToAmbiguity,
        resident: buildDecisionPayload(residentDecision),
        visitor: buildDecisionPayload(visitorDecision),
      });
    }

    const promotedVisitors = [];
    let alertResult = null;
    let finalStatus = "NoAction";

    if (residentMatches.length > 0 && unknownFaces.length > 0) {
      for (const unknownFace of unknownFaces) {
        if (unknownFace.rejectedDueToAmbiguity) {
          continue;
        }

        const promotionDecision = evaluateMatch(allVisitors, unknownFace.descriptor, matchingOptions);
        const expiresAt = new Date(now.getTime() + DAY_IN_MS);

        if (promotionDecision.rejectedDueToAmbiguity) {
          diagnostics.push({
            faceIndex: unknownFace.faceIndex,
            classification: "UnknownAmbiguousPromotion",
            rejectedDueToAmbiguity: true,
            resident: buildDecisionPayload(unknownFace.residentDecision),
            visitor: buildDecisionPayload(promotionDecision),
          });
          continue;
        }

        if (promotionDecision.accepted) {
          const existingVisitor = promotionDecision.match;
          const descriptorSnapshot = buildDescriptorSnapshot(existingVisitor, unknownFace.descriptor);

          existingVisitor.faceDescriptor = descriptorSnapshot.faceDescriptor;
          existingVisitor.faceDescriptors = descriptorSnapshot.faceDescriptors;
          existingVisitor.expiresAt = expiresAt;
          existingVisitor.lastSeenWithResident = now;
          await existingVisitor.save();

          promotedVisitors.push({
            visitorId: existingVisitor._id,
            action: "updated",
            expiresAt: existingVisitor.expiresAt,
            matchDistance: promotionDecision.bestDistance,
          });
          continue;
        }

        const createdVisitor = await VisitorModel.create({
          owner: userId,
          faceDescriptor: unknownFace.descriptor,
          faceDescriptors: [unknownFace.descriptor],
          expiresAt,
          lastSeenWithResident: now,
        });

        allVisitors.push(createdVisitor);

        promotedVisitors.push({
          visitorId: createdVisitor._id,
          action: "created",
          expiresAt: createdVisitor.expiresAt,
          matchDistance: null,
        });
      }

      await createEntryLog(userId, screenshotUrl);
      finalStatus = "Entry";
    } else if (unknownFaces.length > 0) {
      const emergencyContacts = residents.flatMap((resident) => resident.emergencyContacts);
      alertResult = await initiateAlertFn({
        contacts: emergencyContacts,
        unknownCount: unknownFaces.length,
      });

      await createAlertLog(userId, screenshotUrl);
      finalStatus = "Alert";
    } else if (residentMatches.length > 0 || visitorMatches.length > 0) {
      await createEntryLog(userId, screenshotUrl);
      finalStatus = "Entry";
    }

    return {
      status: finalStatus,
      threshold,
      ambiguityMargin,
      thresholdBuffer,
      minSimilarity,
      residents: residentMatches,
      visitors: visitorMatches,
      promotedVisitors,
      alert: alertResult,
      diagnostics,
      summary: {
        totalFaces: normalizedDescriptors.length,
        residentMatches: residentMatches.length,
        visitorMatches: visitorMatches.length,
        unknownFacesInFrame: unknownFaces.length,
        promotedVisitors: promotedVisitors.length,
        ambiguousFacesRejected: unknownFaces.filter((face) => face.rejectedDueToAmbiguity).length,
      },
    };
  };

  return { identifyFaces };
};

const { identifyFaces } = createIdentificationService();

module.exports = {
  identifyFaces,
  createIdentificationService,
  getFaceMatchThreshold,
  getFaceMatchMargin,
  getFaceMatchThresholdBuffer,
};
