import { SecretsManagerOrganizationSharedSecret } from "@constructs/secretsManagerOrganizationSharedSecret";
import { aws_kms as kms, aws_oam as oam, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

interface OamProps extends StackProps {
  /**
   * AWS Organization ID
   */
  organizationId: string;
  /**
   * KMS Key to encrypt the secret.  The organization must be allowed to decrypt using this key.
   */
  kmsKey: kms.IKey;
  /**
   * Optional name of the secret
   *
   * @default oam-sink-arn
   */
  secretName?: string;
}

export class Oam extends Stack {
  constructor(scope: Construct, id: string, props: OamProps) {
    super(scope, id, props);

    const sink = new oam.CfnSink(this, "oamSink", {
      name: "organization",
      policy: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              AWS: "*",
            },
            Action: ["oam:CreateLink", "oam:UpdateLink"],
            Resource: "*",
            Condition: {
              "ForAllValues:StringEquals": {
                "oam:ResourceTypes": ["AWS::Logs::LogGroup", "AWS::CloudWatch::Metric", "AWS::XRay::Trace"],
              },
              StringEquals: {
                "aws:PrincipalOrgID": props.organizationId,
              },
            },
          },
        ],
      },
    });

    new SecretsManagerOrganizationSharedSecret(this, "organizationSinkArnSecret", {
      description: "OAM sink ARN in the monitoring account",
      kmsKeyId: props.kmsKey,
      organizationId: props.organizationId,
      secretName: props.secretName ?? "oam-sink-arn",
      secretValue: sink.ref,
    });
  }
}
