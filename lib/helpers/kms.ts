import { aws_iam as iam } from "aws-cdk-lib";

/**
 * Allow the current account to manage the KMS key
 *
 * @returns iam.PolicyStatement
 */
export function kmsAllowAccountManagement(): iam.PolicyStatement {
  return new iam.PolicyStatement({
    sid: "Allow direct access to key metadata to the account",
    effect: iam.Effect.ALLOW,
    actions: ["kms:*"],
    principals: [new iam.AccountRootPrincipal()],
    resources: ["*"],
  });
}

/**
 * Allow a specific AWS Service to use the KMS Key in the current account
 *
 * @param accountId - The 12 digit AWS account ID
 * @param viaServiceName - the service name.  E.g. ec2, ssm, s3, secretsmanager.
 * @returns iam.PolicyStatement
 */
export function kmsAllowServiceVia(accountId: string, viaServiceName: string): iam.PolicyStatement {
  return new iam.PolicyStatement({
    sid: `Allow access for principals in the account that are authorized to use the ${viaServiceName} service`,
    effect: iam.Effect.ALLOW,
    actions: [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:ReEncrypt*",
      "kms:CreateGrant",
      "kms:DescribeKey",
      "kms:GenerateDataKey*",
    ],
    principals: [new iam.AnyPrincipal()],
    resources: ["*"],
    conditions: {
      StringEquals: {
        "kms:CallerAccount": accountId,
      },
      StringLike: {
        "kms:ViaService": `${viaServiceName}.*.amazonaws.com`,
      },
    },
  });
}

/**
 * Allow the organization to decrypt with a KMS key
 *
 * @param organizationId - Organization ID.  @example E.g. o-123456
 * @returns iam.PolicyStatement
 */
export function kmsAllowOrganizationDecrypt(organizationId: string): iam.PolicyStatement {
  return new iam.PolicyStatement({
    actions: ["kms:Decrypt"],
    effect: iam.Effect.ALLOW,
    resources: ["*"],
    principals: [new iam.OrganizationPrincipal(organizationId)],
  });
}
