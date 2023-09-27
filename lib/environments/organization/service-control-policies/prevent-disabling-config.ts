export function preventDisablingConfig() {
  const body = {
    Version: "2012-10-17",
    Statement: [
      {
        Action: [
          "config:DeleteConfigRule",
          "config:DeleteConfigurationRecorder",
          "config:DeleteDeliveryChannel",
          "config:StopConfigurationRecorder",
        ],
        Resource: "*",
        Effect: "Deny",
      },
    ],
  };
  return body;
}
