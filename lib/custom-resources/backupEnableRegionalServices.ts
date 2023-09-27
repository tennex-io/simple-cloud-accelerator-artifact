import { CustomResourceBase } from "@constructs/customResourceBase";
import { BackupServiceEnabledStatus } from "@lib/types";
import { Construct } from "constructs";
import * as path from "path";

export interface BackupEnableRegionalServicesProps {
  /**
   * Enable or disable AWS backups by service
   */
  services: BackupServiceEnabledStatus;
}

export class BackupEnableRegionalServices extends CustomResourceBase {
  constructor(scope: Construct, id: string, props: BackupEnableRegionalServicesProps) {
    super(scope, id, {
      functionName: "cdk-custom-resource-backups-enable-regional-services",
      functionDescription: "CDK/CFN Custom Resource to manage the per service opt-in for AWS backups",
      functionFilePath: path.join(__dirname, "functionCode", "backupEnableRegionalServicesLambda.ts"),
      iamAllowActions: ["backup:UpdateRegionSettings"],
      resourceProperties: {
        services: props.services,
      },
    });
  }
}
