import { requiredTags } from "@config/taggingConfig";
import { Annotations, aws_config as config, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface ConfigRuleSetProps extends StackProps {
  /**
   * Resource types to monitor for required tags.
   *
   * @example
   * ```
   * [
   *   config.ResourceType.EBS_VOLUME,
   *   config.ResourceType.EC2_INSTANCE,
   *   config.ResourceType.RDS_DB_INSTANCE,
   *   config.ResourceType.S3_BUCKET
   * ]
   * ```
   */
  monitoredTaggedResourceTypes: config.ResourceType[];
}

export class ConfigRuleSets extends Stack {
  constructor(scope: Construct, id: string, props: ConfigRuleSetProps) {
    super(scope, id, props);

    // https://docs.aws.amazon.com/config/latest/developerguide/backup-plan-min-frequency-and-min-retention-check.html
    new config.ManagedRule(this, "backup-plan-min-frequency-and-min-retention-check", {
      identifier: "BACKUP_PLAN_MIN_FREQUENCY_AND_MIN_RETENTION_CHECK",
      configRuleName: "backup-plan-min-frequency-and-min-retention-check",
      inputParameters: {
        // Numerical value for required backup frequency. Maximum of 24 for hours, 31 for days.
        requiredFrequencyValue: 1,
        // Required retention period in days.
        requiredRetentionDays: 5,
        // Unit of time for required backup frequency. Accepted values: 'hours', 'days'.
        requiredFrequencyUnit: "days",
      },
    });

    // https://docs.aws.amazon.com/config/latest/developerguide/cloud-trail-log-file-validation-enabled.html
    new config.ManagedRule(this, "cloud-trail-log-file-validation-enabled", {
      identifier: config.ManagedRuleIdentifiers.CLOUD_TRAIL_LOG_FILE_VALIDATION_ENABLED,
      configRuleName: "cloud-trail-log-file-validation-enabled",
    });

    // https://docs.aws.amazon.com/config/latest/developerguide/ec2-ebs-encryption-by-default.html
    new config.ManagedRule(this, "ec2-ebs-encryption-by-default", {
      identifier: config.ManagedRuleIdentifiers.EC2_EBS_ENCRYPTION_BY_DEFAULT,
      configRuleName: "ec2-ebs-encryption-by-default",
    });

    // https://docs.aws.amazon.com/config/latest/developerguide/ec2-stopped-instance.html
    new config.ManagedRule(this, "ec2-stopped-instance", {
      identifier: config.ManagedRuleIdentifiers.EC2_STOPPED_INSTANCE,
      configRuleName: "ec2-stopped-instance",
      inputParameters: {
        // The number of days an ec2 instance can be stopped before it is NON_COMPLIANT. The default number of days is 30.
        AllowedDays: 90,
      },
    });

    // https://docs.aws.amazon.com/config/latest/developerguide/encrypted-volumes.html
    new config.ManagedRule(this, "encrypted-volumes", {
      identifier: config.ManagedRuleIdentifiers.EBS_ENCRYPTED_VOLUMES,
      configRuleName: "encrypted-volumes",
      // inputParameters: {
      //   // ID or ARN of the KMS key that is used to encrypt the volume.
      //   kmsid: '',
      // }
    });

    // https://docs.aws.amazon.com/config/latest/developerguide/guardduty-enabled-centralized.html
    new config.ManagedRule(this, "guardduty-enabled-centralized", {
      identifier: config.ManagedRuleIdentifiers.GUARDDUTY_ENABLED_CENTRALIZED,
      configRuleName: "guardduty-enabled-centralized",
      // inputParameters: {
      //   CentralMonitoringAccount: '111111111111',
      // },
    });

    // https://docs.aws.amazon.com/config/latest/developerguide/vpc-default-security-group-closed.html
    new config.ManagedRule(this, "vpc-default-security-group-closed", {
      identifier: config.ManagedRuleIdentifiers.VPC_DEFAULT_SECURITY_GROUP_CLOSED,
      configRuleName: "vpc-default-security-group-closed",
    });

    // https://docs.aws.amazon.com/config/latest/developerguide/vpc-flow-logs-enabled.html
    new config.ManagedRule(this, "vpc-flow-logs-enabled", {
      identifier: config.ManagedRuleIdentifiers.VPC_FLOW_LOGS_ENABLED,
      configRuleName: "vpc-flow-logs-enabled",
      // TrafficType of flow logs
      // inputParameters: {
      //   trafficType: 'ALL',
      // },
    });

    // https://docs.aws.amazon.com/config/latest/developerguide/restricted-ssh.html
    new config.ManagedRule(this, "restricted-ssh", {
      identifier: config.ManagedRuleIdentifiers.EC2_SECURITY_GROUPS_INCOMING_SSH_DISABLED,
      configRuleName: "restricted-ssh",
    });

    // https://docs.aws.amazon.com/config/latest/developerguide/iam-user-unused-credentials-check.html
    new config.ManagedRule(this, "iam-user-unused-credentials-check", {
      identifier: config.ManagedRuleIdentifiers.IAM_USER_UNUSED_CREDENTIALS_CHECK,
      configRuleName: "iam-user-unused-credentials-check",
      inputParameters: {
        maxCredentialUsageAge: 90,
      },
    });

    // https://docs.aws.amazon.com/config/latest/developerguide/iam-root-access-key-check.html
    new config.ManagedRule(this, "iam-root-access-key-check", {
      identifier: config.ManagedRuleIdentifiers.IAM_ROOT_ACCESS_KEY_CHECK,
      configRuleName: "iam-root-access-key-check",
    });

    // https://docs.aws.amazon.com/config/latest/developerguide/iam-password-policy.html
    new config.ManagedRule(this, "iam-password-policy", {
      identifier: config.ManagedRuleIdentifiers.IAM_PASSWORD_POLICY,
      configRuleName: "iam-password-policy",
      inputParameters: {
        RequireUppercaseCharacters: true,
        RequireLowercaseCharacters: true,
        RequireSymbols: true,
        RequireNumbers: true,
        MinimumPasswordLength: 14,
        PasswordReusePrevention: 24,
        MaxPasswordAge: 90,
      },
    });

    // https://docs.aws.amazon.com/config/latest/developerguide/root-account-mfa-enabled.html
    new config.ManagedRule(this, "root-account-mfa-enabled", {
      identifier: config.ManagedRuleIdentifiers.ROOT_ACCOUNT_MFA_ENABLED,
      configRuleName: "root-account-mfa-enabled",
    });

    // https://docs.aws.amazon.com/config/latest/developerguide/restricted-common-ports.html
    new config.ManagedRule(this, "restricted-common-ports", {
      identifier: config.ManagedRuleIdentifiers.EC2_SECURITY_GROUPS_RESTRICTED_INCOMING_TRAFFIC,
      configRuleName: "restricted-common-ports",
      inputParameters: {
        blockedPort1: 21,
      },
    });

    // https://docs.aws.amazon.com/config/latest/developerguide/s3-bucket-server-side-encryption-enabled.html
    new config.ManagedRule(this, "s3-bucket-server-side-encryption-enabled", {
      identifier: config.ManagedRuleIdentifiers.S3_BUCKET_SERVER_SIDE_ENCRYPTION_ENABLED,
      configRuleName: "s3-bucket-server-side-encryption-enabled",
    });

    // Required tags must be defined and not be an empty array
    const keys = Object.keys(requiredTags);
    // const totalTags = Object.keys(requiredTags).length;
    // https://docs.aws.amazon.com/config/latest/developerguide/required-tags.html
    if (keys.length > 6) {
      Annotations.of(this).addError(`AWS only allows up to 6 tag keys. You provided ${keys.length} total - ${keys}`);
    }

    // AWS allows up to 6 tag keys, beginning with 'tag1Key`
    const inputParameters: Record<string, string> = {};

    Object.entries(requiredTags).forEach(([tag, allowedValues], index) => {
      inputParameters[`tag${index + 1}Key`] = tag;
      inputParameters[`tag${index + 1}Value`] = allowedValues.join(",");
    });

    new config.ManagedRule(this, "required-tags", {
      identifier: config.ManagedRuleIdentifiers.REQUIRED_TAGS,
      configRuleName: "required-tags",
      inputParameters,
      ruleScope: config.RuleScope.fromResources(props.monitoredTaggedResourceTypes),
    });
  }
}
