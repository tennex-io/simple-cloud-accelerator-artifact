import { aws_iam as iam, aws_secretsmanager as secretsmanager, SecretValue, aws_kms as kms } from "aws-cdk-lib";
import { Construct } from "constructs";

interface SecretsManagerOrganizationSharedSecretProps {
  /**
   * Secret description
   */
  description: string;
  /**
   * KMS Key that will encrypt the secret.  This key should allow decrypt operations
   * to organization accounts
   */
  kmsKeyId: kms.IKey;
  /**
   * AWS Organization ID
   */
  organizationId: string;
  /**
   * Name of the secret
   */
  secretName: string;
  /**
   * Value for the secret
   */
  secretValue: string;
}

export class SecretsManagerOrganizationSharedSecret extends Construct {
  constructor(scope: Construct, id: string, props: SecretsManagerOrganizationSharedSecretProps) {
    super(scope, id);

    const secret = new secretsmanager.Secret(this, props.secretName, {
      description: props.description,
      secretName: props.secretName,
      encryptionKey: props.kmsKeyId,
      secretObjectValue: {
        id: SecretValue.unsafePlainText(props.secretValue),
      },
    });

    secret.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        sid: "allowOrganizationRead",
        actions: ["secretsmanager:GetSecretValue"],
        principals: [new iam.AnyPrincipal()],
        resources: ["*"],
        conditions: {
          StringEquals: {
            "aws:PrincipalOrgID": props.organizationId,
          },
        },
      })
    );
  }
}
