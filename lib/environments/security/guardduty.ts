import { GuarddutyOrganizationConfiguration } from "@customResources/guarddutyOrganizationAutoEnable";
import { GuardDutyProtection, GuardDutySeverity } from "@lib/types";
import {
  aws_events as events,
  aws_events_targets as targets,
  aws_guardduty as guardduty,
  aws_iam as iam,
  aws_lambda_nodejs as lambdaNodeJs,
  aws_sns as sns,
  aws_sns_subscriptions as subscriptions,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";

export interface GuardDutyProps extends StackProps {
  /**
   * GuardDuty detector ID.
   *
   * @example "52c0d560bf5c1aebc059fbf3827cb1eb"
   */
  detectorId: string;
  /**
   * List of member account objects.  These will be the member accounts in your Organization.
   */
  members: Omit<guardduty.CfnMemberProps, "detectorId">[];
  /**
   * GuardDuty protection properties
   */
  protection: GuardDutyProtection;
  /**
   * SNS alert Email targets
   *
   * List of email addresses to deliver GuardDuty findings to.
   */
  snsEmailTargets?: string[];
  /**
   * Minimum severity level to alert on.
   *
   * Sets the bottom threshold to deliver alerts.
   * @default LOW
   */
  minimumFindingSeverity?: GuardDutySeverity;
}

export class GuardDuty extends Stack {
  constructor(scope: Construct, id: string, props: GuardDutyProps) {
    super(scope, id, props);

    const organizationConfiguration = new GuarddutyOrganizationConfiguration(
      this,
      "guardDutyOrganizationConfiguration",
      {
        detectorId: props.detectorId,
        protection: props.protection,
      }
    );

    props.members.forEach((member) => {
      const resource = new guardduty.CfnMember(this, `member${member.memberId}`, {
        detectorId: props.detectorId,
        ...member,
      });
      // Add an explict dependency so new accounts inherit Organization-wide settings
      resource.node.addDependency(organizationConfiguration);
    });

    const topic = new sns.Topic(this, "topic", {
      displayName: "guardduty-notifications",
      topicName: "guardduty-notifications",
    });

    props.snsEmailTargets?.forEach((email) => {
      topic.addSubscription(new subscriptions.EmailSubscription(email));
    });

    const eventRule = new events.Rule(this, "guarddutyEvent", {
      eventPattern: {
        source: ["aws.guardduty"],
        detailType: ["GuardDuty Finding"],
      },
    });

    const lambdaToSns = new lambdaNodeJs.NodejsFunction(this, "lambdaGuarddutyAlert", {
      description: "Normalizes Guardduty findings and delivers SNS",
      functionName: "guardduty-to-sns",
      entry: path.join(__dirname, "./lambda/guarddutySns.ts"),
      environment: {
        SNS_TOPIC_ARN: topic.topicArn,
        MIN_FINDING_SEVERITY: props.minimumFindingSeverity?.toString() || GuardDutySeverity.LOW.toString(),
      },
      bundling: {
        minify: true,
        sourceMap: true,
        mainFields: ["module", "main"],
      },
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
    lambdaToSns.role?.attachInlinePolicy(policy);

    eventRule.addTarget(new targets.LambdaFunction(lambdaToSns));
  }
}
