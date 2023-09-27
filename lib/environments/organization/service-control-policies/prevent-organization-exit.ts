export function preventOrganizationExit() {
  const body = {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Deny",
        Action: ["organizations:LeaveOrganization"],
        Resource: "*",
      },
    ],
  };
  return body;
}
