import { IAMClient, ListAccessKeysCommand, ListUsersCommand } from "@aws-sdk/client-iam";
import { ListAccountsCommand, OrganizationsClient } from "@aws-sdk/client-organizations";
import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";

import { ClientCredentials, UsersInViolation } from "./types";

export async function assumeRole(
  accountId: string,
  roleName: string,
  roleSessionName: string,
  credentials?: ClientCredentials
) {
  const client = new STSClient({
    credentials,
  });
  const command = new AssumeRoleCommand({
    RoleArn: `arn:aws:iam::${accountId}:role/${roleName}`,
    RoleSessionName: roleSessionName,
  });
  const response = await client.send(command);
  return {
    accessKeyId: response.Credentials!.AccessKeyId!,
    secretAccessKey: response.Credentials!.SecretAccessKey!,
    sessionToken: response.Credentials!.SessionToken!,
  };
}

export async function listUsers(credentials?: ClientCredentials) {
  const client = credentials ? new IAMClient({ credentials }) : new IAMClient({});
  const command = new ListUsersCommand({});
  const response = await client.send(command);
  return response.Users;
}

export async function listUserAccessKeys(userName: string, credentials?: ClientCredentials) {
  const client = credentials ? new IAMClient({ credentials }) : new IAMClient({});
  const command = new ListAccessKeysCommand({ UserName: userName });
  const response = await client.send(command);
  return response.AccessKeyMetadata;
}

export function daysSince(date: Date) {
  const past = new Date(date);
  const now = new Date();
  const diff = now.getTime() - past.getTime();
  return Math.round(diff / (1000 * 3600 * 24));
}

export async function getAccountId() {
  const client = new STSClient({});
  const command = new GetCallerIdentityCommand({});
  const response = await client.send(command);
  return response.Account!;
}

export async function getActiveOrganizationAccounts() {
  const client = new OrganizationsClient({});
  const command = new ListAccountsCommand({});
  const response = await client.send(command);
  const activeAccounts = response.Accounts?.filter((account) => account.Status === "ACTIVE");
  return activeAccounts;
}

export function generateReport(
  usersInViolation: UsersInViolation,
  accountId: string,
  accountName: string | undefined,
  minimumReportingKeyAge: number
) {
  let report = "";

  let header = "";
  if (Object.keys(usersInViolation).length > 0) {
    header = `${accountId} user(s) with access keys older than ${minimumReportingKeyAge} days\n`;
    if (accountName) {
      header = `${accountName}/${header}`;
    }
  }
  report += header;

  Object.entries(usersInViolation).forEach(([userName, keys]) => {
    const keyNoun = keys.length > 1 ? "keys" : "key";
    report += `\t${userName} - ${keys.length} ${keyNoun}\n`;

    keys.forEach((days) => {
      report += `\t  - ${days} days\n`;
    });
  });

  return report;
}
