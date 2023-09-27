import { aws_iam as iam, aws_kms as kms, aws_s3 as s3 } from "aws-cdk-lib";
import { Construct } from "constructs";

interface CloudTrailBucketProps {
  /**
   * Bucket is for an AWS Organization trail
   *
   * @default - false
   */
  isOrganizationBucket: boolean;
  /** Existing KMS key
   *
   */
  kmsKey: kms.Key;
  /**
   * Bucket name
   */
  bucketName: string;
  /**
   * Organization Management Account ID
   *
   * @required for organization buckets
   */
  organizationManagementAccountId: string | undefined;
}

export class CloudTrailBucket extends Construct {
  bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: CloudTrailBucketProps) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, "bucket", {
      versioned: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
      }),
      bucketName: props.bucketName,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: props.kmsKey,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
    });

    if (props.isOrganizationBucket) {
      if (!props.organizationManagementAccountId) {
        throw new Error("organizationManagementAccount is required when isOrganizationBucket is true.");
      }

      // Allow Cloudtrail service to write to the 'trail/' path in the S3 bucket for the current account
      // https://docs.aws.amazon.com/awscloudtrail/latest/userguide/create-s3-bucket-policy-for-cloudtrail.html#org-trail-bucket-policy
      const cloudTrailServicePrincipal = new iam.ServicePrincipal("cloudtrail.amazonaws.com");

      // CloudTrail needs to be able to validate bucket ACLs from the Organization management account
      this.bucket.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: "CloudTrailOrganizationValidateAcl",
          actions: ["s3:GetBucketAcl"],
          resources: [`arn:aws:s3:::${this.bucket.bucketName}`],
          principals: [cloudTrailServicePrincipal],
          conditions: {
            StringLike: {
              "AWS:SourceArn": `arn:aws:cloudtrail:*:${props.organizationManagementAccountId}:trail/*`,
            },
          },
        })
      );

      // The trail from the Organization managment account needs access
      // Note: AWSLogs/ path scope is omitted to allow the organization account
      //       to select different prefixes
      this.bucket.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: "CloudTrailOrganizationPut",
          actions: ["s3:PutObject"],
          resources: [`arn:aws:s3:::${this.bucket.bucketName}/*`],
          principals: [cloudTrailServicePrincipal],
          conditions: {
            StringEquals: {
              "s3:x-amz-acl": "bucket-owner-full-control",
            },
            StringLike: {
              "AWS:SourceArn": `arn:aws:cloudtrail:*:${props.organizationManagementAccountId}:trail/*`,
            },
          },
        })
      );
    }
  }
}
