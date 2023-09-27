import { Stack, StackProps, aws_iam as iam, aws_kms as kms, Tags } from "aws-cdk-lib";
import { Construct } from "constructs";
import { DefaultEbsEncryption } from "@customResources/defaultEbsEncryption";
import { kmsAllowAccountManagement, kmsAllowOrganizationDecrypt, kmsAllowServiceVia } from "@helpers/kms";

export interface KmsStackProps extends StackProps {
  /**
   * Create a KMS Key for AWS Backups
   */
  enableAwsBackupsKey: boolean;
  /**
   * Create a KMS Key for EBS encryption
   */
  enableEbsKey: boolean;
  /**
   * Enable default EBS encryption
   */
  enableDefaultEbsEncryption: boolean;
  /**
   * Create a KMS Key for Secrets Manager
   */
  enableSecretsManagerKey: boolean;
  /**
   * Create a KMS key for Secrets Manager that the full AWS Organization can decrypt from
   *
   * This is used to share common values across the organization.
   * For example, the transit gateway ID in the shared account.
   *
   * @default Not created
   * @example { organizationId: o-9exxxxxx08 }
   */
  organizationSecretSharingKey?: { organizationId: string };
}

export class Kms extends Stack {
  public readonly backup: kms.Key;

  public readonly ebs: kms.Key;

  public readonly organizationSecretSharing: kms.Key;

  public readonly secretsManager: kms.Key;

  constructor(scope: Construct, id: string, props: KmsStackProps) {
    super(scope, id, props);

    if (props.enableDefaultEbsEncryption && !props.enableEbsKey) {
      throw new Error("Enable the EbsKey to activate default EBS encryption");
    }

    // Secrets Manager
    if (props.enableSecretsManagerKey) {
      this.secretsManager = new kms.Key(this, "secretsmanager", {
        alias: "secrets-manager",
        description: "Used with Secrets Manager",
        enableKeyRotation: true,
        policy: new iam.PolicyDocument({
          statements: [kmsAllowAccountManagement(), kmsAllowServiceVia(this.account, "secretsmanager")],
        }),
      });

      // Multi-region is not available on the construct above yet
      const cfnSecretsManager = this.secretsManager.node.defaultChild as kms.CfnKey;
      cfnSecretsManager.multiRegion = true;
    }

    // EBS
    if (props.enableEbsKey) {
      this.ebs = new kms.Key(this, "ebs", {
        alias: "ebs",
        description: "Used with EBS",
        enableKeyRotation: true,
        policy: new iam.PolicyDocument({
          statements: [kmsAllowAccountManagement(), kmsAllowServiceVia(this.account, "ec2")],
        }),
      });

      // Multi-region is not available on the construct above yet
      const cfnEbs = this.ebs.node.defaultChild as kms.CfnKey;
      cfnEbs.multiRegion = true;

      if (props.enableDefaultEbsEncryption) {
        new DefaultEbsEncryption(this, "enableDefaultEbsEncyrption", {
          kmsKey: this.ebs,
        });
      }
    }

    // Organization shared Key
    if (props.organizationSecretSharingKey) {
      this.organizationSecretSharing = new kms.Key(this, "organizationSecretSharingKey", {
        description: "Organization spoke accounts can decrypt using this key",
        enableKeyRotation: true,
        alias: "organization-secret-sharing",
        policy: new iam.PolicyDocument({
          statements: [
            kmsAllowAccountManagement(),
            kmsAllowServiceVia(this.account, "secretsmanager"),
            kmsAllowOrganizationDecrypt(props.organizationSecretSharingKey.organizationId),
          ],
        }),
      });
      Tags.of(this.organizationSecretSharing).add(
        "context",
        "use this key to encrypt secrets that should be available to the entire organization"
      );

      // Multi-region is not available on the construct above yet
      const cfnOrganizationSecretSharing = this.organizationSecretSharing.node.defaultChild as kms.CfnKey;
      cfnOrganizationSecretSharing.multiRegion = true;
    }

    if (props.enableAwsBackupsKey) {
      this.backup = new kms.Key(this, "backupsKey", {
        description: "Used with AWS Backups",
        enableKeyRotation: true,
        alias: "backups",
        policy: new iam.PolicyDocument({
          statements: [kmsAllowAccountManagement(), kmsAllowServiceVia(this.account, "backup")],
        }),
      });

      // Multi-region is not available on the construct above yet
      const cfnBackup = this.backup.node.defaultChild as kms.CfnKey;
      cfnBackup.multiRegion = true;
    }
  }
}
