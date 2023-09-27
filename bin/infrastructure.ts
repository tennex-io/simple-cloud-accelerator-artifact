import { Baseline } from "@common/baseline";
import { ConfigRuleSets } from "@common/configRuleSets";
import { awsConfigDetails } from "@config/coreConfig";
import { getAccountFromId } from "@helpers/accounts";
import { getStacks } from "@helpers/stacks";
import { App, Environment } from "aws-cdk-lib";

(async function main() {
  const app = new App();
  if (!process.env.CDK_DEFAULT_ACCOUNT) {
    throw Error(`
      Unable to resolve your AWS profile.
      Enter a profile with --profile, or set the AWS_PROFILE environment variable.
      If using either method and you still receive this error, confirm your credentials have not expired.

      Examples:
        npx cdk --profile <PROFILE_NAME> ls
        export AWS_PROFILE=<PROFILE_NAME>; npx cdk ls
    `);
  }
  const accountDetails = getAccountFromId(process.env.CDK_DEFAULT_ACCOUNT);
  const env: Environment = {
    account: accountDetails.id,
    region: process.env.CDK_DEFAULT_REGION,
  };

  // Stacks deployed in the primary region of all accounts
  if (env.region === accountDetails.primaryRegion) {
    new Baseline(app, "baseline", {
      env,
      iamAlias: accountDetails.iamAlias,
      description: "Catch-all stack",
      stackName: "baseline",
    });
  }

  // Stacks below are deployed in *all* regions of all accounts
  new ConfigRuleSets(app, "config-rule-sets", {
    env,
    stackName: "config-rule-sets",
    description: "AWS Config Rule Sets",
    monitoredTaggedResourceTypes: awsConfigDetails.monitoredTaggedResourceTypes,
  });

  // Handle the target account's specific stack deployments
  getStacks(app, env, accountDetails.name);
})().catch((e) => {
  console.error(e);
});
