export function preventPasswordPolicyChanges() {
  const body = {
    Version: "2012-10-17",
    Statement: [
      {
        Action: ["iam:DeleteAccountPasswordPolicy", "iam:UpdateAccountPasswordPolicy"],
        Resource: ["*"],
        Effect: "Deny",
      },
    ],
  };
  return body;
}
