import { IAMClient, UpdateAccountPasswordPolicyCommand } from "@aws-sdk/client-iam";
import { CloudFormationCustomResourceEvent, Context } from "aws-lambda";

export async function handler(event: CloudFormationCustomResourceEvent, context: Context): Promise<string> {
  console.log("event", event);
  const client = new IAMClient({});

  try {
    const modifyCommand = new UpdateAccountPasswordPolicyCommand({
      AllowUsersToChangePassword: event.ResourceProperties.allowUsersToChangePassword,
      MaxPasswordAge: event.ResourceProperties.maxPasswordAge,
      MinimumPasswordLength: event.ResourceProperties.minimumPasswordLength,
      PasswordReusePrevention: event.ResourceProperties.passwordReusePrevention,
      RequireLowercaseCharacters: event.ResourceProperties.requireLowercaseCharacters,
      RequireNumbers: event.ResourceProperties.requireNumbers,
      RequireSymbols: event.ResourceProperties.requireSymbols,
      RequireUppercaseCharacters: event.ResourceProperties.requireUppercaseCharacters,
    });
    await client.send(modifyCommand);
    return "success";
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
      return error.message;
    }
    return "Unhandled error";
  }
}
