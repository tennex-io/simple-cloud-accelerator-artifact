import { ScanConditionPair } from "@aws-sdk/client-guardduty";
import { accountNames, organizationDetails, prefixLists } from "@config/coreConfig";
import { requiredTags } from "@config/taggingConfig";
import { aws_config as config } from "aws-cdk-lib";

export type shortAccountName = (typeof accountNames)[number];

export enum friendlySubnetType {
  "public" = "public",
  "private" = "private",
  "isolated" = "isolated",
  "transit" = "transit",
}

export enum protocol {
  "all" = -1,
  "icmp" = 1,
  "tcp" = 6,
  "udp" = 17,
}

export interface naclEntry {
  /**
   * Allow or deny NACL
   */
  action: "allow" | "deny";
  /**
   * CIDR
   *
   * @example 10.0.0.0/16
   */
  cidr: string;
  /**
   * Egress or ingress
   *
   * @default false (allows ingress)
   */
  egress?: boolean;
  /**
   * Port range for specific network protocols
   *
   * At least one of 'from' or 'to' is required.
   */
  portRange?: {
    from?: number;
    to?: number;
  };
  /**
   * Network protocol
   */
  protocol: protocol;
  /**
   * Rule priority.  Rule numbers must not overlap.
   * Lowest number is honored first.
   */
  ruleNumber: number;
}

export type securityGroupEntry = {
  cidr: string;
  description: string;
};
export interface AccountBudget {
  /**
   * Top limit of the daily budget.
   */
  dollarLimit: number;
  /**
   * Percentage of the top limit to warn at.
   *
   * A value of 80 would alert at 80% of the dollarLimit property.
   */
  percentageWarning: number;
  /**
   * Email targets for the budgets.
   * Budget alerts are sent via AWS Budgets, NOT SNS.
   */
  accountEmailTargets?: string[];
}

type RequiredTags = {
  [key in keyof typeof requiredTags]: (typeof requiredTags)[key][number];
};

export interface MinimumRequiredTags extends RequiredTags {
  [key: string]: string;
}

export interface Account {
  budget?: AccountBudget;
  /**
   * Root account email.  Primarily used for AWS GuardDuty.
   */
  email: string;
  /**
   * IAM Alias.  Must be unique across ALL AWS accounts.
   */
  iamAlias: string;
  /**
   * AWS account ID - 12 digits
   */
  id: string;
  /**
   * Friendly name for the account.
   *
   * @example security
   * @example org
   */
  name: shortAccountName;
  /**
   * Parent Organizational Unit for the account
   *
   */
  parentOrganizationalUnit?: (typeof organizationDetails.organizationalUnits)[number];
  /**
   * Primary AWS Region
   */
  primaryRegion: validRegion;
  /**
   * Primary VPC CIDR
   */
  primaryVpcCidr?: string;
  /**
   * Account name used for account creation
   *
   * This is the account name is represented in AWS SSO.
   * If importing an account, use this to import with the existing name.
   */
  ssoAccountName?: string;
  /**
   * Name of the Route53 zone to be created
   */
  zoneName?: string;
}

export interface OrganizationScpDetails {
  /**
   * List of valid AWS Regions
   */
  allowedRegions: validRegion[];
}

export interface S3Props {
  /**
   * Bucket name, used for both new or existing bucket
   */
  bucketName: string;
  /**
   * Log to an existing bucket.
   * If unset, a bucket will be created
   *
   * @default false
   */
  isExistingBucket?: boolean;
  /**
   * Bucket is for an AWS Organization trail
   *
   * @default false
   */
  isOrganizationBucket?: boolean;
}

// List at https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-access-logs.html#access-logging-bucket-permissions
export const elbAccountByRegion = {
  "us-east-1": "127311923021",
  "us-east-2": "033677994240",
  "us-west-1": "027434742980",
  "us-west-2": "797873946194",
  "af-south-1": "098369216593",
  "ca-central-1": "985666609251",
  "eu-central-1": "054676820928",
  "eu-west-1": "156460612806",
  "eu-west-2": "652711504416",
  "eu-south-1": "635631232127",
  "eu-west-3": "009996457667",
  "eu-north-1": "897822967062",
  "ap-east-1": "754344448648",
  "ap-northeast-1": "582318560864",
  "ap-northeast-2": "600734575887",
  "ap-northeast-3": "383597477331",
  "ap-southeast-1": "114774131450",
  "ap-southeast-2": "783225319266",
  "ap-southeast-3": "589379963580",
  "ap-south-1": "718504428378",
  "me-south-1": "076674570225",
  "sa-east-1": "507241528517",
} as const;

export type validRegion = keyof typeof elbAccountByRegion;

export interface DelegatedAdministratorAccountIds {
  /**
   * AWS Account ID of the desired AWS CloudTrail administration account
   */
  cloudTrailAdminAccountId: string;
  /**
   * AWS Account ID of the desired AWS Config administration account
   */
  configAdminAccountId: string;
  /**
   * AWS Account ID of the desired GuardDuty administration account
   */
  guardDutyAdminAccountId: string;
}

// Thresholds from https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_findings.html
export enum GuardDutySeverity {
  LOW = 1,
  MEDIUM = 4,
  HIGH = 7,
}

export interface GuardDutyDetails {
  /**
   * Minimum finding threshold for email alerting
   *
   * @default 'LOW'
   */
  minimumFindingSeverity?: GuardDutySeverity;
  /**
   * GuardDuty detector ID from the Security account
   */
  securityAccountDetectorId: string;
  /**
   * List of email addresses that will receive GuardDuty alerts
   */
  snsAlertEmails: string[];
}

