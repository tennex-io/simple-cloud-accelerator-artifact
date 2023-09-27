import {
  IAMClient,
  CreateAccountAliasCommand,
  DeleteAccountAliasCommand,
  ListAccountAliasesCommand,
} from "@aws-sdk/client-iam";
import { CloudFormationCustomResourceEvent, Context } from "aws-lambda";

const client = new IAMClient({});

async function setAlias(alias: string): Promise<void> {
  const createCommand = new CreateAccountAliasCommand({
    AccountAlias: alias,
  });
  await client.send(createCommand);
  console.log(`IAM alias set to ${alias}`);
}

async function deleteAlias(alias: string): Promise<void> {
  console.log(`Removing existing alias: ${alias}`);
  const deleteCommand = new DeleteAccountAliasCommand({
    AccountAlias: alias,
  });
  await client.send(deleteCommand);
}
export async function handler(event: CloudFormationCustomResourceEvent, context: Context): Promise<string> {
  console.log("event: ", event);

  try {
    const listCommand = new ListAccountAliasesCommand({});
    const currentAlias = (await client.send(listCommand)).AccountAliases!;
    const targetAlias = event.ResourceProperties.alias;

    if (currentAlias.length === 1) {
      if (currentAlias[0] === targetAlias) {
        console.log("Current alias and target alias match.  No change.");
      } else {
        await deleteAlias(currentAlias[0]);
        await setAlias(targetAlias);
      }
    } else {
      console.log("No pre-existing alias found.");
      await setAlias(targetAlias);
    }

    return "success";
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
      return error.message;
    }
    return "Unhandled error";
  }
}
