export function preventRootAccountUsage() {
  const body = {
    Version: "2012-10-17",
    Statement: [
      {
        Action: "*",
        Resource: "*",
        Effect: "Deny",
        Condition: {
          StringLike: {
            "aws:PrincipalArn": ["arn:aws:iam::*:root"],
          },
        },
      },
    ],
  };
  return body;
}
