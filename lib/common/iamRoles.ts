import { getAccountFromShortName } from "@helpers/accounts";
import { aws_iam as iam, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface IamRolesProps extends StackProps {
  securityOrganizationViewOnlyRoleName: string;
}

export class IamRoles extends Stack {
  constructor(scope: Construct, id: string, props: IamRolesProps) {
    super(scope, id, props);

    const securityAccountId = getAccountFromShortName("security").id;

    // This role is deployed in all accounts *except* the security account
    if (this.account !== securityAccountId) {
      new iam.Role(this, "securityReview", {
        roleName: props.securityOrganizationViewOnlyRoleName,
        description: "allows the Security account view only access to the current account",
        assumedBy: new iam.ArnPrincipal(
          `arn:aws:iam::${securityAccountId}:role/${props.securityOrganizationViewOnlyRoleName}`
        ),
        managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("job-function/ViewOnlyAccess")],
      });
    }
  }
}
