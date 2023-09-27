import { CustomResourceBase } from "@constructs/customResourceBase";
import { DelegatedAdministratorAccountIds } from "@lib/types";
import { Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";

interface DelegateOrganizationAdministratorProps extends DelegatedAdministratorAccountIds {
  /**
   * Current AWS Account ID
   */
  currentAccountid: string;
}

export class DelegateOrganizationAdministrator extends CustomResourceBase {
  constructor(scope: Construct, id: string, props: DelegateOrganizationAdministratorProps) {
    super(scope, id, {
      functionName: "cdk-custom-resource-organization-delegate-administrator",
      functionDescription: "CDK/CFN Custom Resource to delegate organization administrator access",
      functionFilePath: path.join(__dirname, "functionCode", "organizationDelegateAdministratorLambda.ts"),
      iamAllowActions: [
        "cloudtrail:RegisterOrganizationDelegatedAdmin",
        "cloudtrail:DeregisterOrganizationDelegatedAdmin",
        "guardduty:EnableOrganizationAdminAccount",
        "guardduty:ListOrganizationAdminAccounts",
        "iam:CreateServiceLinkedRole",
        "iam:GetRole",
        "organizations:DescribeAccount",
        "organizations:DescribeOrganization",
        "organizations:DescribeOrganizationalUnit",
        "organizations:DeregisterDelegatedAdministrator",
        "organizations:EnableAWSServiceAccess",
        "organizations:ListAWSServiceAccessForOrganization",
        "organizations:ListDelegatedAdministrators",
        "organizations:ListDelegatedServicesForAccount",
        "organizations:RegisterDelegatedAdministrator",
      ],
      resourceProperties: {
        configAdminAccountId: props.configAdminAccountId,
        guardDutyAdminAccountId: props.configAdminAccountId,
        cloudTrailAdminAccountId: props.cloudTrailAdminAccountId,
      },
      functionTimeout: Duration.minutes(5),
      // TODO: remove after the Lambda AWS SDK version is > 3.188.  Estimated Q2 2023
      // https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html
      // We need to explicitly bundle the client-cloudtrail for the delegate CloudTrail admin command
      externalModules: ["@aws-sdk/client-guardduty", "@aws-sdk/client-organizations"],
    });
  }
}
