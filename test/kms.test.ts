import { Template } from "aws-cdk-lib/assertions";
import { Kms } from "@common/kms";
import { App } from "aws-cdk-lib";

const app = new App();
const kmsStack = new Kms(app, "kms", {
  enableDefaultEbsEncryption: true,
  enableEbsKey: true,
  enableSecretsManagerKey: true,
  enableAwsBackupsKey: true,
  organizationSecretSharingKey: {
    organizationId: "mock-organization-id",
  },
});
const template = Template.fromStack(kmsStack);

describe("KMS Stack", () => {
  test("Stack has expected number of resources", () => {
    template.resourceCountIs("AWS::IAM::Policy", 3);
    template.resourceCountIs("AWS::IAM::Role", 3);
    template.resourceCountIs("AWS::KMS::Alias", 4);
    template.resourceCountIs("AWS::KMS::Key", 4);
    template.resourceCountIs("AWS::Lambda::Function", 3);
  });
});
