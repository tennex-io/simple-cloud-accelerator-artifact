import {
  OrganizationsClient,
  EnablePolicyTypeCommand,
  EnablePolicyTypeCommandInput,
  DisablePolicyTypeCommandInput,
  ListRootsCommand,
  DisablePolicyTypeCommand,
} from "@aws-sdk/client-organizations";
import { Context } from "aws-lambda";
import { CustomResourceEvent, sleep } from "./util";

async function togglePolicyType(
  input: EnablePolicyTypeCommandInput | DisablePolicyTypeCommandInput,
  action: "ENABLE" | "DISABLE"
) {
  const client = new OrganizationsClient({});
  const command = action === "ENABLE" ? new EnablePolicyTypeCommand(input) : new DisablePolicyTypeCommand(input);
  console.log(`${action} action for ${input.PolicyType}`);
  await client.send(command);
}

export async function handler(event: CustomResourceEvent, context: Context): Promise<string> {
  console.log("event", event);
  const { organizationRootId, policyTypes: desiredPolicyTypes } = event.ResourceProperties;

  // Old resource properties do not exist on a first run
  let previousPolicyTypes: string[] = [];
  if (event.OldResourceProperties) {
    previousPolicyTypes = event.OldResourceProperties.policyTypes;
  }

  const client = new OrganizationsClient({});

  // Collect changes.  Some policy types may have been added or removed by the user
  const additions = desiredPolicyTypes.filter((policyType: string) => !previousPolicyTypes.includes(policyType));
  const subtractions = previousPolicyTypes.filter((policyType: string) => !desiredPolicyTypes.includes(policyType));

  const rootsCommand = new ListRootsCommand({});
  const rootsResponse = await client.send(rootsCommand);
  // PolicyTypes returns an empty array if policies are disabled
  // or an array of objects if the policies are enabled
  // [{
  //    "Type": "BACKUP_POLICY",
  //    "Status": "ENABLED"
  // }]
  const policyTypesStatus = rootsResponse.Roots![0].PolicyTypes;
  const existingPolicyMap: Record<string, string> = {};

  // E.g. BACKUP_POLICY: ENABLED
  policyTypesStatus?.forEach((policy) => {
    existingPolicyMap[policy.Type!] = policy.Status!;
  });

  try {
    for (const policyType of additions) {
      const existingStatus = existingPolicyMap[policyType];

      // Additions
      if (existingStatus === "ENABLED") {
        console.log(`Policy ${policyType} was already ENABLED.  Skipping.`);
      } else {
        const params = {
          PolicyType: policyType,
          RootId: organizationRootId,
        };
        await sleep(1);
        await togglePolicyType(params, "ENABLE");
      }
    }

    // Removals
    for (const policyType of subtractions) {
      const existingStatus = existingPolicyMap[policyType];
      if (existingStatus === "ENABLED") {
        const params = {
          PolicyType: policyType,
          RootId: organizationRootId,
        };
        await sleep(1);
        await togglePolicyType(params, "DISABLE");
      } else {
        console.log(`Policy ${policyType} was already DISABLED.  Skipping.`);
      }
    }
    return "success";
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
      return error.message;
    }
    return "Unhandled error";
  }
}
