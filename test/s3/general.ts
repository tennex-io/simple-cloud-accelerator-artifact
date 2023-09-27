import { Match, Template } from "aws-cdk-lib/assertions";

export function allBucketsBlockPublicAccess(template: Template) {
  return () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  };
}

export function allBucketsDisableAcls(template: Template) {
  return () => {
    template.hasResourceProperties(
      "AWS::S3::Bucket",
      Match.objectLike({
        OwnershipControls: {
          Rules: [
            {
              ObjectOwnership: "BucketOwnerEnforced",
            },
          ],
        },
      })
    );
  };
}

export function allBucketsHaveAes256encryption(template: Template) {
  return () => {
    template.hasResourceProperties(
      "AWS::S3::Bucket",
      Match.objectLike({
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: "AES256",
              },
            },
          ],
        },
      })
    );
  };
}

export function allBucketsHaveKmsEncryption(template: Template) {
  return () => {
    template.hasResourceProperties(
      "AWS::S3::Bucket",
      Match.objectLike({
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: "aws:kms",
              },
            },
          ],
        },
      })
    );
  };
}

export function allBucketsEncryptedWithKmsKeyArn(template: Template, kmsKeyArn: any) {
  return () => {
    template.hasResourceProperties(
      "AWS::S3::Bucket",
      Match.objectLike({
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: "aws:kms",
                KMSMasterKeyID: kmsKeyArn,
              },
            },
          ],
        },
      })
    );
  };
}

export function allBucketsAreVersioned(template: Template) {
  return () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      VersioningConfiguration: {
        Status: "Enabled",
      },
    });
  };
}
