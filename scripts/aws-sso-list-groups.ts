import { Group, IdentitystoreClient, ListGroupsCommand } from "@aws-sdk/client-identitystore";
import { DescribeOrganizationCommand, OrganizationsClient } from "@aws-sdk/client-organizations";
import { AccessDeniedException, ListInstancesCommand, SSOAdminClient } from "@aws-sdk/client-sso-admin";
import { Command } from "commander";
import * as util from "util";
import * as fs from "fs";
import * as path from "path";

const program = new Command();

async function getOrganizationDetails() {
  const client = new OrganizationsClient({});
  const command = new DescribeOrganizationCommand({});
  const response = await client.send(command);
  return response.Organization;
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

async function getIdentityStoreGroups(identityStoreId: string) {
  const client = new IdentitystoreClient({});
  const command = new ListGroupsCommand({
    IdentityStoreId: identityStoreId,
  });
  const response = await client.send(command);
  return response.Groups;
}

function sortGroups(groupArr: Group[]) {
  const groups: Record<string, string> = {};

  // Create a single object from the array of objects
  groupArr.forEach((group) => {
    groups[group.DisplayName!] = group.GroupId!;
  });

  // Sort object entries alphabetically by key
  const sortedGroups = Object.keys(groups)
    .sort()
    .reduce((accumulator: Record<string, string>, key) => {
      accumulator[key] = groups[key]!;
      return accumulator;
    }, {});

  return sortedGroups;
}

async function getGroupMap() {
  try {
    const identityStore = await getIdentityStore();
    if (!identityStore) {
      throw new Error("No identity store ID found.  Confirm AWS SSO configured in the current account and region.");
    }

    // This returns an array of objects in { string: string } format
    const groupArr = (await getIdentityStoreGroups(identityStore.IdentityStoreId!)) ?? [];
    const sortedGroups = sortGroups(groupArr);
    const ssoDetails = {
      instanceArn: identityStore.InstanceArn,
      groupIds: sortedGroups,
    };

    const fileContents = `export const ssoDetails = ${util.inspect(ssoDetails)} as const;\n`;
    const outputFile = path.join(__dirname, "../config/ssoConfig.ts");
    fs.writeFileSync(outputFile, fileContents);
    console.log(`Updated SSO group mappings written to ${outputFile}`);
  } catch (e) {
    if (e instanceof AccessDeniedException) {
      const orgDetails = await getOrganizationDetails();
      console.error(
        `This command must be run in the AWS SSO account.\nLook in the Organization account (${orgDetails?.MasterAccountId}) for the account managing AWS SSO and run this command there.\n`
      );
    } else {
      console.error(e);
    }
  }
}

(async function main() {
  program
    .name("aws-sso-list-groups")
    .description("CLI to supplement Simple Cloud Accelerator functionality")
    .version("0.0.1")
    .action(getGroupMap);
  await program.parseAsync(process.argv);
})();
