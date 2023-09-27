import { App } from "aws-cdk-lib";
import { guardDutyDetails } from "@config/coreConfig";
import { GuardDuty, GuardDutyProps } from "@environments/security/guardduty";
import { Account } from "@lib/types";
import { Match, Template } from "aws-cdk-lib/assertions";
import { lambdaCustomResourceFunctionPrefix, nodeVersion } from "@test/test-config";
import { getLambdaFunctionRoleResourceId } from "@test/utils";

const accounts: Account[] = [
  {
    name: "organization",
    email: "organization@example.com",
    iamAlias: "organization",
    id: "111111111111",
    primaryRegion: "us-east-1",
  },
  {
    name: "security",
    email: "security@example.com",
    iamAlias: "security",
    id: "222222222222",
    primaryRegion: "us-east-1",
  },
  {
    name: "research",
    email: "research@example.com",
    iamAlias: "research",
    id: "333333333333",
    primaryRegion: "us-east-1",
  },
];
const snsAlertEmails: typeof guardDutyDetails.snsAlertEmails = ["target1@example.com", "target2@example.com"];
const detectorId: typeof guardDutyDetails.securityAccountDetectorId = "66c28bdd300000000000c4c17d541a44";
const stackProps: GuardDutyProps = {
  detectorId,
  members: accounts
    .filter((account) => account.name !== "security")
    .map((account) => {
      return {
        email: account.email,
        memberId: account.id,
      };
    }),
  snsEmailTargets: snsAlertEmails,
  protection: {
    enableKubernetesAuditLogs: true,
    enableS3LogDataSources: true,
    malwareScanning: {
      enabled: true,
      retainDetectedSnapshots: "NO_RETENTION",
    },
  },
};
const app = new App();
const guardDutyStack = new GuardDuty(app, "guardduty", stackProps);
const template = Template.fromStack(guardDutyStack);

describe("Custom resources", () => {
  const lambdaFunction = template.findResources("AWS::Lambda::Function", {
    Properties: {
      FunctionName: Match.stringLikeRegexp(`^${lambdaCustomResourceFunctionPrefix}.*`),
    },
  });

  test("Function role has the proper IAM access", () => {
    const lambdaFunctionRoleResourceName = getLambdaFunctionRoleResourceId(lambdaFunction);
    template.findResources("AWS::IAM::Policy", {
      Properties: {
        Roles: Match.arrayWith([
          {
            Ref: lambdaFunctionRoleResourceName,
          },
        ]),
        PolicyDocument: {
          Statement: Match.arrayWith([
            {
              Action: ["guardduty:UpdateDetector", "guardduty:UpdateOrganizationConfiguration"],
              Effect: "Allow",
              Resource: "*",
            },
          ]),
        },
      },
    });
  });

  test(`All functions begining with ${lambdaCustomResourceFunctionPrefix}* use the ${nodeVersion} runtime`, () => {
    Object.values(lambdaFunction).forEach((v) => {
      expect(v.Properties.Runtime).toBe(nodeVersion);
    });
  });

  test("Organization updater has the expected properties", () => {
    template.hasResourceProperties("AWS::CloudFormation::CustomResource", {
      ServiceToken: {
        "Fn::GetAtt": Match.arrayWith([Match.stringLikeRegexp(".*frameworkonEvent.*"), "Arn"]),
      },
      detectorId: stackProps.detectorId,
      protection: {
        enableKubernetesAuditLogs: true,
        enableS3LogDataSources: true,
        malwareScanning: {
          enabled: true,
          retainDetectedSnapshots: "NO_RETENTION",
        },
      },
      findingPublishingFrequency: "FIFTEEN_MINUTES",
    });
  });
});
// test('Stack has expected number of resources', () => {
//   template.resourceCountIs('AWS::SNS::TopicPolicy', 1);
//   template.resourceCountIs('AWS::CloudFormation::CustomResource', 1);
//   template.resourceCountIs('AWS::Events::Rule', 1);
//   template.resourceCountIs('AWS::GuardDuty::Member', 2);
//   template.resourceCountIs('AWS::IAM::Policy', );
//   template.resourceCountIs('AWS::IAM::Role', );
//   template.resourceCountIs('AWS::Lambda::Function', );
//   template.resourceCountIs('AWS::Lambda::Permission', );
//   template.resourceCountIs('AWS::SNS::Subscription', );
//   template.resourceCountIs('AWS::SNS::Topic', );
// });
//   AWS::CloudFormation::CustomResource
// AWS::Events::Rule
// AWS::GuardDuty::Member
// AWS::GuardDuty::Member
// AWS::IAM::Policy
// AWS::IAM::Policy
// AWS::IAM::Policy
// AWS::IAM::Policy
// AWS::IAM::Role
// AWS::IAM::Role
// AWS::IAM::Role
// AWS::IAM::Role
// AWS::Lambda::Function
// AWS::Lambda::Function
// AWS::Lambda::Function
// AWS::Lambda::Function
// AWS::Lambda::Permission
// AWS::SNS::Subscription
// AWS::SNS::Subscription
// AWS::SNS::Topic
// AWS::SSM::Parameter::Value<String>
// Custom::LogRetention
// Custom::LogRetention
//   test('Test', () => {
//     console.log(JSON.stringify(template, null, 2));
//   });
