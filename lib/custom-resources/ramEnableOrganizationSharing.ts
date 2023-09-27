import { CustomResourceBase } from "@constructs/customResourceBase";
import { Construct } from "constructs";
import * as path from "path";

export interface EnablePoliciesProps {
  /**
   * Organization Policy Types that can be Enabled/Disabled
   */
  policyTypes: Array<"AISERVICES_OPT_OUT_POLICY" | "BACKUP_POLICY" | "SERVICE_CONTROL_POLICY" | "TAG_POLICY">;
  /**
   * Organization Root Id
   *
   * @example r-0001
   */
  organizationRootId: string;
}

export class EnableSharing extends CustomResourceBase {
  constructor(scope: Construct, id: string) {
    super(scope, id, {
      functionName: "cdk-custom-resource-ram-enable-organization-sharing",
      functionDescription: "CDK/CFN Custom Resource for Enabling Resource Access Manager (RAM) organization sharing",
      functionFilePath: path.join(__dirname, "functionCode", "ramEnableOrganizationSharingLambda.ts"),
      iamAllowActions: [
        "iam:CreateServiceLinkedRole",
        "organizations:DescribeOrganization",
        "organizations:EnableAWSServiceAccess",
        "ram:EnableSharingWithAwsOrganization",
      ],
    });
  }
}