export interface GuardDutyProtection {
  /**
   * Enable Kubernetes audit log evaluation
   *
   * @link https://docs.aws.amazon.com/guardduty/latest/ug/kubernetes-protection.html
   * @default false
   */
  enableKubernetesAuditLogs?: boolean;
  /**
   * Enable Malware Scanning on EBS Volumes
   *
   * @link https://docs.aws.amazon.com/guardduty/latest/ug/malware-protection.html
   * @default false
   */
  malwareScanning?: {
    enabled: boolean;
    /**
     * Whether or not snapshots with volumes will be retained
     *
     * @link https://docs.aws.amazon.com/guardduty/latest/ug/malware-protection-customizations.html
     */
    retainDetectedSnapshots: "NO_RETENTION" | "RETENTION_WITH_FINDING";
    /**
     * EC2 instance tags to **exclude** from scans
     *
     * Cannot be used with inclusionTags
     *
     * @example
     * ```
     * [
     *   {
     *     Key: 'exclude-malware-scan',
     *     Value: 'true'
     *   },
     * ]
     * ```
     */
    exclusionTags?: ScanConditionPair[];
    /**
     * EC2 instance tags to **include** from scans
     *
     * Cannot be used with inclusionTags
     *
     * @example
     * ```
     * [
     *   {
     *     Key: 'include-malware-scan',
     *     Value: 'true'
     *   },
     * ]
     * ```
     */
    inclusionTags?: ScanConditionPair[];
  };
  /**
   * Enable S3 Protection
   *
   * @link https://docs.aws.amazon.com/guardduty/latest/ug/s3-protection.html
   * @default false
   */
  enableS3LogDataSources?: boolean;
}

export interface BackupServiceEnabledStatus {
  /**
   * Aurora
   *
   * @default false
   */
  Aurora?: boolean;
  /**
   * CloudFormation
   *
   * @default false
   */
  CloudFormation?: boolean;
  /**
   * DocumentDB
   *
   * @default false
   */
  DocumentDB?: boolean;
  /**
   * DynamoDb
   *
   * @default false
   */
  DynamoDB?: boolean;
  /**
   * EBS
   *
   * @default true
   */
  EBS?: boolean;
  /**
   * EC2
   *
   * @default true
   */
  EC2?: boolean;
  /**
   * EFS
   *
   * @default true
   */
  EFS?: boolean;
  /**
   * FSx
   *
   * Includes FSx for Lustre, ONTAP, OpenZFS and Windows file server.
   *
   * @default true
   */
  FSx?: boolean;
  /**
   * Neptune
   *
   * @default false
   */
  Neptune?: boolean;
  /**
   * RDS
   *
   * @default true
   */
  RDS?: boolean;
  /**
   * Redshift
   *
   * @default false
   */
  Redshift?: boolean;
  /**
   * S3
   *
   * **Versioning is required on backed up buckets**
   *
   * @default true
   */
  S3?: boolean;
  /**
   * SAP HANA
   *
   * @default false
   */
  "SAP HANA on Amazon EC2"?: boolean;
  /**
   * Storage Gateway
   *
   * @default false
   */
  "Storage Gateway"?: boolean;
  /**
   * AWS Timestream
   *
   * @default false
   */
  Timestream?: boolean;
  /**
   * VMWare Virtual Machines
   *
   * @default false
   */
  VirtualMachine?: boolean;
}

export interface AwsConfigDetails {
  /**
   * Name of the AWS Config S3 bucket
   */
  configOrganizationBucketName: string;
  /**
   * Resource types to monitor for tag compliance
   *
   * @example
   * ```
   * [
   *   config.ResourceType.EBS_VOLUME,
   *   config.ResourceType.EC2_INSTANCE,
   *   config.ResourceType.RDS_DB_INSTANCE,
   *   config.ResourceType.S3_BUCKET,
   * ]
   */
  monitoredTaggedResourceTypes: config.ResourceType[];
}

export interface CloudTrailDetails {
  /**
   * Name of the AWS CloudTrail S3 bucket
   */
  cloudtrailOrganizationBucketName: string;
  /**
   * CloudWatch Log Prefix
   */
  cloudwatchLogPrefix: string;
  /**
   * Name of the Data trail
   */
  dataTrailName: string;
  /**
   * S3 prefix for the Data trail
   */
  dataTrailS3LoggingPrefix: string;
  /**
   * Enable or disable the Data trail
   */
  enableDataTrail: boolean;
  /**
   * Name of the primary/management trail
   */
  primaryTrailName: string;
  /**
   * S3 prefix for the primary/management trail
   */
  primaryTrailS3LoggingPrefix: string;
}

export type PrefixListName = keyof typeof prefixLists;

export interface TagPolicyTargetProps {
  /**
   * Account names to attach the policy to
   *
   * @example ['security', 'shared-services']
   */
  accounts?: (typeof accountNames)[number][];
  /**
   * Attach the policy to the root of the organization, enforcing for all accounts
   *
   * If true, direct account and OU attachments will be ignored.
   */
  applyToEntireOrganization: boolean;
  /**
   * Organizational unit IDs to attach the policy to
   *
   * @example ['ou-1234567890abcdef0']
   */
  ous?: string[];
}

export interface TagEnforcementProps {
  /**
   * Enforce the tag policy
   *
   * If true, resources in scope cannot be created or tagged with
   * tags that are not allowed by the policy.
   */
  enabled: boolean;
  /**
   * Enforced resources
   *
   * @see https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_supported-resources-enforcement.html
   * @example
   * ```
   * [
   *  'ec2:instance',
   *  'ec2:volume',
   *  's3:bucket',
   * ]
   * ```
   */
  enforcedResources: string[];
  targets: TagPolicyTargetProps;
}
