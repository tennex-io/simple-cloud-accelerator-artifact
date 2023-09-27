import { cloudWatchDashboardOrganizationRoleName, organizationSecretNames } from "@config/coreConfig";
import { IamAlias } from "@customResources/iamAlias";
import { IamPasswordPolicy } from "@customResources/iamPasswordPolicy";
import { S3blockPublicAccess } from "@customResources/s3blockPublicAccess";
import { getAccountFromShortName } from "@helpers/accounts";
import { aws_iam as iam, aws_oam as oam, aws_secretsmanager as secretsmanager, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

interface BaselineProps extends StackProps {
  /**
   * Desired IAM alias
   *
   * Must be unique in *all* of AWS
   */
  iamAlias: string;
}

export class Baseline extends Stack {
  constructor(scope: Construct, id: string, props: BaselineProps) {
    super(scope, id, props);

    // Custom resources
    new IamAlias(this, "iamAlias", { iamAlias: props.iamAlias });
    new IamPasswordPolicy(this, "iamPasswordPolicy", {});
    new S3blockPublicAccess(this, "s3publicBlock", this.account);

    // TODO: move OAM into separate stacks
    // Role is used by AWS OAM and CloudWatch custom widgets
    const organizationAccountId = getAccountFromShortName("organization").id;
    if (this.account !== organizationAccountId) {
      new iam.Role(this, "cloudwatchOrganizationDashboardRole", {
        assumedBy: new iam.AccountPrincipal(organizationAccountId),
        description: "allows Organization management account role view access for CloudWatch dashboards",
        roleName: cloudWatchDashboardOrganizationRoleName,
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchReadOnlyAccess"),
          iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAutomaticDashboardsAccess"),
          iam.ManagedPolicy.fromAwsManagedPolicyName("job-function/ViewOnlyAccess"),
          iam.ManagedPolicy.fromAwsManagedPolicyName("AWSXrayReadOnlyAccess"),
        ],
      });

      const oamSecret = secretsmanager.Secret.fromSecretPartialArn(
        this,
        "oamSecret",
        `arn:aws:secretsmanager:${this.region}:${organizationAccountId}:secret:${organizationSecretNames.oamArn}`
      );
      // unsafeUnwrap is required.  This is *not* a sensitive secret.
      new oam.CfnLink(this, "organizationLink", {
        labelTemplate: "$AccountName",
        resourceTypes: ["AWS::CloudWatch::Metric", "AWS::Logs::LogGroup", "AWS::XRay::Trace"],
        sinkIdentifier: oamSecret.secretValueFromJson("id").unsafeUnwrap(),
      });
    }
  }
}
