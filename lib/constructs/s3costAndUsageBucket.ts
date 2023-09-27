import { aws_iam as iam, aws_s3 as s3 } from "aws-cdk-lib";
import { Construct } from "constructs";

export class CurBucket extends Construct {
  bucket: s3.Bucket;

  constructor(scope: Construct, id: string, accountId: string, region: string) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, "curBucket", {
      bucketName: `cost-and-usage-${accountId}`,
      blockPublicAccess: {
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
      },
      encryption: s3.BucketEncryption.S3_MANAGED,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
    });

    const curCondition = {
      StringEquals: {
        "aws:SourceArn": `arn:aws:cur:${region}:${accountId}:definition/*`,
        "aws:SourceAccount": accountId,
      },
    };

    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetBucketAcl", "s3:GetBucketPolicy"],
        resources: [this.bucket.bucketArn],
        principals: [new iam.ServicePrincipal("billingreports.amazonaws.com")],
        conditions: curCondition,
      })
    );

    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject"],
        resources: [`${this.bucket.bucketArn}/*`],
        principals: [new iam.ServicePrincipal("billingreports.amazonaws.com")],
        conditions: curCondition,
      })
    );
  }
}
