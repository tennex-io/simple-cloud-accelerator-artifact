import { aws_iam as iam, aws_s3 as s3 } from "aws-cdk-lib";
import { Construct } from "constructs";

interface ConfigBucketProps {
  /**
   * Bucket is for an AWS Organization trail
   *
   * @default - false
   */
  isOrganizationBucket: boolean;
  /**
   * Bucket name
   */
  bucketName: string;
  /**
   * Organization Management Account IDs
   *
   * List of AWS account IDs that are allowed to write to the S3 config bucket
   *
   * @required for Organization buckets
   */
  organizationAccountIds?: string[] | undefined;
  /**
   * Current AWS Account ID
   */
  currentAccountId: string;
}

export class ConfigBucket extends Construct {
  bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: ConfigBucketProps) {
    super(scope, id);

    if (props.isOrganizationBucket) {
      if (!props.organizationAccountIds) {
        throw new Error("The organizationAccountIds property is required on organization buckets.");
      }
      if (props.organizationAccountIds[0] === "") {
        throw new Error("The organizationAccountIds property cannot be an empty array.");
      }
    }

    this.bucket = new s3.Bucket(this, "bucket", {
      versioned: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
      }),
      bucketName: props.bucketName,
      encryption: s3.BucketEncryption.S3_MANAGED,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
    });

    // Allow Config service to write to the S3 bucket
    // https://docs.aws.amazon.com/config/latest/developerguide/s3-bucket-policy.html#granting-access-in-another-account
    const configServicePrincipal = new iam.ServicePrincipal("config.amazonaws.com");

    // Config needs to be able to validate bucket ACLs from either the current account or orgnaization spoke accounts
    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AWSConfigBucketPermissionsCheck",
        actions: ["s3:GetBucketAcl"],
        resources: [`arn:aws:s3:::${this.bucket.bucketName}`],
        principals: [configServicePrincipal],
        conditions: {
          StringEquals: {
            "AWS:SourceAccount": props.isOrganizationBucket ? props.organizationAccountIds : props.currentAccountId,
          },
        },
      })
    );

    // Config service must be able to list the bucket
    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AWSConfigBucketExistenceCheck",
        actions: ["s3:ListBucket"],
        resources: [`arn:aws:s3:::${this.bucket.bucketName}`],
        principals: [configServicePrincipal],
        conditions: {
          StringEquals: {
            "AWS:SourceAccount": props.isOrganizationBucket ? props.organizationAccountIds : props.currentAccountId,
          },
        },
      })
    );

    // The trail from the Organization managment account needs access
    // Note: AWSLogs/ path scope is omitted to allow the organization account
    //       to select different prefixes
    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "ConfigOrganizationPut",
        actions: ["s3:PutObject"],
        resources: [`arn:aws:s3:::${this.bucket.bucketName}/*`],
        principals: [configServicePrincipal],
        conditions: {
          StringEquals: {
            "s3:x-amz-acl": "bucket-owner-full-control",
            "AWS:SourceAccount": props.isOrganizationBucket ? props.organizationAccountIds : props.currentAccountId,
          },
        },
      })
    );
  }
}
