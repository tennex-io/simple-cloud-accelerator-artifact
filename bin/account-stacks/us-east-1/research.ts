import { Backup } from "@common/backup";
import { Config } from "@common/config";
import { IamRoles } from "@common/iamRoles";
import { Kms } from "@common/kms";
import { Route53event } from "@common/route53events";
import { Vpc } from "@common/vpc";
import {
  awsConfigDetails,
  backupDetails,
  organizationSecretNames,
  securityOrganizationViewOnlyRoleName,
  sharedServicesRoute53eventBusName,
} from "@config/coreConfig";
import { ResearchS3buckets } from "@environments/research/s3Bucket";
import { getAccountFromShortName } from "@helpers/accounts";
import { ACLsDisabledCheck, BucketEncryptionCheck } from "@lib/aspects/s3";
import { Account, friendlySubnetType, protocol } from "@lib/types";
import { App, Aspects, Environment } from "aws-cdk-lib";

export function researchStacks(app: App, env: Environment, accountDetails: Account) {
  new Config(app, "config", {
    env,
    stackName: "config",
    description: "AWS Config",
    s3Props: {
      bucketName: awsConfigDetails.configOrganizationBucketName,
      isExistingBucket: true,
    },
  });

  const kmsStack = new Kms(app, "kms", {
    env,
    stackName: "kms",
    description: "KMS Key Management",
    enableAwsBackupsKey: true,
    enableDefaultEbsEncryption: true,
    enableEbsKey: true,
    enableSecretsManagerKey: false,
  });

  const bucketStack = new ResearchS3buckets(app, "s3-buckets", {
    env,
    stackName: "s3-buckets",
    description: "primary S3 bucket stack",
  });
  Aspects.of(bucketStack).add(new BucketEncryptionCheck());
  Aspects.of(bucketStack).add(new ACLsDisabledCheck());

  // Identify spoke CIDRs that will have potential comms via the TGW
  const sharedAccount = getAccountFromShortName("shared-services");
  const tgwSecretArn = `arn:aws:secretsmanager:${env.region}:${sharedAccount.id}:secret:${organizationSecretNames.transitGateway}`;
  const spokeCidrs = [sharedAccount.primaryVpcCidr!];
  const vpcStack = new Vpc(app, "vpc", {
    env,
    stackName: "vpc",
    description: "Research VPC",
    name: "research",
    vpcProps: {
      cidrBlock: accountDetails.primaryVpcCidr,
      natType: "gateway",
      natGateways: 2,
      maxAzs: 6,
      transitGatewayProps: {
        sharedAccountSecretPartialArn: tgwSecretArn,
        routes: {
          private: spokeCidrs,
        },
      },
    },
  });
  spokeCidrs.forEach((cidr, idx) => {
    vpcStack.addNaclToSubnetType(friendlySubnetType.private, {
      action: "allow",
      cidr,
      protocol: protocol.all,
      ruleNumber: 200 + idx * 10,
    });
  });

  new Route53event(app, "route53-event-notifier", {
    env,
    stackName: "route53-event-notifier",
    description: "notify the shared services account when a new hosted zone is created",
    targetBusArn: `arn:aws:events:${env.region}:${sharedAccount.id}:event-bus/${sharedServicesRoute53eventBusName}`,
  });

  new Backup(app, "backups", {
    env,
    stackName: "backups",
    description: "AWS Backup configurations",
    kmsKey: kmsStack.backup,
    services: {
      Aurora: true,
      S3: true,
    },
    dailyBackupOneMonthVaultName: backupDetails.dailyBackupOneMonthVaultName,
    dailyBackupOneWeekVaultName: backupDetails.dailyBackupOneWeekVaultName,
    roleName: backupDetails.roleName,
  });

  new IamRoles(app, "iam-roles", {
    env,
    stackName: "iam-roles",
    description: "IAM roles",
    securityOrganizationViewOnlyRoleName,
  });
}
