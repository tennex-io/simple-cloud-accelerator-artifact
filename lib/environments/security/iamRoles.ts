import { aws_iam as iam, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface IamRolesProps extends StackProps {
  securityOrganizationViewOnlyRoleName: string;
}

export class IamRoles extends Stack {
  securityViewOnlyRole: iam.Role;

  constructor(scope: Construct, id: string, props: IamRolesProps) {
    super(scope, id, props);

    this.securityViewOnlyRole = new iam.Role(this, "securityReview", {
      roleName: props.securityOrganizationViewOnlyRoleName,
      description: "allows view only role access to Organization spoke accounts via Lambda",
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("job-function/ViewOnlyAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
      ],
      inlinePolicies: {
        stsLocalAccountId: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ["sts:GetCallerIdentity"],
              effect: iam.Effect.ALLOW,
              resources: ["*"],
            }),
          ],
        }),
        organizationListAccounts: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ["organization:ListAccounts"],
              effect: iam.Effect.ALLOW,
              resources: ["*"],
            }),
          ],
        }),
        assumeSpokeRoles: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ["sts:AssumeRole"],
              effect: iam.Effect.ALLOW,
              resources: [`arn:aws:iam::*:role/${props.securityOrganizationViewOnlyRoleName}`],
            }),
          ],
        }),
      },
    });
  }
}
