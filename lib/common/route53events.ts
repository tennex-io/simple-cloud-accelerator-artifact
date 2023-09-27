import {
  aws_events as events,
  aws_events_targets as eventsTargets,
  aws_iam as iam,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

interface Route53eventProps extends StackProps {
  /**
   * Target Event Bus ARN
   *
   * This should be the event bus in the shared services account
   */
  targetBusArn: string;
}

export class Route53event extends Stack {
  constructor(scope: Construct, id: string, props: Route53eventProps) {
    super(scope, id, props);

    const sharedServicesEventBusArn = events.EventBus.fromEventBusArn(this, "sharedServicesBus", props.targetBusArn);

    const role = new iam.Role(this, "roleEventPublish", {
      assumedBy: new ServicePrincipal("events.amazonaws.com"),
      description: "allow event publishing to the shared services route53 event bus",
      roleName: "route53-event-notifier",
    });

    new events.Rule(this, "ruleHostedZoneCreated", {
      description: "notify shared-services account when a new hosted zone is created",
      targets: [
        new eventsTargets.EventBus(sharedServicesEventBusArn, {
          role,
        }),
      ],
      ruleName: "new-hosted-zone",
      eventPattern: {
        source: ["aws.route53"],
        detailType: ["AWS API Call via CloudTrail"],
        detail: {
          eventName: ["CreateHostedZone"],
        },
      },
    });
  }
}
