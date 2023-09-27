import { Cloudtrail } from "@common/cloudtrail";
import { Config } from "@common/config";
import { Kms } from "@common/kms";
import {
  accounts,
  awsConfigDetails,
  cloudTrailDetails,
  guardDutyDetails,
  iamAccessKeyAgeCheckDetails,
  organizationDetails,
  securityOrganizationViewOnlyRoleName,
} from "@config/coreConfig";
import { AthenaCloudTrail } from "@environments/security/cloudtrailAthena";
import { GuardDuty } from "@environments/security/guardduty";
import { IamAccessKeyAgeCheck } from "@environments/security/iam-access-key-age-check/iamAccessKeyAgeCheck";
import { IamRoles } from "@environments/security/iamRoles";
import { getAccountFromShortName } from "@helpers/accounts";
import { tagStackBuckets } from "@helpers/stacks";
import { Account } from "@lib/types";
import { App, Environment } from "aws-cdk-lib";
import { bucketTags } from "@config/taggingConfig";

export function securityStacks(app: App, env: Environment, accountDetails: Account) {
  const { organizationId } = organizationDetails;

  const cloudTrailStack = new Cloudtrail(app, "cloudtrail", {
    env,
    stackName: "cloudtrail-organization",
    description: "AWS Organization CloudTrail targets",
    s3Props: {
      bucketName: cloudTrailDetails.cloudtrailOrganizationBucketName,
      isOrganizationBucket: true,
    },
    // Remove the security account from the list of spoke accounts.  The security account is handled implicitly.
    organizationProps: {
      memberAccountIds: accounts.filter((account) => account.id !== accountDetails.id).map((account) => account.id),
      id: organizationId,
      managementAccountId: getAccountFromShortName("organization").id,
    },
  });
  tagStackBuckets(cloudTrailStack, bucketTags.cloudTrail);

  new GuardDuty(app, "guardduty", {
    env,
    stackName: "guardduty",
    description: "GuardDuty administration",
    detectorId: guardDutyDetails.securityAccountDetectorId,
    members: accounts
      .filter((account) => account.name !== accountDetails.name)
      .map((account) => {
        return {
          email: account.email,
          memberId: account.id,
        };
      }),
    protection: {
      enableS3LogDataSources: true,
      malwareScanning: {
        enabled: true,
        retainDetectedSnapshots: "NO_RETENTION",
        exclusionTags: [
          {
            Key: "guardduty-malware-scan-exclude",
            Value: "true",
          },
        ],
      },
    },
    snsEmailTargets: guardDutyDetails.snsAlertEmails,
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

  const configStack = new Config(app, "config", {
    env,
    stackName: "config",
    description: "AWS Config S3 Organization bucket",
    s3Props: {
      bucketName: awsConfigDetails.configOrganizationBucketName,
      isOrganizationBucket: true,
    },
    organizationProps: {
      id: organizationId,
      memberAccountIds: accounts.map((account) => account.id),
      deployConfigOrganizationAggregator:
        app.node.tryGetContext("deployConfigOrganizationAggregator") === "false" ? false : true,
    },
  });
  tagStackBuckets(configStack, bucketTags.awsConfig);

  const athenaCloudTrailStack = new AthenaCloudTrail(app, "athena-cloudtrail", {
    env,
    stackName: "athena-cloudtrail",
    description: "Athena resources for querying CloudTrail S3 output",
    cloudTrailDetails,
    organizationId: organizationDetails.organizationId,
  });
  tagStackBuckets(athenaCloudTrailStack, bucketTags.cloudTrail);

  const iamRolesStack = new IamRoles(app, "iam-roles", {
    env,
    stackName: "iam-roles",
    description: "IAM roles",
    securityOrganizationViewOnlyRoleName,
  });

  new IamAccessKeyAgeCheck(app, "iam-access-key-age-check", {
    env,
    stackName: "iam-access-key-age-check",
    description: "Lambda-based IAM user access key expiration notification mechanism",
    role: iamRolesStack.securityViewOnlyRole,
    minmumNotificationAge: iamAccessKeyAgeCheckDetails.minimumNotificationAge,
    snsEmailTargets: iamAccessKeyAgeCheckDetails.snsEmailTargets,
  });
}
