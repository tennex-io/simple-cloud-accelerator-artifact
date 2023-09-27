import { S3ControlClient, PutPublicAccessBlockCommand } from "@aws-sdk/client-s3-control";
import { CloudFormationCustomResourceEvent, Context } from "aws-lambda";

const client = new S3ControlClient({});

export async function handler(event: CloudFormationCustomResourceEvent, context: Context): Promise<string> {
  console.log("event: ", event);

  try {
    const blockCommand = new PutPublicAccessBlockCommand({
      AccountId: event.ResourceProperties.accountId,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    await client.send(blockCommand);

    return "success";
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
      return error.message;
    }
    return "Unhandled error";
  }
}
