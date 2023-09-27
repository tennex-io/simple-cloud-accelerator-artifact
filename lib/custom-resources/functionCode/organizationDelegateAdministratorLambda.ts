import {
  GuardDutyClient,
  EnableOrganizationAdminAccountCommand,
  ListOrganizationAdminAccountsCommand,
} from "@aws-sdk/client-guardduty";
import { CloudTrailClient, RegisterOrganizationDelegatedAdminCommand } from "@aws-sdk/client-cloudtrail";
import {
  OrganizationsClient,
  RegisterDelegatedAdministratorCommand,
  ListDelegatedServicesForAccountCommand,
  AccountNotRegisteredException,
} from "@aws-sdk/client-organizations";
import { CloudFormationCustomResourceEvent, Context } from "aws-lambda";

async function isOrganizationAdminAccount(accountId: string) {
  const client = new GuardDutyClient({});
  const command = new ListOrganizationAdminAccountsCommand({});
  const { AdminAccounts } = await client.send(command);
  if (AdminAccounts!.length > 0) {
    return AdminAccounts![0].AdminAccountId === accountId;
  }
  return false;
}

async function delegateCloudTrailAdmin(accountId: string) {
  const client = new CloudTrailClient({});
  console.log(`Enabling Cloudtrail admin access for ${accountId}`);
  const command = new RegisterOrganizationDelegatedAdminCommand({
    MemberAccountId: accountId,
  });
  await client.send(command);
}

async function delegateGuardDutyAdmin(accountId: string) {
  const client = new GuardDutyClient({});
  console.log(`Enabling GuarDuty admin access for ${accountId}`);
  const command = new EnableOrganizationAdminAccountCommand({
    AdminAccountId: accountId,
  });
  await client.send(command);
}

async function delegateConfigAdmin(accountId: string, principal: string) {
  const client = new OrganizationsClient({});
  const command = new RegisterDelegatedAdministratorCommand({
    AccountId: accountId,
    ServicePrincipal: principal,
  });
  await client.send(command);
}

async function isDelegatedAdministratorForService(accountId: string, servicePrincipal: string) {
  const client = new OrganizationsClient({});
  const command = new ListDelegatedServicesForAccountCommand({
    AccountId: accountId,
  });

  try {
    const { DelegatedServices } = await client.send(command);
    if (DelegatedServices!.length === 0) {
      // No current services have been delegated to the account.  Safe to add.
      return false;
    } else {
      const serviceInUse = DelegatedServices!.filter((service) => service.ServicePrincipal === servicePrincipal);

      // The list was empty, so the servicePrincipal was not in use for this account
      if (serviceInUse.length === 0) return false;

      // If the array was non-zero, the service was found for this account
      return true;
    }
  } catch (e) {
    if (e instanceof AccountNotRegisteredException) {
      // The account is not registerd at all, so it can be successfully registered for the service.
      return false;
    } else {
      console.error("Unhandled exception in isDelegateAdministratorForService command");
      throw new Error("Unhandled error");
    }
  }
}

export async function handler(event: CloudFormationCustomResourceEvent, context: Context): Promise<string> {
  console.log("event: ", event);
  const { guardDutyAdminAccountId, configAdminAccountId, cloudTrailAdminAccountId } = event.ResourceProperties;
  try {
    // GuardDuty
    if (await isOrganizationAdminAccount(guardDutyAdminAccountId)) {
      console.log(
        `${guardDutyAdminAccountId} is already a delegated administrator for GuardDuty.  No action necessary.`
      );
    } else {
      await delegateGuardDutyAdmin(guardDutyAdminAccountId);
    }

    // CloudTrail
    if (await isDelegatedAdministratorForService(configAdminAccountId, "cloudtrail.amazonaws.com")) {
      console.log(
        `${cloudTrailAdminAccountId} is already a delegated administrator for CloudTrail.  No action necessary.`
      );
    } else {
      await delegateCloudTrailAdmin(cloudTrailAdminAccountId);
    }

    // Config services - both are required, which is not noted in the console
    // https://aws.amazon.com/blogs/mt/using-delegated-admin-for-aws-config-operations-and-aggregation/
    const servicePrincipals = ["config.amazonaws.com", "config-multiaccountsetup.amazonaws.com"];

    for (const principal of servicePrincipals) {
      if (await isDelegatedAdministratorForService(configAdminAccountId, principal)) {
        console.log(
          `${configAdminAccountId} is already a delegated administrator for ${principal}.  No action necessary.`
        );
      } else {
        console.log(`Enabling Config admin access for ${configAdminAccountId} and principal ${principal} `);
        await delegateConfigAdmin(configAdminAccountId, principal);
      }
    }
    return "success";
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
      return error.message;
    }
    return "Unhandled error";
  }
}
