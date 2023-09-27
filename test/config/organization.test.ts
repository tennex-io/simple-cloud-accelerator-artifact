import { Config } from "@common/config";
import { awsConfigDetails } from "@config/coreConfig";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";

import { baseTests } from "./config";

const stackProps = {
  s3Props: {
    bucketName: awsConfigDetails.configOrganizationBucketName,
    isExistingBucket: true,
  },
};
const app = new App();
const config = new Config(app, "config", stackProps);
const template = Template.fromStack(config);

baseTests(template, stackProps);

describe("Config Stack", () => {
  test("Stack has expected number of resources", () => {
    template.resourceCountIs("AWS::IAM::ServiceLinkedRole", 1);
    template.resourceCountIs("AWS::Config::ConfigurationRecorder", 1);
    template.resourceCountIs("AWS::Config::DeliveryChannel", 1);
  });
});
