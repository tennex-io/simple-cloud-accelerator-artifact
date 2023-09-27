import {
  OrganizationsClient,
  EnableAWSServiceAccessCommand,
  DisableAWSServiceAccessCommand,
  ListAWSServiceAccessForOrganizationCommand,
  ConcurrentModificationException,
} from "@aws-sdk/client-organizations";
import { Context } from "aws-lambda";
import { sleep, CustomResourceEvent } from "./util";

async function listSerivceAccess() {
  const client = new OrganizationsClient({});
  const command = new ListAWSServiceAccessForOrganizationCommand({});
  const response = await client.send(command);
  return response.EnabledServicePrincipals!;
}

async function toggleServiceAccess(servicePrincipal: string, action: "ENABLE" | "DISABLE") {
  const client = new OrganizationsClient({});
  const params = { ServicePrincipal: servicePrincipal };
  const command =
    action === "ENABLE" ? new EnableAWSServiceAccessCommand(params) : new DisableAWSServiceAccessCommand(params);
  await sleep(10);
  console.log(`${action} action for ${servicePrincipal}`);
  // throttle because the org API is sensitive to rates
  try {
    await client.send(command);
  } catch (e) {
    // The org API occasionally rejects modifications.  Back off once and retry.
    if (e instanceof ConcurrentModificationException) {
      console.log("Received ConcurrentModificationException.  Backing off and retrying once.");
      await sleep(10);
      console.log("Retrying");
      await client.send(command);
      console.log("Retry complete");
    }
  }
}

export async function handler(event: CustomResourceEvent, context: Context): Promise<string> {
  console.log("event", event);

  const desiredServicePrincipals = event.ResourceProperties.servicePrincipals;
  let previousServicePrincipals: string[] = [];

  if (event.OldResourceProperties) {
    previousServicePrincipals = event.OldResourceProperties.servicePrincipals;
  }

  // Collect changes.  Some policy types may have been added or removed by the user
  const additions = desiredServicePrincipals.filter((servicePrincipal: string) => {
    return !previousServicePrincipals.includes(servicePrincipal);
  });
  const subtractions = previousServicePrincipals.filter((servicePrincipal: string) => {
    return !desiredServicePrincipals.includes(servicePrincipal);
  });

  // Array of existing service principals.  E.g. ['cloudtrail.amazonaws.com']
  const currentServiceAccess = (await listSerivceAccess()).map((service) => service.ServicePrincipal);

  try {
    for (const servicePrincipal of additions) {
      if (currentServiceAccess.includes(servicePrincipal)) {
        console.log(`${servicePrincipal} is already enabled.  Skipping addition.`);
      } else {
        await toggleServiceAccess(servicePrincipal, "ENABLE");
      }
    }
    for (const servicePrincipal of subtractions) {
      if (currentServiceAccess.includes(servicePrincipal)) {
        await toggleServiceAccess(servicePrincipal, "DISABLE");
      } else {
        console.log(`${servicePrincipal} was not previously enabled.  Skipping removal.`);
      }
    }
    return "success";
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
      return error.message;
    }
    return "Unhandled error";
  }
}
