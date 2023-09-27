import { Route53Client, ChangeResourceRecordSetsCommand } from "@aws-sdk/client-route-53";
import { Context, EventBridgeEvent } from "aws-lambda";

// Permissions to create records for specific subdomains
// are set in the IAM policy for this function's role

export async function handler(event: EventBridgeEvent<any, any>, context: Context): Promise<any> {
  console.log("event", event);

  const requiredEnvVars = ["HOSTED_ZONE_ID", "BASE_DOMAIN"];
  requiredEnvVars.forEach((ev) => {
    if (!process.env[ev]) {
      throw new Error(`All environment variables in ${requiredEnvVars} are required.`);
    }
  });

  const elements = event.detail.responseElements;
  const subdomain = elements.hostedZone.name;
  const resolvedBaseDomain = subdomain.split(".").slice(-3).join(".");
  const nameServers = elements.delegationSet.nameServers;

  // IAM permissions prevent this, but we'll want to hard fail early on bad actors
  if (subdomain === process.env.BASE_DOMAIN) {
    throw new Error("Attempts to update the NS records for the base domain are not supported.");
  }

  // Confirm the subdomain is a child of the base domain we're managing
  if (resolvedBaseDomain !== process.env.BASE_DOMAIN) {
    console.warn(`Subdomain ${subdomain} is not a subdomain of ${process.env.BASE_DOMAIN}  Exiting.`);
    return "no_action";
  }

  try {
    const client = new Route53Client({});
    const command = new ChangeResourceRecordSetsCommand({
      HostedZoneId: process.env.HOSTED_ZONE_ID,
      ChangeBatch: {
        Comment: "NS record update for spoke account",
        Changes: [
          {
            // CREATE only.  If someone were to add a subdomain that already exists
            // in another account, we don't want it to break DNS for any existing resources.
            Action: "CREATE",
            ResourceRecordSet: {
              Name: subdomain,
              Type: "NS",
              TTL: 300,
              ResourceRecords: nameServers.map((ns: string) => ({ Value: ns })),
            },
          },
        ],
      },
    });
    await client.send(command);
    console.log(`Updated nameservers for ${subdomain} to ${nameServers}.`);
    return "success";
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
      return error.message;
    }
    return "Unhandled error";
  }
}
