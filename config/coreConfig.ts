import {
  Account,
  AwsConfigDetails,
  CloudTrailDetails,
  GuardDutyDetails,
  GuardDutySeverity,
  OrganizationScpDetails,
} from "@lib/types";
import { aws_config as config } from "aws-cdk-lib";

export const accountNames = ["organization", "research", "security", "shared-services"] as const;

// Budget default settings.  Customizations can be done in the primary account object array
const baseBudget = {
  dollarLimit: 10,
  percentageWarning: 80,
  accountEmailTargets: ["REQUIRES_CONFIGURATION"],
};

export const cloudTrailDetails: CloudTrailDetails = {
  cloudtrailOrganizationBucketName: "REQUIRES_CONFIGURATION",
  cloudwatchLogPrefix: "/cloudtrail/",
  dataTrailName: "organization-data-events",
  dataTrailS3LoggingPrefix: "data",
  enableDataTrail: true,
  primaryTrailName: "organization-management",
  primaryTrailS3LoggingPrefix: "management",
};

export const awsConfigDetails: AwsConfigDetails = {
  configOrganizationBucketName: "REQUIRES_CONFIGURATION",
  monitoredTaggedResourceTypes: [
    config.ResourceType.EBS_VOLUME,
    config.ResourceType.EC2_INSTANCE,
    config.ResourceType.RDS_DB_INSTANCE,
    config.ResourceType.S3_BUCKET,
  ],
};

// List of CIDR ranges for on-premises networks
export const onPremisesCidrs = ["UNUSED"];

// The name of your top-level domain, if desired.  This should be created manually
// in the shared-services account
export const topLevelDomainName = "UNUSED";

export const organizationScpDetails: OrganizationScpDetails = {
  allowedRegions: ["REQUIRES_CONFIGURATION"],
};

export const organizationDetails = {
  organizationId: "REQUIRES_CONFIGURATION",
  organizationRootId: "REQUIRES_CONFIGURATION",
  organizationalUnits: ["Contract Research Organization", "Infrastructure", "Research", "Suspended", "Security"],
} as const;

export const accounts: Account[] = [
  {
    name: "organization",
    budget: baseBudget,
    email: "REQUIRES_CONFIGURATION",
    iamAlias: "REQUIRES_CONFIGURATION",
    id: "",
    primaryRegion: "REQUIRES_CONFIGURATION",
  },
  {
    name: "research",
    budget: {
      ...baseBudget,
      dollarLimit: 2000,
    },
    email: "REQUIRES_CONFIGURATION",
    iamAlias: "REQUIRES_CONFIGURATION",
    id: "",
    parentOrganizationalUnit: "Research",
    primaryRegion: "REQUIRES_CONFIGURATION",
    primaryVpcCidr: "REQUIRES_CONFIGURATION",
  },
  {
    name: "security",
    budget: baseBudget,
    email: "REQUIRES_CONFIGURATION",
    iamAlias: "REQUIRES_CONFIGURATION",
    id: "",
    parentOrganizationalUnit: "Security",
    primaryRegion: "REQUIRES_CONFIGURATION",
  },
  {
    name: "shared-services",
    budget: baseBudget,
    email: "REQUIRES_CONFIGURATION",
    iamAlias: "REQUIRES_CONFIGURATION",
    id: "",
    parentOrganizationalUnit: "Infrastructure",
    primaryRegion: "REQUIRES_CONFIGURATION",
    primaryVpcCidr: "REQUIRES_CONFIGURATION",
  },
];

// VPC Prefix lists are created in the Shared Services account and shared to the Organization
// for use in security groups
export const prefixLists = {
  "shared-services-vpc": accounts
    .filter(acct => acct.name === "shared-services")
    .map(acc => acc.primaryVpcCidr!),
  "all-organization-vpcs": accounts
    .filter(acc => acc.primaryVpcCidr)
    .map(acc => acc.primaryVpcCidr!),
};

export const guardDutyDetails: GuardDutyDetails = {
  securityAccountDetectorId: "UPDATE_POST_SECURITY_DEPLOYMENT",
  minimumFindingSeverity: GuardDutySeverity.LOW,
  snsAlertEmails: ["REQUIRES_CONFIGURATION"],
};

// Names of secrets shared to the organization
export const organizationSecretNames = {
  // AWS Observability Access Manager
  oamArn: "oam-sink-arn",
  transitGateway: "transitGateway",
} as const;

// Name of the role deployed in accounts outside the management account
// Allows Organization dashboards to collect details from spoke accounts of observability
// Used by Lambda and CloudWatch itself
export const cloudWatchDashboardOrganizationRoleName = "CloudWatch-CrossAccountSharingRole";

// Name of the event bus in the shared services account.
// Hosted zone deployments in spoke accounts will publish events here for NS record delagation
export const sharedServicesRoute53eventBusName = "route53";

// Name of the Security View Only role, which exists in all accounts.
// The role in the security group can assume the role in the spoke
// accounts with view only access for reporting
export const securityOrganizationViewOnlyRoleName = "security-view-only";

// This name will be suffixed with the account ID.  E.g. organization-storage-lens-metrics-99999999999
export const storageLensBucketNamePrefix = "organization-storage-lens-metrics" as const;

// IAM Access Keys older than this number of days will be reported to the following emails each week
export const iamAccessKeyAgeCheckDetails = {
  minimumNotificationAge: 90,
  snsEmailTargets: ["REQUIRES_CONFIGURATION"],
};

// Backup details are used by the Organization for backup policies
// and spoke accounts for role and vault name consistency with the Organization policies
export const backupDetails = {
  dailyBackupOneMonthVaultName: "daily-backups-one-month-retention",
  dailyBackupOneWeekVaultName: "daily-backups-one-week-retention",
  roleName: "backup-service",
};
