import { IAMClient, ListUsersCommand } from "@aws-sdk/client-iam";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";

import { Context } from "aws-lambda";

const docs = `
# Organization IAM User Summary
Custom widget returning the number of IAM users in each respective Organization account.

## Example Invocation Payload
\`\`\` json
{
  "targetAccounts": [
      "123412341234"
  ],
  "targetRoleName": "organization-cloudwatch-dashboard-view-only"
}
\`\`\`
`;

async function assumeRole(account: string, roleName: string) {
  const client = new STSClient({});
  const command = new AssumeRoleCommand({
    RoleArn: `arn:aws:iam::${account}:role/${roleName}`,
    RoleSessionName: "organization-lambda-cloudwatch-dashboard-viewer",
  });
  const response = await client.send(command);
  return response.Credentials;
}

async function createClientForAccount(targetAccountId: string, currentAccountId: string, targetRoleName: string) {
  // If the target account is not the current account, get STS credentials
  if (currentAccountId !== targetAccountId) {
    const credentials = await assumeRole(targetAccountId, targetRoleName);
    return new IAMClient({
      credentials: {
        accessKeyId: credentials!.AccessKeyId!,
        secretAccessKey: credentials!.SecretAccessKey!,
        sessionToken: credentials!.SessionToken!,
      },
    });
  }

  return new IAMClient({});
}

export async function handler(event: any, context: Context): Promise<any> {
  console.log(JSON.stringify(event, null, 2));

  if (event.describe) {
    return docs;
  }

  let results = `
Account ID | Total IAM Users
-----------|----------------
`;

  // Handle the current account.  We don't need to assume a role if we're looking in this account
  await Promise.all(
    event.targetAccounts.map(async (account: string) => {
      const client = await createClientForAccount(account, event.widgetContext.accountId, event.targetRoleName);
      const command = new ListUsersCommand({});
      const response = await client.send(command);
      results += `${account} | ${response.Users!.length}\n`;
    })
  );

  return { markdown: results };
}
