import { getAccountFromShortName } from "@helpers/accounts";
import { shortAccountName } from "@lib/types";
import { App, Environment, Stack, Tags } from "aws-cdk-lib";
import * as chalk from "chalk";
/**
 * Convert a stack name with a specific word seperator into camel case
 * for stack Class lookups.
 *
 * @example shared-services becomes sharedServices
 *
 * @param name friendly account name
 * @param seperator string to seperate by.  defaults to '-'
 * @returns string
 */
export function normalizeStackName(name: string, seperator: string = "-") {
  const normalized = name.split(seperator).map((word, index) => {
    word = word.toLowerCase();
    if (index > 0) {
      word = word.charAt(0).toUpperCase() + word.slice(1);
    }
    return word;
  });
  return normalized.join("");
}

/**
 * Get the CDK stacks for a specific account
 *
 * @param app CDK app
 * @param env CDK environment
 * @param account account name from the core configuration
 * @param stackFunctionSuffix name of the stack function suffix
 *
 * E.g. an account named 'shared' must contain a function named 'sharedStacks' in
 * bin/account-stacks/\<YOUR_AWS_REGION\>/shared.ts
 * @returns void
 */
export function getStacks(
  app: App,
  env: Environment,
  account: shortAccountName,
  stackFunctionSuffix: string = "Stacks"
) {
  const accountDetails = getAccountFromShortName(account);

  // Dynamically import stacks based on region
  import(`@bin/account-stacks/${env.region}`).then((stacks) => {
    // Collect the stack names available from the barrel import
    const accountStackNames = Object.keys(stacks) as (keyof typeof stacks)[];

    // Get the stacks that match <accountName><functionStuffix>
    // E.g. devStacks()
    const stackName = accountStackNames.find(
      (key: keyof typeof stacks) => key === normalizeStackName(account) + stackFunctionSuffix
    );

    if (!stackName) {
      const normalizedStackName = chalk.bold(normalizeStackName(accountDetails.name));
      throw new Error(`
      No stacks found for account (${accountDetails.name}) ${accountDetails.id} with region ${env.region}
      To troubleshoot:
        - Make sure a 'region' is set in your AWS configuration file, or AWS_REGION environment variable is set appropriately.
        - An 'index.ts' barrel file exists in 'bin/account-stacks/${env.region}/'.
        - The barrel file (index.ts) properly exports the file containing the stacks for the ${account} account.
          E.g. export * from './${normalizedStackName}'
        - Per environment stacks, if they apply, are located in 'lib/environments/${normalizedStackName}'
        - The above file contains a line beginning with 'export function ${normalizedStackName}Stacks'
      `);
    }
    const stack = stacks[stackName];
    return stack(app, env, accountDetails);
  });
}

/**
 * Apply tags to all S3 buckets in a stack
 * @param stack CDK stack with S3 buckets
 * @param tags Tags to apply to S3 buckets
 */
export function tagStackBuckets(stack: Stack, tags: Record<string, string>) {
  Object.entries(tags).forEach(([key, value]) => {
    Tags.of(stack).add(key, value, { includeResourceTypes: ["AWS::S3::Bucket"] });
  });
}
