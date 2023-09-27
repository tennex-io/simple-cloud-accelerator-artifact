import { CustomResourceBase } from "@constructs/customResourceBase";
import { Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";

export interface EnableAwsServiceAccessProps {
  servicePrincipals: string[];
}

export class EnableAwsServiceAccess extends CustomResourceBase {
  constructor(scope: Construct, id: string, props: EnableAwsServiceAccessProps) {
    super(scope, id, {
      functionName: "cdk-custom-resource-organization-enable-service-access",
      functionDescription: "CDK/CFN Custom Resource for Organization service trusted access",
      functionFilePath: path.join(__dirname, "functionCode", "organizationEnableAwsServiceAccessLambda.ts"),
      iamAllowActions: [
        "iam:CreateServiceLinkedRole",
        "organizations:DisableAWSServiceAccess",
        "organizations:EnableAWSServiceAccess",
        "organizations:ListAWSServiceAccessForOrganization",
      ],
      resourceProperties: {
        servicePrincipals: props.servicePrincipals,
      },
      functionTimeout: Duration.minutes(10),
    });
  }
}
