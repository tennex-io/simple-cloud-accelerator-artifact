import { ConfigProps } from "@common/config";
import { Template } from "aws-cdk-lib/assertions";

export function baseTests(template: Template, stackProps: ConfigProps) {
  test("Creates Config Service Role", () => {
    template.hasResourceProperties("AWS::IAM::ServiceLinkedRole", {
      AWSServiceName: "config.amazonaws.com",
    });
  });

  test("Delivery channel delivers every hour", () => {
    template.hasResourceProperties("AWS::Config::DeliveryChannel", {
      ConfigSnapshotDeliveryProperties: {
        DeliveryFrequency: "One_Hour",
      },
    });
  });

  test("Delivery channel logs to S3", () => {
    template.hasResourceProperties("AWS::Config::DeliveryChannel", {
      S3BucketName: stackProps.s3Props.bucketName,
    });
  });

  test("Recorder uses the service linked role", () => {
    template.hasResourceProperties("AWS::Config::ConfigurationRecorder", {
      RoleARN: {
        "Fn::Join": [
          "",
          [
            "arn:aws:iam::",
            {
              Ref: "AWS::AccountId",
            },
            ":role/aws-service-role/config.amazonaws.com/AWSServiceRoleForConfig",
          ],
        ],
      },
    });
  });
}
