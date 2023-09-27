import { AthenaClient, GetNamedQueryCommand, StartQueryExecutionCommand } from "@aws-sdk/client-athena";
import { CloudFormationCustomResourceEvent, Context } from "aws-lambda";

async function getQueryString(namedQueryId: string) {
  const client = new AthenaClient({});
  const command = new GetNamedQueryCommand({
    NamedQueryId: namedQueryId,
  });
  const response = await client.send(command);
  return response.NamedQuery!.QueryString!;
}

export async function handler(event: CloudFormationCustomResourceEvent, context: Context) {
  console.log("event: ", event);
  try {
    const { database, workGroup, namedQueryIds } = event.ResourceProperties;
    const client = new AthenaClient({});

    await Promise.all(
      namedQueryIds.map(async (queryId: string) => {
        const queryString = await getQueryString(queryId);
        const command = new StartQueryExecutionCommand({
          QueryString: queryString,
          QueryExecutionContext: {
            Catalog: "AwsDataCatalog",
            Database: database,
          },
          WorkGroup: workGroup,
        });
        await client.send(command);
      })
    );

    return "success";
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
      return error.message;
    }
    return "Unhandled error";
  }
}
