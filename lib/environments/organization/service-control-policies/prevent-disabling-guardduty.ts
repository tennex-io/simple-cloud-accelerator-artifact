export function preventDisablingGuardDuty() {
  const body = {
    Version: "2012-10-17",
    Statement: [
      {
        Action: [
          "guardduty:DeleteDetector",
          "guardduty:DeleteInvitations",
          "guardduty:DeleteIPSet",
          "guardduty:DeleteMembers",
          "guardduty:DeleteThreatIntelSet",
          "guardduty:DisassociateFromMasterAccount",
          "guardduty:DisassociateMembers",
          "guardduty:StopMonitoringMembers",
          "guardduty:UpdateDetector",
        ],
        Resource: "*",
        Effect: "Deny",
      },
    ],
  };
  return body;
}
