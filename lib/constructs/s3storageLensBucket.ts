import { validRegion } from "@lib/types";
import { aws_iam as iam, aws_s3 as s3 } from "aws-cdk-lib";
import { Construct } from "constructs";

interface StorageLensBucketProps {
  /**
   * Dashboard Name
   */
  dashboardName: string;
  /**
   * Bucket name
   */
  bucketName: string;
  /**
   * Current AWS Account ID
   */
  currentAccountId: string;
  /**
   * Current AWS Region
   */
  currentRegion: validRegion;
}

export class StorageLensBucket extends Construct {
  bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StorageLensBucketProps) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, "bucket", {
      versioned: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
      }),
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      bucketName: props.bucketName,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    const storageLensConfigPrincipal = new iam.ServicePrincipal("storage-lens.s3.amazonaws.com");

    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject"],
        resources: [this.bucket.arnForObjects("*")],
        principals: [storageLensConfigPrincipal],
        conditions: {
          StringEquals: {
            "aws:SourceArn": `arn:aws:s3:${props.currentRegion}:${props.currentAccountId}:storage-lens/${props.dashboardName}`,
            "aws:SourceAccount": props.currentAccountId,
          },
        },
      })
    );
  }
}
