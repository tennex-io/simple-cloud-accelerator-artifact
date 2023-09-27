import { Cloudtrail, CloudtrailProps } from "@common/cloudtrail";
import { cloudTrailDetails } from "@config/coreConfig";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import {
  allBucketsAreVersioned,
  allBucketsBlockPublicAccess,
  allBucketsDisableAcls,
  allBucketsEncryptedWithKmsKeyArn,
} from "@test/s3/general";
import { getResourceName } from "@test/utils";

// check the condition if s3props.isExistingBucket = true but there's no trail then there's nothing to deploy
// we should warn on this
const app = new App();
const stackProps = {
  s3Props: {
    bucketName: cloudTrailDetails.cloudtrailOrganizationBucketName,
    isOrganizationBucket: true,
  },
  organizationProps: {
    memberAccountIds: ["111111111111", "222222222222"],
    id: "o-12345678",
    managementAccountId: "999999999999",
  },
} as CloudtrailProps;

const cloudtrailStack = new Cloudtrail(app, "cloudtrail", stackProps);
const template = Template.fromStack(cloudtrailStack);

describe("KMS Key", () => {
  test("Stack has the expected number of resources", () => {
    template.resourceCountIs("AWS::KMS::Key", 1);
    template.resourceCountIs("AWS::KMS::Alias", 1);
    template.resourceCountIs("AWS::S3::Bucket", 1);
    template.resourceCountIs("AWS::S3::BucketPolicy", 1);
  });

  test("Allows management by the current account", () => {
    template.hasResourceProperties("AWS::KMS::Key", {
      KeyPolicy: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "kms:*",
            Effect: "Allow",
            Resource: "*",
            Principal: {
              AWS: {
                "Fn::Join": [
                  "",
                  [
                    "arn:",
                    {
                      Ref: "AWS::Partition",
                    },
                    ":iam::",
                    {
                      Ref: "AWS::AccountId",
                    },
                    ":root",
                  ],
                ],
              },
            },
          }),
        ]),
      }),
    });
  });

  test("Allows the CloudTrail service to describe the key", () => {
    template.hasResourceProperties("AWS::KMS::Key", {
      KeyPolicy: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "kms:DescribeKey",
            Effect: "Allow",
            Resource: "*",
            Principal: {
              Service: "cloudtrail.amazonaws.com",
            },
          }),
        ]),
      }),
    });
  });

  test("Allows CloudTrail to generate a data key", () => {
    template.hasResourceProperties("AWS::KMS::Key", {
      KeyPolicy: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "kms:GenerateDataKey*",
            Effect: "Allow",
            Resource: "*",
            Principal: {
              Service: "cloudtrail.amazonaws.com",
            },
            Condition: {
              StringLike: {
                "kms:EncryptionContext:aws:cloudtrail:arn": [
                  {
                    "Fn::Join": [
                      "",
                      [
                        "arn:aws:cloudtrail:*:",
                        {
                          Ref: "AWS::AccountId",
                        },
                        ":trail/*",
                      ],
                    ],
                  },
                ],
              },
            },
          }),
        ]),
      }),
    });
  });

  test("Allows CloudTrail to decrypt log files in the current account", () => {
    template.hasResourceProperties("AWS::KMS::Key", {
      KeyPolicy: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: ["kms:ReEncryptFrom", "kms:Decrypt"],
            Effect: "Allow",
            Resource: "*",
            Principal: {
              AWS: "*",
            },
            Condition: {
              StringEquals: {
                "kms:CallerAccount": {
                  Ref: "AWS::AccountId",
                },
              },
              StringLike: {
                "kms:EncryptionContext:aws:cloudtrail:arn": {
                  "Fn::Join": [
                    "",
                    [
                      "arn:aws:cloudtrail:*:",
                      {
                        Ref: "AWS::AccountId",
                      },
                      ":trail/*",
                    ],
                  ],
                },
              },
            },
          }),
        ]),
      }),
    });
  });

  test("Allows spoke account to encrypt trails with this key", () => {
    expect(stackProps.organizationProps).toBeDefined();
    template.hasResourceProperties("AWS::KMS::Key", {
      KeyPolicy: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: ["kms:ReEncryptFrom", "kms:GenerateDataKey*", "kms:Encrypt"],
            Effect: "Allow",
            Resource: "*",
            Principal: {
              Service: "cloudtrail.amazonaws.com",
            },
            Condition: {
              StringLike: {
                "kms:EncryptionContext:aws:cloudtrail:arn": stackProps.organizationProps!.memberAccountIds.map((id) => {
                  return `arn:aws:cloudtrail:*:${id}:trail/*`;
                }),
              },
            },
          }),
        ]),
      }),
    });
  });

  test("Key is multi-region and has rotation enabled", () => {
    template.hasResourceProperties("AWS::KMS::Key", {
      EnableKeyRotation: true,
      MultiRegion: true,
    });
  });

  test("Key has an alias defined", () => {
    const keyResourceName = getResourceName(template, "AWS::KMS::Key");
    template.hasResourceProperties("AWS::KMS::Alias", {
      AliasName: "alias/cloudtrail",
      TargetKeyId: {
        "Fn::GetAtt": [keyResourceName, "Arn"],
      },
    });
  });
});

describe("Bucket Policy", () => {
  const bucketResourceName = getResourceName(template, "AWS::S3::Bucket");

  test("Allows CloudTrail service to get Bucket ACL", () => {
    const bucketResourceName = getResourceName(template, "AWS::S3::Bucket");
    template.hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "s3:GetBucketAcl",
            Condition: {
              StringLike: {
                "AWS:SourceArn": `arn:aws:cloudtrail:*:${stackProps.organizationProps!.managementAccountId}:trail/*`,
              },
            },
            Effect: "Allow",
            Principal: {
              Service: "cloudtrail.amazonaws.com",
            },
            Resource: {
              "Fn::Join": [
                "",
                [
                  "arn:aws:s3:::",
                  {
                    Ref: bucketResourceName,
                  },
                ],
              ],
            },
          }),
        ]),
      },
    });
  });

  test("Allows CloudTrail to put objects", () => {
    template.hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "s3:PutObject",
            Condition: {
              StringEquals: {
                "s3:x-amz-acl": "bucket-owner-full-control",
              },
              StringLike: {
                "AWS:SourceArn": `arn:aws:cloudtrail:*:${stackProps.organizationProps!.managementAccountId}:trail/*`,
              },
            },
            Effect: "Allow",
            Principal: {
              Service: "cloudtrail.amazonaws.com",
            },
            Resource: {
              "Fn::Join": [
                "",
                [
                  "arn:aws:s3:::",
                  {
                    Ref: bucketResourceName,
                  },
                  "/*",
                ],
              ],
            },
          }),
        ]),
      },
    });
  });

  test("Policy is attached to the bucket", () => {
    template.hasResourceProperties("AWS::S3::BucketPolicy", {
      Bucket: {
        Ref: bucketResourceName,
      },
    });
  });
});

describe("Bucket", () => {
  test("Encrypted with the KMS key", () => {
    const kmsKeyResourceName = getResourceName(template, "AWS::KMS::Key");
    allBucketsEncryptedWithKmsKeyArn(template, {
      "Fn::GetAtt": [kmsKeyResourceName, "Arn"],
    });
  });

  test("Versioning enabled", allBucketsAreVersioned(template));

  test("Public access blocked", allBucketsBlockPublicAccess(template));

  test("ACLs are disabled (AWS Best Practice)", allBucketsDisableAcls(template));
});
