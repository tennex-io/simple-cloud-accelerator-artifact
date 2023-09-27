import { aws_guardduty as guardduty, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

export class GuardDuty extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    new guardduty.CfnDetector(this, "detector", {
      enable: true,
      findingPublishingFrequency: "FIFTEEN_MINUTES",
    });
  }
}
