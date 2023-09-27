export function preventDisablingCloudTrail() {
  const body = {
    Version: "2012-10-17",
    Statement: [
      {
        Action: ["cloudtrail:StopLogging", "cloudtrail:DeleteTrail"],
        Resource: "*",
        Effect: "Deny",
      },
    ],
  };
  return body;
}
