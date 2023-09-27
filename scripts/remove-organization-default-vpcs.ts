import {
  DescribePolicyCommand,
  ListAccountsCommand,
  ListPoliciesCommand,
  OrganizationsClient,
} from "@aws-sdk/client-organizations";
import { ListStateMachinesCommand, SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline";

const client = new OrganizationsClient({});

type SfnPayload = {
  targetAccountId: string;
  targetRegions: string[];
};

async function getOrganizationAccounts() {
  const command = new ListAccountsCommand({});
  const response = await client.send(command);
  return response.Accounts!;
}

async function getStepFunctionByName(name: string) {
  const sfnClient = new SFNClient({});
  const command = new ListStateMachinesCommand({});
  const response = await sfnClient.send(command);

  if (response.stateMachines!.length === 0) {
    throw new Error("No state machines found");
  }

  const stateMachine = response.stateMachines!.filter((stateMachine) => stateMachine.name === name)[0];

  if (!stateMachine) {
    throw new Error(`No state machine found with name ${name}`);
  }

  return stateMachine;
}

async function startStepFunction(stateMachineArn: string, payload: SfnPayload) {
  const sfnClient = new SFNClient({});
  const command = new StartExecutionCommand({
    input: JSON.stringify(payload),
    stateMachineArn,
  });
  const response = await sfnClient.send(command);
  return response;
}

async function getPolicyByName(name: string) {
  const command = new ListPoliciesCommand({
    Filter: "SERVICE_CONTROL_POLICY",
  });
  const response = await client.send(command);
  const regionRestrictPolicy = response.Policies!.filter((policy) => policy.Name === name);

  if (regionRestrictPolicy.length === 0) {
    throw new Error("No region-restrict policy found");
  }

  return regionRestrictPolicy[0].Id!;
}

async function getPolicyBody(policyId: string) {
  const describePolicyCommand = new DescribePolicyCommand({
    PolicyId: policyId,
  });
  const describePolicyResponse = await client.send(describePolicyCommand);
  const policyBody = JSON.parse(describePolicyResponse.Policy?.Content!);
  return policyBody;
}

(async () => {
  const accounts = await getOrganizationAccounts();
  const accountIds = accounts!.map((account) => account.Id!);

  const policyId = await getPolicyByName("region-restrict");
  const policyBody = await getPolicyBody(policyId);
  const targetRegions = policyBody.Statement[0].Condition.StringNotEquals["aws:RequestedRegion"];

  const rl = readline.createInterface({ input, output });

  console.log("This script will remove the default VPC from the following accounts in the Organization:\n");
  accounts.forEach((account) => console.log(`  - ${account.Name} (${account.Id})`));
  console.log(`\nIn the following regions: ${targetRegions.join(", ")}`);

  const answer = await new Promise((resolve) => {
    rl.question("Continue? (y/n): ", resolve);
  });

  if (answer === "y") {
    const stateMachine = await getStepFunctionByName("spoke-account-default-vpc-removal");
    const promises = accountIds.map(async (accountId) => {
      const payload: SfnPayload = {
        targetAccountId: accountId,
        targetRegions,
      };
      console.log(`Exection dispatched for account ${accountId}`);
      await startStepFunction(stateMachine.stateMachineArn!, payload);
    });
    await Promise.all(promises);

    console.log(`Successfully started ${promises.length} executions.`);
  } else {
    console.log("Exiting.");
  }
  rl.close();
})();
