import { Cloudtrail } from "@common/cloudtrail";
import { CloudtrailDashboard } from "@common/cloudtrail-management-dashboard";
import { Config } from "@common/config";
import { IamRoles } from "@common/iamRoles";
import { Kms } from "@common/kms";
import {
  accounts,
  awsConfigDetails,
  backupDetails,
  cloudTrailDetails,
  organizationDetails,
  organizationScpDetails,
  securityOrganizationViewOnlyRoleName,
  storageLensBucketNamePrefix,
} from "@config/coreConfig";
import { ssoDetails } from "@config/ssoConfig";
import { bucketTags, requiredTags, tagEnforcement } from "@config/taggingConfig";
import { OrganizationBackup } from "@environments/organization/backup";
import { Budgets } from "@environments/organization/budgets";
import { CostAndUsage } from "@environments/organization/costAndUsage";
import { DefaultVpcRemoval } from "@environments/organization/defaultVpcRemoval";
import { GuardDuty } from "@environments/organization/guardduty";
import { Oam } from "@environments/organization/oam-sink";
import { OrganizationServices } from "@environments/organization/organization";
import { OrganizationCore } from "@environments/organization/organizationCore";
import { ServiceControlPolicies } from "@environments/organization/serviceControlPolicies";
import { Sso } from "@environments/organization/sso";
import { StorageLens } from "@environments/organization/storageLens";
import { TagPolicies } from "@environments/organization/tagPolicies";
import { getAccountFromShortName } from "@helpers/accounts";
import { tagStackBuckets } from "@helpers/stacks";
import { Account } from "@lib/types";
import { App, aws_cloudtrail as cloudtrail, Environment } from "aws-cdk-lib";

