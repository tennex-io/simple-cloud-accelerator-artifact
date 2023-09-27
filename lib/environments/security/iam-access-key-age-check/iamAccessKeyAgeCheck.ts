import { isValidEmailAddress } from "@helpers/general";
import {
  Annotations,
  aws_events as events,
  aws_events_targets as targets,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_lambda_nodejs as lambdaNodeJs,
  aws_logs as logs,
  aws_sns as sns,
  aws_sns_subscriptions as subscriptions,
  aws_stepfunctions as sfn,
  aws_stepfunctions_tasks as tasks,
  Duration,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";

export interface IamAccessKeyAgeCheckProps extends StackProps {
  /**
   * SNS alert Email targets
   *
   * List of email addresses to deliver GuardDuty findings to.
   */
  snsEmailTargets?: string[];
  /**
   * Keys older than this many days will generate a message
   *
   * @default 90
   */
  minmumNotificationAge?: number;
  /**
   * Existing IAM role for the Lambda function to use.
   * This role will assume a role in each spoke account with the same name.
   */
  role: iam.Role;
  /**
   * Name used for the state machine, event rule, and SNS topic
   *
   * @default organization-iam-access-key-age-check
   */
  name?: string;
}

export class IamAccessKeyAgeCheck extends Stack {
  constructor(scope: Construct, id: string, props: IamAccessKeyAgeCheckProps) {
    super(scope, id, props);

    const name = props.name ?? "organization-iam-access-key-age-check";

    const topic = new sns.Topic(this, "topic", {
      displayName: name,
      topicName: name,
    });

    props.snsEmailTargets?.forEach((email) => {
      if (isValidEmailAddress(email)) {
        topic.addSubscription(new subscriptions.EmailSubscription(email));
      } else {
        Annotations.of(this).addError(`Invalid email address: ${email}`);
      }
    });

    // Lambda Functions
    const minmumNotificationAge = String(props.minmumNotificationAge ?? 90);
    const lambdaIamAccessKeyAgeCheck = new lambdaNodeJs.NodejsFunction(this, "lambdaIamAccessKeyAgeCheck", {
      description: `check all Organization member accounts for access keys over ${minmumNotificationAge} days and notify via SNS`,
      functionName: "organization-iam-access-key-age-check",
      entry: path.join(__dirname, "./lambda/iamAccessKeyAgeCheckLambda.ts"),
      role: props.role,
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: {
        MIN_NOTIFICATION_AGE: minmumNotificationAge,
        TARGET_ROLE_NAME: props.role.roleName,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
      timeout: Duration.minutes(5),
    });

    const policy = new iam.Policy(this, "policyListAliasAndPublish", {
      policyName: "sns-delivery",
      statements: [
        new iam.PolicyStatement({
          sid: "listAlias",
          actions: ["iam:ListAccountAliases"],
          effect: iam.Effect.ALLOW,
          resources: ["*"],
        }),
        new iam.PolicyStatement({
          sid: "snsPublish",
          actions: ["sns:Publish"],
          effect: iam.Effect.ALLOW,
          resources: [topic.topicArn],
        }),
      ],
    });
    lambdaIamAccessKeyAgeCheck.role?.attachInlinePolicy(policy);

    const lambdaOrganizationListActiveAccounts = new lambdaNodeJs.NodejsFunction(
      this,
      "lambdaOrganizationListActiveAccounts",
      {
        description: `list all Organization accounts and return an array of account IDs`,
        functionName: "organization-list-accounts",
        entry: path.join(__dirname, "./lambda/organizationListActiveAccountsLambda.ts"),
        role: props.role,
        runtime: lambda.Runtime.NODEJS_18_X,
        environment: {},
        bundling: {
          minify: true,
          sourceMap: true,
        },
        timeout: Duration.minutes(1),
      }
    );

    const lambdaSnsReport = new lambdaNodeJs.NodejsFunction(this, "lambdaSnsReport", {
      description: `compose the IAM access key age check Organization report and deliver via SNS`,
      functionName: "organization-iam-access-key-age-check-report",
      entry: path.join(__dirname, "./lambda/snsReportLambda.ts"),
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: {
        MIN_NOTIFICATION_AGE: minmumNotificationAge,
        SNS_TOPIC_ARN: topic.topicArn,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
      timeout: Duration.minutes(1),
    });
    topic.grantPublish(lambdaSnsReport.role!);

    // Step Function
    const taskGetActiveOrganizationAccounts = new tasks.LambdaInvoke(this, "Lambda - Get Organization accounts", {
      lambdaFunction: lambdaOrganizationListActiveAccounts,
      resultSelector: {
        "accounts.$": "$.Payload",
      },
      resultPath: "$.organizationDetails",
    });

    const taskLambdaIamAccessKeyAgeCheck = new tasks.LambdaInvoke(this, "Lambda - Evaluate user access key ages", {
      lambdaFunction: lambdaIamAccessKeyAgeCheck,
      resultSelector: {
        "result.$": "$.Payload",
      },
    });

    const mapMaxConcurrency = 3;
    const map = new sfn.Map(this, `Map over accounts with concurrency of ${mapMaxConcurrency}`, {
      maxConcurrency: mapMaxConcurrency,
      itemsPath: sfn.JsonPath.stringAt("$.organizationDetails.accounts"),
    });
    map.iterator(taskLambdaIamAccessKeyAgeCheck);

    const taskSendSnsReport = new tasks.LambdaInvoke(this, "Lambda - Parse results and report via SNS", {
      lambdaFunction: lambdaSnsReport,
    });

    const stepFunction = new sfn.StateMachine(this, "machine", {
      definitionBody: sfn.DefinitionBody.fromChainable(taskGetActiveOrganizationAccounts.next(map).next(taskSendSnsReport)),
      stateMachineName: name,
      logs: {
        destination: new logs.LogGroup(this, "stateMachineLogs", {
          logGroupName: `/aws/stepfunctions/${name}`,
          retention: logs.RetentionDays.ONE_MONTH,
        }),
        level: sfn.LogLevel.ALL,
      },
    });

    // Invoke the Step Function on a schedule
    new events.Rule(this, "invokeRule", {
      schedule: events.Schedule.cron({
        minute: "0",
        hour: "8",
        weekDay: "Fri",
      }),
      description: "invoke the Organization IAM access key age check step function",
      ruleName: name,
      targets: [new targets.SfnStateMachine(stepFunction)],
    });
  }
}
