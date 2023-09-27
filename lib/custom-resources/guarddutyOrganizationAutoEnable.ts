import { CustomResourceBase } from "@constructs/customResourceBase";
import { GuardDutyProtection } from "@lib/types";
import { Annotations } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";

export interface GuarddutyOrganizationConfigurationProps {
  /**
   * GuardDuty Administrator account detector ID
   */
  detectorId: string;
  /**
   * GuardDuty protection properties
   */
  protection: GuardDutyProtection;
  /**
   * Interval at which GuardDuty findings are published.
   *
   * @link https://docs.aws.amazon.com/guardduty/latest/APIReference/API_UpdateDetector.html#API_UpdateDetector_RequestBody
   * @default FIFTEEN_MINUTES
   */
  findingPublishingFrequency?: "FIFTEEN_MINUTES" | "ONE_HOUR" | "SIX_HOURS";
}

export class GuarddutyOrganizationConfiguration extends CustomResourceBase {
  constructor(scope: Construct, id: string, props: GuarddutyOrganizationConfigurationProps) {
    const { protection } = props;
    const resourceProperties: GuarddutyOrganizationConfigurationProps = {
      detectorId: props.detectorId,
      protection: {
        enableKubernetesAuditLogs: protection.enableKubernetesAuditLogs ?? false,
        enableS3LogDataSources: protection.enableS3LogDataSources ?? false,
      },
      findingPublishingFrequency: props.findingPublishingFrequency ?? "FIFTEEN_MINUTES",
    };

    if (protection.malwareScanning) {
      resourceProperties.protection.malwareScanning = protection.malwareScanning;
    }

    super(scope, id, {
      functionName: "cdk-custom-resource-guardduty-update-organization-configuration",
      functionFilePath: path.join(__dirname, "functionCode", "guarddutyOrganizationAutoEnableLambda.ts"),
      functionDescription: "CDK/CFN Custom Resource to update Guardduty organization settings",
      iamAllowActions: [
        "guardduty:ListMembers",
        "guardduty:UpdateDetector",
        "guardduty:UpdateMalwareScanSettings",
        "guardduty:UpdateMemberDetectors",
        "guardduty:UpdateOrganizationConfiguration",
        "iam:CreateServiceLinkedRole",
        "iam:GetRole",
        "organizations:ListAWSServiceAccessForOrganization",
      ],
      resourceProperties,
    });

    // Error on mutually exclusive malware tagging
    if (protection.malwareScanning?.exclusionTags && protection.malwareScanning?.inclusionTags) {
      Annotations.of(this).addError(
        "Malware tags cannot be both inclusive and exclusive.  Select only one or omit both."
      );
    }
  }
}
