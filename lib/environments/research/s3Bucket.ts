import { addRequiredTags } from "@helpers/general";
import { Stack, StackProps, aws_s3 as s3, Tags } from "aws-cdk-lib";
import { Construct } from "constructs";

export class ResearchS3buckets extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, "exampleBucket", {
      bucketName: `deployment-example-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      versioned: true,
    });
    addRequiredTags(bucket, {
      Department: "Research",
      Program: "Research",
      Owner: "Research",
    });
    Tags.of(bucket).add("backup-retention", "one-month");
  }
}
