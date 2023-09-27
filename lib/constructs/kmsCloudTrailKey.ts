import { aws_iam as iam, aws_kms as kms } from "aws-cdk-lib";
import { Construct } from "constructs";

interface CloudTrailKmsKeyProps {
  /**
   * Current account ID
   *
   */
  currentAccountId: string;
  /**
   * Organization Member Accounts
   *
   * Passing a list of accounts will allow organization spoke accounts to encrypt with the key
   *
   * @default - undefined
   */
  memberAccountIds: string[] | undefined;
}

export class CloudTrailKmsKey extends Construct {
  kmsKey: kms.Key;

  constructor(scope: Construct, id: string, props: CloudTrailKmsKeyProps) {
    super(scope, id);

    const kmsPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          sid: "Enable the account to manage permissions",
          actions: ["kms:*"],
          principals: [new iam.AccountPrincipal(props.currentAccountId)],
          resources: ["*"],
        }),
        new iam.PolicyStatement({
          sid: "Allow CloudTrail service to describe the key",
          actions: ["kms:DescribeKey"],
          resources: ["*"],
          principals: [new iam.ServicePrincipal("cloudtrail.amazonaws.com")],
        }),
        new iam.PolicyStatement({
          sid: "Allow CloudTrail service to encrypt logs",
          actions: ["kms:GenerateDataKey*"],
          principals: [new iam.ServicePrincipal("cloudtrail.amazonaws.com")],
          resources: ["*"],
          conditions: {
            StringLike: {
              "kms:EncryptionContext:aws:cloudtrail:arn": [`arn:aws:cloudtrail:*:${props.currentAccountId}:trail/*`],
            },
          },
        }),
        new iam.PolicyStatement({
          sid: "Allow principals in the account to decrypt log files",
          actions: ["kms:ReEncryptFrom", "kms:Decrypt"],
          principals: [new iam.AnyPrincipal()],
          resources: ["*"],
          conditions: {
            StringEquals: {
              "kms:CallerAccount": `${props.currentAccountId}`,
            },
            StringLike: {
              "kms:EncryptionContext:aws:cloudtrail:arn": `arn:aws:cloudtrail:*:${props.currentAccountId}:trail/*`,
            },
          },
        }),
      ],
    });

    this.kmsKey = new kms.Key(this, "key", {
      alias: "cloudtrail",
      description: "Encrypts CloudTrail S3 and CloudWatch Logs",
      enableKeyRotation: true,
      policy: kmsPolicy,
    });

    // Escape hatch until L2 construct supports multi-region keys
    const cfnKmsKey = this.kmsKey.node.defaultChild as kms.CfnKey;
    cfnKmsKey.multiRegion = true;

    // Organization spoke accounts may use this key as well
    if (props.memberAccountIds) {
      kmsPolicy.addStatements(
        new iam.PolicyStatement({
          sid: "Allow spoke account Trails to encrypt with this key",
          effect: iam.Effect.ALLOW,
          actions: ["kms:ReEncryptFrom", "kms:GenerateDataKey*", "kms:Encrypt"],
          principals: [new iam.ServicePrincipal("cloudtrail.amazonaws.com")],
          resources: ["*"],
          conditions: {
            StringLike: {
              "kms:EncryptionContext:aws:cloudtrail:arn": props.memberAccountIds.map(
                (accountId) => `arn:aws:cloudtrail:*:${accountId}:trail/*`
              ),
            },
          },
        })
      );
    }
  }
}
