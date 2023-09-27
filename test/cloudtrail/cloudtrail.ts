import { CloudtrailProps } from "@common/cloudtrail";
import { cloudTrailDetails } from "@config/coreConfig";
import { Match, Template } from "aws-cdk-lib/assertions";

import { getResourceName } from "../utils";

export function baseTests(template: Template, stackProps: CloudtrailProps) {
  describe("CloudTrail management and data base configuration", () => {
    test("Trail conforms to best practices", () => {
      template.hasResourceProperties("AWS::CloudTrail::Trail", {
        EnableLogFileValidation: true,
        IncludeGlobalServiceEvents: true,
        IsMultiRegionTrail: true,
        IsOrganizationTrail: true,
        KMSKeyId: stackProps.kmsKey,
        IsLogging: true,
      });
    });

    test("Trail logs to S3", () => {
      template.hasResourceProperties("AWS::CloudTrail::Trail", {
        S3BucketName: cloudTrailDetails.cloudtrailOrganizationBucketName,
      });
    });

    test("Trail log group exists and has a retention >= 180 days", () => {
      const logGroup = template.findResources("AWS::Logs::LogGroup", {
        Properties: Match.objectLike({
          RetentionInDays: Match.anyValue(),
        }),
      });
      expect(logGroup).toBeDefined();
      const props = Object.values(logGroup)[0].Properties;
      expect(props.RetentionInDays).toBeGreaterThanOrEqual(180);
    });

    test("Trail logs to CloudWatch Logs", () => {
      const logGroupResourceName = getResourceName(template, "AWS::Logs::LogGroup", {});
      template.hasResourceProperties("AWS::CloudTrail::Trail", {
        CloudWatchLogsLogGroupArn: {
          "Fn::GetAtt": [logGroupResourceName, "Arn"],
        },
      });
    });

    test("Insights are enabled for API Rates and API Error Rates", () => {
      template.hasResourceProperties("AWS::CloudTrail::Trail", {
        InsightSelectors: [{ InsightType: "ApiCallRateInsight" }, { InsightType: "ApiErrorRateInsight" }],
      });
    });
  });
}
