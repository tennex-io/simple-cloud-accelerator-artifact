import { DescribeManagedPrefixListsCommand, EC2Client } from "@aws-sdk/client-ec2";
import { CloudFormationCustomResourceEvent, Context } from "aws-lambda";

export async function handler(event: CloudFormationCustomResourceEvent, context: Context) {
  console.log("event: ", JSON.stringify(event, null, 2));

  try {
    const client = new EC2Client({});
    const command = new DescribeManagedPrefixListsCommand({});
    const response = await client.send(command);

    const results: Record<string, string> = {};
    // If a prefix list is not an AWS-managed list, create an object in { name: id } format for name based lookups
    response.PrefixLists?.forEach((prefixList) => {
      if (prefixList.OwnerId !== "AWS") {
        results[prefixList.PrefixListName!] = prefixList.PrefixListId!;
      }
    });

    console.log(`response is ${JSON.stringify(results, null, 2)}`);
    return {
      Data: results,
    };
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
      return error.message;
    }
    return "Unhandled error";
  }
}