export function organizationStacks(app: App, env: Environment, accountDetails: Account) {
  const securityAccountDetails = getAccountFromShortName("security");

  new Budgets(app, "budgets", {
    accounts,
    env,
    stackName: "budgets",
    description: "account daily budgets",
  });

  const costAndUsageStack = new CostAndUsage(app, "cost-and-usage", {
    env,
    stackName: "cost-and-usage",
    description: "Cost and Usage reports",
  });
  tagStackBuckets(costAndUsageStack, bucketTags.costAndUsage);

  const organizationServicesStack = new OrganizationServices(app, "organization-services", {
    env,
    stackName: "organization-services",
    description: "AWS organization service management",
    enabledOrganizationServices: [
      "account.amazonaws.com",
      "backup.amazonaws.com",
      "cloudtrail.amazonaws.com",
      "config.amazonaws.com",
      "config-multiaccountsetup.amazonaws.com",
      "ds.amazonaws.com",
      "guardduty.amazonaws.com",
      "inspector.amazonaws.com",
      "license-management.marketplace.amazonaws.com",
      "malware-protection.guardduty.amazonaws.com",
      "ram.amazonaws.com",
      "securityhub.amazonaws.com",
      "storage-lens.s3.amazonaws.com",
      "sso.amazonaws.com",
      "tagpolicies.tag.amazonaws.com",
    ],
    enabledPolicyTypes: ["BACKUP_POLICY", "SERVICE_CONTROL_POLICY", "TAG_POLICY"],
    organizationRootId: organizationDetails.organizationRootId,
    delegatedAdministratorAccountIds: {
      guardDutyAdminAccountId: securityAccountDetails.id,
      configAdminAccountId: securityAccountDetails.id,
      cloudTrailAdminAccountId: securityAccountDetails.id,
    },
  });

  const organizationBackupsStack = new OrganizationBackup(app, "organization-backups", {
    env,
    stackName: "organization-backups",
    description:
      "Organization-wide backup polices.  Propagates to the assigned Organization resources (Root ID, OU, account, etc)",
    regions: organizationScpDetails.allowedRegions,
    targetIds: [organizationDetails.organizationRootId],
    roleName: backupDetails.roleName,
    dailyRetentionOneWeekDetails: {
      resourceSelectionTagPair: {
        key: "backup-retention",
        value: "7-days",
      },
      vaultName: backupDetails.dailyBackupOneWeekVaultName,
    },
    dailyRetentionOneMonthDetails: {
      resourceSelectionTagPair: {
        key: "backup-retention",
        value: "1-month",
      },
      vaultName: backupDetails.dailyBackupOneMonthVaultName,
    },
    services: {},
  });
  organizationBackupsStack.addDependency(organizationServicesStack);

  new GuardDuty(app, "guardduty", {
    env,
    stackName: "guardduty",
    description: "single enabled detector supporting delegated monitoring to the security account",
  });

  const defaultVpcRemovalStack = new DefaultVpcRemoval(app, "default-vpc-removal", {
    env,
    stackName: "lambda-default-vpc-removal",
    description: "Lambda function to remove default VPCs in spoke accounts",
    targetRegions: organizationScpDetails.allowedRegions,
  });

  const organizationCoreStack = new OrganizationCore(app, "organization-core", {
    env,
    stackName: "organization-core",
    description: "manages accounts and organizational units",
    accounts: accounts.filter((account) => account.name !== "organization"),
    organizationRootId: organizationDetails.organizationRootId,
    organizationalUnits: organizationDetails.organizationalUnits,
  });
  // Add dependency to ensure default VPCs are removed before accounts are created
  organizationCoreStack.addDependency(defaultVpcRemovalStack);

  const allOrganizationalUnits = Object.values(organizationCoreStack.ous);
  new ServiceControlPolicies(app, "scps", {
    env,
    stackName: "service-control-policies",
    description: "AWS Organization Service Control Policies and associated assignments",
    restrictToRegions: {
      regions: organizationScpDetails.allowedRegions,
      // All individual OUs
      targetIds: allOrganizationalUnits,
    },
    preventS3Removals: {
      bucketsDetails: {
        [awsConfigDetails.configOrganizationBucketName]: ["/*"],
        [cloudTrailDetails.cloudtrailOrganizationBucketName]: ["/*"],
      },
      targetIds: [organizationCoreStack.ous.Security],
    },
  });

  if (requiredTags) {
    new TagPolicies(app, "tag-policies", {
      env,
      stackName: "tag-policies",
      description: "AWS Organization Tag Policies",
      requiredTags,
      tagEnforcement,
    });
  }

  // primary management trail
  new Cloudtrail(app, "cloudtrail", {
    env,
    stackName: "cloudtrail-organization",
    description: "AWS Organization CloudTrail",
    kmsKey: `arn:aws:kms:${env.region}:${securityAccountDetails.id}:alias/cloudtrail`,
    s3Props: {
      bucketName: cloudTrailDetails.cloudtrailOrganizationBucketName,
      isExistingBucket: true,
    },
    trailProps: {
      insightsProps: {
        monitorApiErrorRate: true,
        monitorApiRate: true,
      },
      isOrganizationTrail: true,
      logToCloudWatchLogs: true,
      logGroupPrefix: cloudTrailDetails.cloudwatchLogPrefix,
      name: cloudTrailDetails.primaryTrailName,
      s3LoggingPrefix: cloudTrailDetails.primaryTrailS3LoggingPrefix,
      trailType: "MANAGEMENT",
    },
  });

  // data trail
  if (cloudTrailDetails.enableDataTrail) {
    new Cloudtrail(app, "cloudtrail-data", {
      env,
      stackName: "cloudtrail-data-events",
      description: "AWS Organization CloudTrail for data events",
      kmsKey: `arn:aws:kms:${env.region}:${securityAccountDetails.id}:alias/cloudtrail`,
      s3Props: {
        bucketName: cloudTrailDetails.cloudtrailOrganizationBucketName,
        isExistingBucket: true,
      },
      trailProps: {
        dataEventLogging: {
          allBuckets: cloudtrail.ReadWriteType.ALL,
        },
        insightsProps: {
          monitorApiErrorRate: true,
          monitorApiRate: true,
        },
        isOrganizationTrail: true,
        logToCloudWatchLogs: true,
        logGroupPrefix: cloudTrailDetails.cloudwatchLogPrefix,
        name: cloudTrailDetails.dataTrailName,
        s3LoggingPrefix: cloudTrailDetails.dataTrailS3LoggingPrefix,
        trailType: "DATA",
      },
    });
  }

  new CloudtrailDashboard(app, "cloudtrail-management-dashboard", {
    env,
    description: "cloudwatch dashboard for cloudtrail management events",
    stackName: "cloudtrail-management-dashboard",
    cloudTrailLogGroupName: `${cloudTrailDetails.cloudwatchLogPrefix}${cloudTrailDetails.primaryTrailName}`,
  });

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
    organizationSecretSharingKey: {
      organizationId: organizationDetails.organizationId,
    },
  });

  // If the SSO instance ARN has been set, deploy the stack.
  if (ssoDetails.instanceArn.startsWith("arn:aws:sso:::instance/ssoins-")) {
    new Sso(app, "sso", {
      env,
      stackName: "aws-sso",
      description: "manage AWS SSO permission sets and group assignments to specific accounts",
      instanceArn: ssoDetails.instanceArn,
      groupIds: ssoDetails.groupIds,
    });
  }

  const storageLensStack = new StorageLens(app, "storage-lens", {
    env,
    stackName: "storage-lens",
    description: "S3 storage lens dashboards and metric export bucket",
    bucketName: `${storageLensBucketNamePrefix}-${accountDetails.id}`,
    dashboardName: "organization-overview",
    organizationId: organizationDetails.organizationId,
  });
  storageLensStack.addDependency(organizationServicesStack);
  tagStackBuckets(storageLensStack, bucketTags.storageLens);

  new Oam(app, "oam", {
    env,
    stackName: "oam",
    description: "CloudWatch Observability Access Manager sink with organization access",
    kmsKey: kmsStack.organizationSecretSharing,
    organizationId: organizationDetails.organizationId,
  });

  new IamRoles(app, "iam-roles", {
    env,
    stackName: "iam-roles",
    description: "IAM roles",
    securityOrganizationViewOnlyRoleName,
  });
}
