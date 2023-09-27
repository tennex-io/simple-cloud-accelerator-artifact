import { Cloudtrail, CloudtrailProps } from "@common/cloudtrail";
import { cloudTrailDetails } from "@config/coreConfig";
import { App } from "aws-cdk-lib";
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
    insightsProps: {
      monitorApiErrorRate: true,
      monitorApiRate: true,
    },
    isOrganizationTrail: true,
    logGroupPrefix: cloudTrailDetails.cloudwatchLogPrefix,
    logToCloudWatchLogs: true,
    name: cloudTrailDetails.primaryTrailName,
    s3LoggingPrefix: cloudTrailDetails.primaryTrailS3LoggingPrefix,
    trailType: "MANAGEMENT",
  },
} as CloudtrailProps;
const cloudtrailStack = new Cloudtrail(app, "cloudtrail", stackProps);

const template = Template.fromStack(cloudtrailStack);

describe("CloudTrail Stack", () => {
  baseTests(template, stackProps);
});

describe("CloudTrail Organization deployment for management trail", () => {
  test("Trail logs all management events", () => {
    template.hasResourceProperties("AWS::CloudTrail::Trail", {
      EventSelectors: [
        {
          IncludeManagementEvents: true,
          ReadWriteType: "All",
        },
      ],
    });
  });
});
