import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { IAMClient, ListAccountAliasesCommand } from "@aws-sdk/client-iam";
import { EventBridgeEvent, Context } from "aws-lambda";

const client = new SNSClient({});

async function getIamAccountAlias(): Promise<string> {
  const client = new IAMClient({});
  const command = new ListAccountAliasesCommand({});
  const response = await client.send(command);
  const alias = response.AccountAliases!.length > 0 ? response.AccountAliases![0] : "";
  return alias;
}

export async function handler(
  event: EventBridgeEvent<"GuardDuty Finding", any>,
  context: Context
): Promise<string | undefined> {
  console.log("event: ", event);
  const requiredEnvironmentVariables = ["MIN_FINDING_SEVERITY", "SNS_TOPIC_ARN"];
  requiredEnvironmentVariables.forEach((envVar) => {
    if (!process.env[envVar]) throw new Error(`Environment variable ${envVar} must be set.`);
  });

  const reportingAccountId = event.account;
  const { accountId: eventAccountId, description, id, region, severity, type: findingType } = event.detail;

  const minimumFindingSeverity = Number(process.env.MIN_FINDING_SEVERITY);
  if (severity < minimumFindingSeverity) {
    console.log(
      `Severity ${severity} was below the minimum finding threshold of ${minimumFindingSeverity}.  No notification sent.`
    );
    return;
  }

  let accountMessage;
  if (reportingAccountId !== eventAccountId) {
    // The finding came from a delegated administrator account
    accountMessage = `Once signed into the GuardDuty administration account, ${reportingAccountId},`;
  } else {
    // The finding came from the current account

    // Collect IAM alias and, if present, add to message for context
    const alias = await getIamAccountAlias();

    // If the alias is set, add it for some additional message context
    let aliasMessage = "";
    if (alias !== "") {
      aliasMessage = `${alias}/`;
    }
    accountMessage = `Sign into the ${aliasMessage}${eventAccountId} account`;
  }
  const message = `
Source Account ID: ${eventAccountId}
Description: ${description}
GuardDuty Event ID: ${id} (use this Finding ID for searching)

${accountMessage} and use this link to open the finding:
https://${region}.console.aws.amazon.com/guardduty/home?region=${region}#/findings?macros=current&fId=${id}
`;

  const command = new PublishCommand({
    Subject: `GuardDuty Notification - Severity ${severity} - ${findingType}`,
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
