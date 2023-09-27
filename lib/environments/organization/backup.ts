import { BackupEnableRegionalServices } from "@customResources/backupEnableRegionalServices";
import { BackupServiceEnabledStatus, validRegion } from "@lib/types";
import { aws_organizations as organizations, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

interface BackupPlanConfiguration {
  /**
   * Vault name
   */
  vaultName: string;
  /**
   * The tagging combination to define resoucres that are in the backup scope
   */
  resourceSelectionTagPair: {
    /**
     * Tag key
     *
     * @example 'backup-retention'
     */
    key: string;
    /**
     * Tag value
     *
     * @example '7-days'
     */
    value: string;
  };
}

interface OrganizationBackupProps extends StackProps {
  /**
   * List of Organizational targets
   *
   * This can be any combination of organization root (r-1234), an Organizational Unit (ou-1234-xxxxxxxxx),
   * or an AWS account ID.
   *
   * @example Assign to a single account and an Organizational Unit
   * ['123412341234', 'ou-1234-xxxxxxxxx']
   * @example Assign to the entire Organization
   *  ['r-1234']
   */
  targetIds: string[];
  /**
   * List of AWS regions users *can* use
   *
   * @example ['us-east-1', 'us-west-2']
   */
  regions: validRegion[];
  /**
   * Name of the backup role in each account
   */
  roleName: string;
  /**
   * Enabled servies - these apply to both the local account **and the spoke accounts**
   *
   * These settings will override the spoke account settings for organization backup plans
   * @link https://docs.aws.amazon.com/aws-backup/latest/devguide/manage-cross-account.html
   */
  services: BackupServiceEnabledStatus;
  /**
   * Daily backup with 1 **week** retention plan details
   */
  dailyRetentionOneWeekDetails: BackupPlanConfiguration;
  /**
   * Daily backup with 1 **month** retention plan details
   */
  dailyRetentionOneMonthDetails: BackupPlanConfiguration;
}

interface BackupPolicyProps {
  /**
   * Selection assignment name
   */
  assignmentName: string;
  /**
   * Backup plan name
   */
  planName: string;
  /**
   * Regions to enable the policy in
   */
  regions: validRegion[];
  /**
   * Name of the backup role performing backups in spoke accounts
   */
  roleName: string;
  /**
   * Rule name
   */
  ruleName: string;
  /**
   * Tag Pair identifing resources to back up
   *
   * @example
   * ```
   * {
   *   'backup-retention': '7-days'
   * }
   */
  tagKeyPair: Record<string, string>;
  /**
   * Vault name in spoke accounts
   */
  vaultName: string;
  /**
   * Enable Windows VSS backups
   */
  vssEnabled?: boolean;
}

function generateBackupPolicy(props: BackupPolicyProps) {
  const enableVss = props.vssEnabled ?? true;
  const policy = {
    plans: {
      [props.planName]: {
        regions: {
          "@@assign": props.regions,
        },
        rules: {
          [props.ruleName]: {
            target_backup_vault_name: {
              "@@assign": props.vaultName,
            },
          },
        },
        selections: {
          tags: {
            [props.assignmentName]: {
              iam_role_arn: {
                "@@assign": `arn:aws:iam::$account:role/${props.roleName}`,
              },
              tag_key: {
                "@@assign": props.tagKeyPair.key,
              },
              tag_value: {
                "@@assign": [props.tagKeyPair.value],
              },
            },
          },
        },
        advanced_backup_settings: {
          ec2: {
            windows_vss: {
              "@@assign": enableVss === true ? "enabled" : "disabled",
            },
          },
        },
      },
    },
  };
  return policy;
}

export class OrganizationBackup extends Stack {
  constructor(scope: Construct, id: string, props: OrganizationBackupProps) {
    super(scope, id, props);

    // Set defaults if optional props are omitted.  Default values follow AWS defaults other than S3.
    const services: BackupServiceEnabledStatus = {
      Aurora: props.services.Aurora ?? false,
      CloudFormation: props.services.CloudFormation ?? false,
      DocumentDB: props.services.DocumentDB ?? false,
      DynamoDB: props.services.DynamoDB ?? false,
      EBS: props.services.EBS ?? true,
      EC2: props.services.EC2 ?? true,
      EFS: props.services.EFS ?? true,
      FSx: props.services.FSx ?? false,
      Neptune: props.services.Neptune ?? false,
      RDS: props.services.RDS ?? true,
      Redshift: props.services.Redshift ?? false,
      S3: props.services.S3 ?? true,
      "SAP HANA on Amazon EC2": props.services["SAP HANA on Amazon EC2"] ?? false,
      "Storage Gateway": props.services["Storage Gateway"] ?? false,
      Timestream: props.services.Timestream ?? false,
      VirtualMachine: props.services.VirtualMachine ?? false,
    };

    // Set regional backup service opt-in settings
    new BackupEnableRegionalServices(this, "backupRegionalSettings", {
      services,
    });

    const dailyOneWeekName = "daily-backups-one-week-retention";
    const dailyOneWeekTagKey = props.dailyRetentionOneWeekDetails.resourceSelectionTagPair.key;
    const dailyOneWeekTagValue = props.dailyRetentionOneWeekDetails.resourceSelectionTagPair.value;

    new organizations.CfnPolicy(this, "dailyBackupOneWeekRetention", {
      content: generateBackupPolicy({
        assignmentName: "tagged-resources",
        planName: dailyOneWeekName,
        regions: props.regions,
        roleName: props.roleName,
        ruleName: "retain-one-week",
        vaultName: props.dailyRetentionOneWeekDetails.vaultName,
        tagKeyPair: props.dailyRetentionOneWeekDetails.resourceSelectionTagPair,
      }),
      name: dailyOneWeekName,
      type: "BACKUP_POLICY",
      description: `Backup resources tagged with ${dailyOneWeekTagKey}:${dailyOneWeekTagValue} with daily retention for 1 week`,
      targetIds: props.targetIds,
    });

    const dailyOneMonthName = "daily-backups-one-month-retention";
    const dailyOneMonthTagKey = props.dailyRetentionOneMonthDetails.resourceSelectionTagPair.key;
    const dailyOneMonthTagValue = props.dailyRetentionOneMonthDetails.resourceSelectionTagPair.value;

    new organizations.CfnPolicy(this, "dailyBackupOneMonthRetention", {
      content: generateBackupPolicy({
        assignmentName: "tagged-resources",
        planName: dailyOneMonthName,
        regions: props.regions,
        roleName: props.roleName,
        ruleName: "retain-one-month",
        vaultName: props.dailyRetentionOneMonthDetails.vaultName,
        tagKeyPair: props.dailyRetentionOneMonthDetails.resourceSelectionTagPair,
      }),
      name: dailyOneMonthName,
      type: "BACKUP_POLICY",
      description: `Backup resources tagged with ${dailyOneMonthTagKey}:${dailyOneMonthTagValue} with daily retention for 1 month`,
      targetIds: props.targetIds,
    });
  }
}
