import { Cloudtrail, CloudtrailProps } from "@common/cloudtrail";
import { cloudTrailDetails } from "@config/coreConfig";
import { App, aws_cloudtrail as cloudtrail } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";

import { baseTests } from "./cloudtrail";

// check the condition if s3props.isExistingBucket = true but there's no trail then there's nothing to deploy
// we should warn on this
const app = new App();
const stackProps = {
  kmsKey: "arn:aws:kms:us-east-1:123412341234:alias/cloudtrail",
  s3Props: {
    bucketName: cloudTrailDetails.cloudtrailOrganizationBucketName,
    isExistingBucket: true,
  },
  trailProps: {
    dataEventLogging: {
      allBuckets: cloudtrail.ReadWriteType.ALL,
    },
    insightsProps: {
      monitorApiErrorRate: true,
      monitorApiRate: true,
    },
    isOrganizationTrail: true,
    logGroupPrefix: cloudTrailDetails.cloudwatchLogPrefix,
    logToCloudWatchLogs: true,
    name: cloudTrailDetails.dataTrailName,
    s3LoggingPrefix: cloudTrailDetails.dataTrailS3LoggingPrefix,
    trailType: "DATA",
  },
} as CloudtrailProps;
const cloudtrailStack = new Cloudtrail(app, "cloudtrail", stackProps);

const template = Template.fromStack(cloudtrailStack);

describe("CloudTrail Stack", () => {
  baseTests(template, stackProps);
});

describe("CloudTrail Organization deployment for management trail", () => {
  test("Trail logs all S3 events and no management events", () => {
    template.hasResourceProperties("AWS::CloudTrail::Trail", {
      EventSelectors: [
        {
          DataResources: [
            {
              Type: "AWS::S3::Object",
              Values: ["arn:aws:s3"],
            },
          ],
          IncludeManagementEvents: false,
          ReadWriteType: "All",
        },
      ],
    });
  });
});
