import { validRegion } from "@lib/types";
import {
  aws_events as events,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_lambda_nodejs as nodejs,
  aws_logs as logs,
  aws_stepfunctions as sfn,
  aws_stepfunctions_tasks as tasks,
  Duration,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";

interface DefaultVpcRemovalProps extends StackProps {
  /**
   * List of regions that are enabled via Organization SCPs
   *
   * VPCs can only be removed in activated regions
   */
  targetRegions: validRegion[];
}

export class DefaultVpcRemoval extends Stack {
  constructor(scope: Construct, id: string, props: DefaultVpcRemovalProps) {
    super(scope, id, props);

    const targetRole = "OrganizationAccountAccessRole";
    const name = "spoke-account-default-vpc-removal";

    const lambdaFunction = new nodejs.NodejsFunction(this, "function", {
      functionName: name,
      entry: path.join(__dirname, "./lambda/defaultVpcRemovalLambda.ts"),
      runtime: lambda.Runtime.NODEJS_18_X, // 18.x+ includes AWS JS SDKv3
      bundling: {
        sourceMap: true,
      },
      description: "Removes default VPCs from specific regions in Organization member accounts",
      logRetention: logs.RetentionDays.ONE_MONTH,
      timeout: Duration.minutes(5),
    });

    lambdaFunction.role?.attachInlinePolicy(
      new iam.Policy(this, "assumeRole", {
        statements: [
          new iam.PolicyStatement({
            actions: ["sts:AssumeRole"],
            resources: [`arn:aws:iam::*:role/${targetRole}`],
          }),
          new iam.PolicyStatement({
            actions: [
              "ec2:DeleteInternetGateway",
              "ec2:DeleteSubnet",
              "ec2:DeleteVpc",
              "ec2:Describe*",
              "ec2:DetachInternetGateway",
              "sts:GetCallerIdentity",
            ],
            resources: ["*"],
          }),
        ],
      })
    );

    // Step function - we leverage the retry in case the AWS account isn't in a 'activated' state
    const waitTask = new sfn.Wait(this, "wait", {
      time: sfn.WaitTime.duration(Duration.minutes(1)),
      comment: "Wait 1 minute for the new account to normalize and accept API calls",
    });
    const lambdaTask = new tasks.LambdaInvoke(this, name, {
      lambdaFunction,
      // We retry below on all exceptions, not just service exceptions
      retryOnServiceExceptions: false,
    });
    lambdaTask.addRetry({
      maxAttempts: 6,
      interval: Duration.minutes(1),
    });

    const stepFunction = new sfn.StateMachine(this, "stateMachine", {
      definitionBody: sfn.DefinitionBody.fromChainable(waitTask.next(lambdaTask)),
      stateMachineName: name,
      logs: {
        destination: new logs.LogGroup(this, "stateMachineLogs", {
          logGroupName: `/aws/stepfunctions/${name}`,
          retention: logs.RetentionDays.ONE_MONTH,
        }),
        level: sfn.LogLevel.ALL,
      },
    });

    // EventBridge to target the step function
    const rule = new events.Rule(this, "rule", {
      description: `capture new account creations to trigger default VPC removals via Lambda`,
      ruleName: name,
      eventPattern: {
        source: ["aws.organizations"],
        detailType: ["AWS Service Event via CloudTrail"],
        detail: {
          eventName: ["CreateAccountResult"],
          serviceEventDetails: {
            createAccountStatus: {
              state: ["SUCCEEDED"],
            },
          },
        },
      },
    });

    const eventRuleRole = new iam.Role(this, "eventRuleRole", {
      assumedBy: new iam.ServicePrincipal("events.amazonaws.com"),
      description: `allows EventBridge to invoke the ${name} step function`,
      inlinePolicies: {
        invokeSfn: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ["states:StartExecution"],
              resources: [stepFunction.stateMachineArn],
            }),
          ],
        }),
      },
    });

    // Cast rule as cfnRule because L2 constructs don't support input transformers for Lambda
    const cfnRule = rule.node.defaultChild as events.CfnRule;
    cfnRule.targets = [
      {
        // arn: lambdaFunction.functionArn,
        arn: stepFunction.stateMachineArn,
        roleArn: eventRuleRole.roleArn,
        id: "stepFunction",
        inputTransformer: {
          inputPathsMap: {
            targetAccountId: "$.detail.serviceEventDetails.createAccountStatus.accountId",
          },
          inputTemplate: `
          {
            "targetAccountId": "<targetAccountId>",
            "targetRegions": ${JSON.stringify(props.targetRegions)}
          }`,
        },
      },
    ];
  }
}
