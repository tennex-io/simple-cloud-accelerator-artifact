import { RAMClient, EnableSharingWithAwsOrganizationCommand } from "@aws-sdk/client-ram";
import { Context } from "aws-lambda";
import { CustomResourceEvent } from "./util";

export async function handler(event: CustomResourceEvent, context: Context): Promise<string> {
  console.log("event", event);
  try {
    const client = new RAMClient({});
    const command = new EnableSharingWithAwsOrganizationCommand({});
    await client.send(command);
    console.log("RAM Organization sharing enabled.");
    return "success";
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
      return error.message;
    }
    return "Unhandled error";
  }
}
