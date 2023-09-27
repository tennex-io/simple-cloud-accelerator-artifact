import { EC2Client, EnableEbsEncryptionByDefaultCommand, ModifyEbsDefaultKmsKeyIdCommand } from "@aws-sdk/client-ec2";
import { CloudFormationCustomResourceEvent, Context } from "aws-lambda";

export async function handler(event: CloudFormationCustomResourceEvent, context: Context): Promise<string> {
  console.log("event", event);
  const client = new EC2Client({});

  try {
    const modifyCommand = new ModifyEbsDefaultKmsKeyIdCommand({
      KmsKeyId: event.ResourceProperties.kmsKeyArn,
    });
    await client.send(modifyCommand);
    const enableCommand = new EnableEbsEncryptionByDefaultCommand({});
    await client.send(enableCommand);
    return "success";
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
      return error.message;
    }
    return "Unhandled error";
  }
}
