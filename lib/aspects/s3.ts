import { Annotations, aws_s3 as s3, IAspect, Stack } from "aws-cdk-lib";
import { IConstruct } from "constructs";

/**
 * Enforce all S3 buckets have explict S3 encryption
 */
export class BucketEncryptionCheck implements IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof s3.CfnBucket) {
      if (!node.bucketEncryption) {
        const link = "https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_s3.BucketEncryption.html";
        const message = `The '${node.bucketName}' bucket must be encrypted.\nFor an example, visit ${link}`;
        Annotations.of(node).addError(message);
      }
    }
  }
}

/**
 * Warn if intelligent tiering is not enabled
 */
export class IntelligentTieringCheck implements IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof s3.CfnBucket) {
      if (!node.intelligentTieringConfigurations) {
        const link = "https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_s3.BucketEncryption.html";
        const message = `The '${node.bucketName}' bucket does not leverage intelligent tiering.\nFor an example, visit ${link}`;
        Annotations.of(node).addWarning(message);
      }
    }
  }
}

/**
 * Warn if object ACLs are enabled.  AWS best practices recommend disabling
 */
export class ACLsDisabledCheck implements IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof s3.CfnBucket) {
      const awsLink =
        "https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html#security-best-practices-prevent";
      const cdkLink = "https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_s3.ObjectOwnership.html";
      const examples = `For availabile options, visit ${cdkLink}\nFor S3 security best practices, visit ${awsLink}`;

      const { bucketName } = node;
      const resolvedOwnershipControls = Stack.of(node).resolve(node.ownershipControls);

      // ACLs are not explicitly disabled
      if (!resolvedOwnershipControls) {
        const message = `The '${bucketName}' bucket does not disable legacy bucket ACLs.\n${examples}`;
        Annotations.of(node).addWarning(message);
      } else {
        // Object ACLs are explicitly enabled, recommend disabling
        const ownershipControls = resolvedOwnershipControls as s3.CfnBucket.OwnershipControlsProperty;
        const rules = ownershipControls.rules as s3.CfnBucket.OwnershipControlsRuleProperty[];
        const objectOwnership = rules?.[0].objectOwnership;

        if (objectOwnership !== "BucketOwnerEnforced") {
          const message = `The ${bucketName} has object ownership set to ${objectOwnership}.\nBucketOwnerEnforced is recommended.\n${examples}`;
          Annotations.of(node).addWarning(message);
        }
      }
    }
  }
}
