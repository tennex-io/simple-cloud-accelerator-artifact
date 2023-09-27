import { BackupClient, UpdateRegionSettingsCommand } from "@aws-sdk/client-backup";
import { CloudFormationCustomResourceEvent, Context } from "aws-lambda";

export async function handler(event: CloudFormationCustomResourceEvent, context: Context) {
  console.log("event", event);

  const services: Record<string, string> = event.ResourceProperties.services;

  // The services object is delivered as Record<string, string>.  The function and underlying expects
  // Record<string, boolean> so we'll convert
  const parsedServices: Record<string, boolean> = {};
  Object.entries(services).forEach(([k, v]) => {
    parsedServices[k] = v === "true";
  });
  try {
    const client = new BackupClient({});
    const command = new UpdateRegionSettingsCommand({
      ResourceTypeOptInPreference: parsedServices,
    });
    const response = await client.send(command);
    console.log(JSON.stringify(response, null, 2));

    return "success";
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
      return error.message;
    }
    return "Unhandled error";
  }
}
