const initiateAlert = async ({ contacts = [], unknownCount = 0 }) => {
  const uniqueContacts = [...new Set(contacts.filter(Boolean))];

  uniqueContacts.forEach((phoneNumber) => {
    console.log(`Calling emergency contact ${phoneNumber} for ${unknownCount} unrecognized face(s).`);
  });

  const responseReceived = String(process.env.ALERT_SIMULATED_RESPONSE).toLowerCase() === "true";

  if (!responseReceived) {
    console.log("POLICE CALL INITIATED");
  }

  return {
    contactsCalled: uniqueContacts,
    responseReceived,
    policeCallInitiated: !responseReceived,
  };
};

module.exports = { initiateAlert };
