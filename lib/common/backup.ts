import { BackupEnableRegionalServices } from "@customResources/backupEnableRegionalServices";
import { BackupServiceEnabledStatus } from "@lib/types";
import { aws_backup as backup, aws_kms as kms, aws_iam as iam, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

interface BackupProps extends StackProps {
  /**
   * Existing KMS key to encrypt backups with
   */
  kmsKey: kms.Key;
  /**
   * Enabled services
   */
  services: BackupServiceEnabledStatus;
  /**
   * Name of the backup role
   */
  roleName: string;
  /**
   * Vault name for daily backups with one **week* retention
   */
  dailyBackupOneWeekVaultName: string;
  /**
   * Vault name for daily backups with one **month* retention
   */
  dailyBackupOneMonthVaultName: string;
}

export class Backup extends Stack {
  constructor(scope: Construct, id: string, props: BackupProps) {
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

    const role = new iam.Role(this, "backupRole", {
      roleName: props.roleName,
      assumedBy: new iam.ServicePrincipal("backup.amazonaws.com"),
      description: "Manages AWS backups and restores",
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSBackupServiceRolePolicyForBackup"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSBackupServiceRolePolicyForRestores"),
      ],
    });

    if (props.services.S3) {
      role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AWSBackupServiceRolePolicyForS3Backup"));
      role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AWSBackupServiceRolePolicyForS3Restore"));
    }

    // Week retention
    new backup.BackupVault(this, "oneWeekVault", {
      backupVaultName: props.dailyBackupOneWeekVaultName,
      encryptionKey: props.kmsKey,
    });

    // Month retention
    new backup.BackupVault(this, "oneMonthVault", {
      backupVaultName: props.dailyBackupOneMonthVaultName,
      encryptionKey: props.kmsKey,
    });
  }
}
