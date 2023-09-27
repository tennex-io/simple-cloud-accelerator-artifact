import { Config } from "@common/config";
import { IamRoles } from "@common/iamRoles";
import { Kms } from "@common/kms";
import { awsConfigDetails, securityOrganizationViewOnlyRoleName } from "@config/coreConfig";
import { Account } from "@lib/types";
import { App, Environment } from "aws-cdk-lib";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function accountNameHereStacks(app: App, env: Environment, accountDetails: Account) {
  new Config(app, "config", {
    env,
    stackName: "config",
    description: "AWS Config",
    s3Props: {
      bucketName: awsConfigDetails.configOrganizationBucketName,
      isExistingBucket: true,
    },
  });

  new Kms(app, "kms", {
    env,
    stackName: "kms",
    description: "KMS Key Management",
    enableAwsBackupsKey: true,
    enableDefaultEbsEncryption: true,
    enableEbsKey: true,
    enableSecretsManagerKey: false,
  });

  new IamRoles(app, "iam-roles", {
    env,
    stackName: "iam-roles",
    description: "IAM roles",
    securityOrganizationViewOnlyRoleName,
  });
}
