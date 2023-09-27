import { Config } from "@common/config";
import { awsConfigDetails } from "@config/coreConfig";
import { Account } from "@lib/types";
import { App, Environment } from "aws-cdk-lib";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function exampleAccountStacks(app: App, env: Environment, accountDetails: Account) {
  new Config(app, "config", {
    env,
    stackName: "config",
    description: "AWS Config",
    s3Props: {
      bucketName: awsConfigDetails.configOrganizationBucketName,
      isExistingBucket: true,
    },
  });
}
