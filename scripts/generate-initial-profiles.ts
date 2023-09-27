import { Account, ListAccountsCommand, OrganizationsClient } from "@aws-sdk/client-organizations";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { ListInstancesCommand, SSOAdminClient } from "@aws-sdk/client-sso-admin";
import { Command } from "commander";
import * as chalk from "chalk";

const program = new Command();

async function getCurrentAccountId() {
  const client = new STSClient({});
  const command = new GetCallerIdentityCommand({});
  const response = await client.send(command);
  return response.Account;
}

async function getOrganizationAccounts() {
  const client = new OrganizationsClient({});
  const command = new ListAccountsCommand({});
  const response = await client.send(command);
  return response.Accounts;
}

async function getIdentityStore() {
  const client = new SSOAdminClient({});
  const command = new ListInstancesCommand({});
  const response = await client.send(command);
  if (response.Instances!.length > 0) {
    return response.Instances![0];
  }
  return undefined;
}

async function normalizeAccountName(account: Account) {
  const currentAccountId = await getCurrentAccountId();
  if (account.Id === currentAccountId) {
    return "organization";
  }
  return account.Name!.toLowerCase().replace(" ", "-");
}

async function generateSsoProfiles(accounts: Account[], region: string) {
  const identityStore = await getIdentityStore();
  if (!identityStore) {
    throw new Error("No identity store ID found.  Confirm AWS SSO configured in the current account and region.");
  }

  const ssoStartUrl = `https://${identityStore.IdentityStoreId}.awsapps.com/start`;

  const promises = accounts?.map(async (account) => {
    const normalizedAccountName = await normalizeAccountName(account);
    console.log(`[profile ${normalizedAccountName}]`);
    console.log(`sso_start_url = ${ssoStartUrl}`);
    console.log(`sso_region = ${region}`);
    console.log(`sso_account_id = ${account.Id}`);
    console.log("sso_role_name = AWSAdministratorAccess");
    console.log(`region = ${region}\n`);
  });
  await Promise.all(promises);
}

async function generateDeploymentProfiles(accounts: Account[], region: string) {
  // New deployment using an IAM user in the Organization account to assume the Org role in spoke accounts
  const promises = accounts?.map(async (account) => {
    const normalizedAccountName = await normalizeAccountName(account);
    if (normalizedAccountName !== "organization") {
      console.log(`[profile ${normalizedAccountName}]`);
      console.log(`role_arn = arn:aws:iam::${account.Id}:role/OrganizationAccountAccessRole`);
      console.log(`source_profile = sca-deployment-admin`);
      console.log(`region = ${region}\n`);
    }
  });
  await Promise.all(promises);
}

async function generateCliConfig(profileType: "deployment" | "sso") {
  const region = await new OrganizationsClient({}).config.region();
  const accounts = await getOrganizationAccounts();

  if (!accounts) {
    throw new Error("No accounts found.  Confirm AWS Organization configured in the current account and region.");
  }

  if (profileType === "sso") {
    await generateSsoProfiles(accounts, region);
  } else {
    await generateDeploymentProfiles(accounts, region);
  }
}

(async function main() {
  program
    .name("generate-initial-sso-profiles")
    .description("CLI to supplement Simple Cloud Accelerator functionality")
    .requiredOption(
      "--profile-type <deployment | sso>",
      "Generate CLI profiles for initial OrganizationAccountAccessRole access or a deployed AWS SSO implementation",
      "deployment"
    )
    .version("0.0.1")
    .parse(process.argv);

  const options = program.opts();
  await generateCliConfig(options.profileType);

  console.log(`Add the above output to ${chalk.bold("~/.aws/config")}`);
})();
