import {
  aws_events as events,
  aws_events_targets as eventsTargets,
  aws_iam as iam,
  aws_lambda_nodejs as nodejs,
  aws_logs as logs,
  aws_route53 as route53,
  Duration,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";

interface Route53Props extends StackProps {
  /**
   * Name of the event bus that will 'listen' for zone creations from Organization accounts
   *
   * @default route53
   */
  busName?: string;
  /**
   * AWS Organization ID
   *
   * @example o-9xxxxxxxx9
   */
  organizationId: string;
  /**
   * Name of the existing domain in Route 53
   */
  hostedZoneDomain: string;
  /**
   * List of domains the Lambda function is allowed to created new NS records for
   */
  authorizedSubDomains: string[];
}

export class Route53 extends Stack {
  constructor(scope: Construct, id: string, props: Route53Props) {
    super(scope, id, props);
    const zone = route53.HostedZone.fromLookup(this, "parentZone", {
      domainName: props.hostedZoneDomain,
    });
    const eventBusName = props.busName ?? "route53";

    const eventBus = new events.EventBus(this, "bus", {
      eventBusName,
    });
    eventBus._enableCrossEnvironment();

    new events.CfnEventBusPolicy(this, "allowOrgPublish", {
      eventBusName: eventBus.eventBusName,
      action: "events:PutEvents",
      statementId: "allowOrganizationPut",
      principal: "*",
      condition: {
        type: "StringEquals",
        key: "aws:PrincipalOrgID",
        value: props.organizationId,
      },
    });

    const lambda = new nodejs.NodejsFunction(this, "route53AddSpokeZoneNsRecord", {
      functionName: "route53-spoke-account-ns",
      entry: path.join(__dirname, "lambda-r53-add-ns.ts"),
      bundling: {
        minify: true,
        sourceMap: true,
        mainFields: ["module", "main"],
      },
      description: "create NS records for subdomains created inside the organization",
      logRetention: logs.RetentionDays.ONE_MONTH,
      timeout: Duration.minutes(1),
      environment: {
        HOSTED_ZONE_ID: zone.hostedZoneId,
        BASE_DOMAIN: `${zone.zoneName}.`, // Trailing . required for normalizing with the event input.
      },
    });

    const policy = new iam.Policy(this, "policy", {
      policyName: "route53update",
      statements: [
        new iam.PolicyStatement({
          actions: ["route53:ChangeResourceRecordSets"],
          effect: iam.Effect.ALLOW,
          resources: [zone.hostedZoneArn],
          conditions: {
            "ForAllValues:StringEquals": {
              "route53:ChangeResourceRecordSetsNormalizedRecordNames": props.authorizedSubDomains,
              "route53:ChangeResourceRecordSetsRecordTypes": ["NS"],
              "route53:ChangeResourceRecordSetsActions": ["CREATE"],
            },
          },
        }),
      ],
    });
    lambda.role?.attachInlinePolicy(policy);

    new events.Rule(this, "ruleLambda", {
      eventBus,
      description: "receive hosted zone creation events from organization accounts and pass to lambda",
      eventPattern: {
        source: ["aws.route53"],
        detailType: ["AWS API Call via CloudTrail"],
        detail: {
          eventName: ["CreateHostedZone"],
        },
      },
      targets: [new eventsTargets.LambdaFunction(lambda)],
    });
  }
}
