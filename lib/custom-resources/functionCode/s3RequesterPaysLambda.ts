import { S3Client, PutBucketRequestPaymentCommand } from "@aws-sdk/client-s3";
import { CloudFormationCustomResourceEvent, Context } from "aws-lambda";

export async function handler(event: CloudFormationCustomResourceEvent, context: Context) {
  console.log("event: ", event);
  const targetBucket = event.ResourceProperties.bucketName;
  try {
    const client = new S3Client({});
    const command = new PutBucketRequestPaymentCommand({
      Bucket: targetBucket,
      RequestPaymentConfiguration: {
        Payer: "Requester",
      },
    });
    await client.send(command);
    return "success";
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
      return error.message;
    }
    return "Unhandled error";
  }
}
