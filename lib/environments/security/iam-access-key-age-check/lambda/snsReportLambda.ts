import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { Context } from "aws-lambda";
import { generateReport } from "./helpers";
import { TargetAccountDetail } from "./types";

const client = new SNSClient({});

export async function handler(event: Record<"result", TargetAccountDetail>[], context: Context) {
  console.log("event: ", JSON.stringify(event, null, 2));

  if (!process.env.MIN_NOTIFICATION_AGE) {
    throw new Error("Environment variable MIN_NOTIFICATION_AGE is required.");
  }

  let message = "";

  const errors: string[] = [];
  const findings: string[] = [];
  event.forEach((entry) => {
    const { result } = entry;
    // Aggregate errors and keys in violation in their respective arrays
    if (result.error) {
      errors.push(`   - ${result.name} (${result.id})\n     Error: ${result.error})`);
    } else if (result.users) {
      findings.push(generateReport(result.users, result.id, result.name, Number(process.env.MIN_NOTIFICATION_AGE!)));
    }
  });

  // Report on errors
  if (errors.length > 0) {
    message += "Errors checking the following accounts\n";
    errors.forEach((error) => (message += `${error}\n`));
    message += "\n";
  }

  // Report on findings
  if (findings.length > 0) {
    message += "IAM Users Quick Link - https://console.aws.amazon.com/iamv2/home?#/users\n\n";
    findings.forEach((finding) => (message += `${finding}\n`));
  }

  const command = new PublishCommand({
    Subject: "IAM Access Key Organization Report",
    TopicArn: process.env.SNS_TOPIC_ARN,
    Message: message,
  });

  try {
    await client.send(command);
    console.log("Message delivered");
    return "success";
  } catch (error: unknown) {
    console.error(error);
    if (error instanceof Error) {
      return error.message;
    }
    return "Unhandled error";
  }
}
