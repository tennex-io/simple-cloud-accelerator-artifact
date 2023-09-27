import { Config } from "@common/config";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { awsConfigDetails, organizationDetails } from "@config/coreConfig";
import {
  allBucketsAreVersioned,
  allBucketsBlockPublicAccess,
  allBucketsDisableAcls,
  allBucketsHaveAes256encryption,
} from "@test/s3/general";

import { baseTests } from "./config";
import { getResourceName } from "@test/utils";

const stackProps = {
  s3Props: {
    bucketName: awsConfigDetails.configOrganizationBucketName,
    isOrganizationBucket: true,
  },
  organizationProps: {
    id: organizationDetails.organizationId,
    memberAccountIds: ["111111111111", "222222222222"],
    deployConfigOrganizationAggregator: true,
  },
};
const app = new App();
const config = new Config(app, "config", stackProps);
const template = Template.fromStack(config);

describe("Config Stack", () => {
  baseTests(template, stackProps);
  test("Stack has expected number of resources", () => {
    template.resourceCountIs("AWS::S3::Bucket", 1);
    template.resourceCountIs("AWS::S3::BucketPolicy", 1);
    template.resourceCountIs("AWS::IAM::ServiceLinkedRole", 1);
    template.resourceCountIs("AWS::Config::ConfigurationRecorder", 1);
    template.resourceCountIs("AWS::Config::DeliveryChannel", 1);
    template.resourceCountIs("AWS::IAM::Role", 1);
    template.resourceCountIs("AWS::Config::ConfigurationAggregator", 1);
  });
});

describe("S3 Bucket", () => {
  test("Bucket is AES256 encrypted", allBucketsHaveAes256encryption(template));
  test("ACLs are disabled (AWS Best Practice)", allBucketsDisableAcls(template));
  test("Bucket blocks public access", allBucketsBlockPublicAccess(template));
  test("Bucket is versioned", allBucketsAreVersioned(template));
});

const bucketResourceName = getResourceName(template, "AWS::S3::Bucket");
describe("S3 Bucket Policy", () => {
  test("Config service in spoke accounts can get bucket ACLs", () => {
    template.hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "s3:GetBucketAcl",
            Condition: {
              StringEquals: {
                "AWS:SourceAccount": stackProps.organizationProps.memberAccountIds,
              },
            },
            Effect: "Allow",
            Principal: {
              Service: "config.amazonaws.com",
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
  test("Config service in spoke accounts can list the bucket", () => {
    template.hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "s3:ListBucket",
            Condition: {
              StringEquals: {
                "AWS:SourceAccount": stackProps.organizationProps.memberAccountIds,
              },
            },
            Effect: "Allow",
            Principal: {
              Service: "config.amazonaws.com",
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
  test("Config service in spoke accounts can put objects", () => {
    template.hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "s3:PutObject",
            Condition: {
              StringEquals: {
                "AWS:SourceAccount": stackProps.organizationProps.memberAccountIds,
              },
            },
            Effect: "Allow",
            Principal: {
              Service: "config.amazonaws.com",
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
});

describe("Config Aggregator", () => {
  test("Service role has the proper IAM permissions", () => {
    template.hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          {
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
              Service: "config.amazonaws.com",
            },
          },
        ]),
      },
      ManagedPolicyArns: [
        {
          "Fn::Join": [
            "",
            [
              "arn:",
              {
                Ref: "AWS::Partition",
              },
              ":iam::aws:policy/service-role/AWSConfigRoleForOrganizations",
            ],
          ],
        },
      ],
    });
  });
  test("Aggregates all regions", () => {
    template.hasResourceProperties("AWS::Config::ConfigurationAggregator", {
      OrganizationAggregationSource: {
        AllAwsRegions: true,
      },
    });
  });
  test("Is associated with the service role", () => {
    const roleResourceName = getResourceName(template, "AWS::IAM::Role");
    template.hasResourceProperties("AWS::Config::ConfigurationAggregator", {
      OrganizationAggregationSource: Match.objectLike({
        RoleArn: {
          "Fn::GetAtt": [roleResourceName, "Arn"],
        },
      }),
    });
  });
});
