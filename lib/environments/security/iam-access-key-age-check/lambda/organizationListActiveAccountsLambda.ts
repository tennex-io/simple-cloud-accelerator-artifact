import { getActiveOrganizationAccounts } from "./helpers";
import { Context } from "aws-lambda";

export async function handler(event: any, context: Context) {
  console.log("event: ", JSON.stringify(event, null, 2));
  const activeOrganizationAccounts = await getActiveOrganizationAccounts();
  const activeAccountIds = activeOrganizationAccounts?.map((account) => {
    return {
      id: account.Id,
      name: account.Name,
    };
  });
  return activeAccountIds;
}
