import { accounts, cloudWatchDashboardOrganizationRoleName } from "@config/coreConfig";
import {
  aws_cloudwatch as cloudwatch,
  aws_lambda_nodejs as nodejs,
  aws_iam as iam,
  aws_logs as logs,
  Duration,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import * as path from "path";

interface CloudTrailDashboardProps extends StackProps {
  /**
   * Name of the CloudTrail CloudWatch log group
   */
  cloudTrailLogGroupName: string;
}

export class CloudtrailDashboard extends Stack {
  constructor(scope: Construct, id: string, props: CloudTrailDashboardProps) {
    super(scope, id, props);

    const logGroupNames = [props.cloudTrailLogGroupName];

    // This role has access to the local account and a role
    // with the same name in the spoke organization accounts
    const role = new iam.Role(this, "organizationViewRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: "Lambda function for custom CloudWatch dashboard widgets",
      roleName: cloudWatchDashboardOrganizationRoleName,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("job-function/ViewOnlyAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
      ],
      inlinePolicies: {
        spokeAssumeRole: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              sid: "allowOrganizationAssumeRole",
              actions: ["sts:AssumeRole"],
              effect: iam.Effect.ALLOW,
              resources: [`arn:aws:iam::*:role/${cloudWatchDashboardOrganizationRoleName}`],
            }),
          ],
        }),
      },
    });

    // Function to aggregate a table showing IAM users per account
    const fn = new nodejs.NodejsFunction(this, "iam", {
      functionName: "cloudtrail-dashboard-iam-user-summary",
      entry: path.join(__dirname, "lambda/cloudtrail-management-dashboard/iam-user-summary.ts"),
      bundling: {
        sourceMap: true,
      },
      description: "Traverses Organization accounts to identify number of IAM users in spoke accounts",
      runtime: Runtime.NODEJS_18_X,
      logRetention: logs.RetentionDays.ONE_MONTH,
      timeout: Duration.minutes(1),
      role,
      environment: {},
    });

    // Build the markdown details outside the widget for clarity
    let accountReferenceMarkdown = "# Account Reference\nAccount Name | Account ID\n-------------|-----------\n";
    accounts.forEach((account) => {
      accountReferenceMarkdown += `${account.name} | ${account.id}\n`;
    });

    const widgetAccountReference = new cloudwatch.TextWidget({
      height: 6,
      width: 4,
      markdown: accountReferenceMarkdown,
    });

    const widgetLambdaIamUsersByAccount = new cloudwatch.CustomWidget({
      functionArn: fn.functionArn,
      title: "IAM Users by Account",
      height: 6,
      width: 4,
      params: {
        targetAccounts: accounts.map((account) => account.id),
        targetRoleName: cloudWatchDashboardOrganizationRoleName,
      },
      updateOnTimeRangeChange: false,
    });

    const widgetLogQueryConsoleLoginsByAccount = new cloudwatch.LogQueryWidget({
      height: 6,
      width: 9,
      view: cloudwatch.LogQueryVisualizationType.BAR,
      title: "Total Console Logins by Account",
      logGroupNames,
      queryLines: [
        "fields @timestamp, @message",
        "filter eventName = 'ConsoleLogin'",
        "stats count() as Total_Console_Logins by recipientAccountId as Target_Account",
      ],
    });

    const widgetLogQueryLaunchWizardSecurityGroupCreations = new cloudwatch.LogQueryWidget({
      height: 6,
      width: 7,
      view: cloudwatch.LogQueryVisualizationType.BAR,
      title: "Launch Wizard Security Group Creations",
      logGroupNames,
      queryLines: [
        "fields @timestamp, @message",
        'filter eventName = "CreateSecurityGroup" and requestParameters.groupName like "launch-wizard"',
        "stats count() as Launch_Wizard_Groups by recipientAccountId",
      ],
    });

    const widgetLogQueryManagementEventsByType = new cloudwatch.LogQueryWidget({
      height: 5,
      width: 9,
      view: cloudwatch.LogQueryVisualizationType.PIE,
      title: "CloudTrail Management Events by Identity Type",
      logGroupNames,
      queryLines: [
        "fields @timestamp, @message, userIdentity.type",
        "stats count() as Total_Actions by userIdentity.type",
      ],
    });

    const widgetLogQueryMostActiveIamUsers = new cloudwatch.LogQueryWidget({
      height: 5,
      width: 8,
      view: cloudwatch.LogQueryVisualizationType.PIE,
      title: "Most Active IAM Users",
      logGroupNames,
      queryLines: [
        "fields @timestamp, @message",
        "filter userIdentity.type = 'IAMUser'",
        "stats count() as Total_Actions by userIdentity.userName",
      ],
    });

    const widgetLogQuerySecurityGroupActivity = new cloudwatch.LogQueryWidget({
      height: 5,
      width: 7,
      view: cloudwatch.LogQueryVisualizationType.PIE,
      title: "Security Group Changes by Account",
      logGroupNames,
      queryLines: [
        "fields @timestamp, @message",
        'filter eventName in ["AuthorizeSecurityGroupIngress", "AuthorizeSecurityGroupEgress", "RevokeSecurityGroupIngress", "RevokeSecurityGroupEgress", "CreateSecurityGroup", "DeleteSecurityGroup"]',
        "stats count() as Security_Group_Changes by recipientAccountId",
      ],
    });

    const widgetLogQueryErrorCodes = new cloudwatch.LogQueryWidget({
      height: 6,
      width: 24,
      view: cloudwatch.LogQueryVisualizationType.TABLE,
      title: "Errors by Account, ARN, and Event Source",
      logGroupNames,
      queryLines: [
        "fields @timestamp, recipientAccountId, userIdentity.arn, errorCode, errorMessage, @message, @logStream, @log",
        "filter ispresent(errorCode)",
        "sort @timestamp desc",
      ],
    });

    new cloudwatch.Dashboard(this, "cloudtrailOverview", {
      dashboardName: "cloudtrail-overview",
      end: "end",
      start: "-PT3H", // on load start from 3 hours ago
      periodOverride: cloudwatch.PeriodOverride.AUTO,
      widgets: [
        [
          widgetAccountReference,
          widgetLambdaIamUsersByAccount,
          widgetLogQueryConsoleLoginsByAccount,
          widgetLogQueryLaunchWizardSecurityGroupCreations,
        ],
        [widgetLogQueryManagementEventsByType, widgetLogQueryMostActiveIamUsers, widgetLogQuerySecurityGroupActivity],
        [widgetLogQueryErrorCodes],
      ],
    });
  }
}
