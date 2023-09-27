import { CostAndUsage } from "@environments/organization/costAndUsage";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { allBucketsBlockPublicAccess, allBucketsDisableAcls, allBucketsHaveAes256encryption } from "@test/s3/general";
import { getResourceName } from "@test/utils";

const app = new App();
const cur = new CostAndUsage(app, "cur", {});
const template = Template.fromStack(cur);

describe("Cost and Usage Stack", () => {
  test("Stack has expected number of resources", () => {
    template.resourceCountIs("AWS::S3::Bucket", 1);
    template.resourceCountIs("AWS::S3::BucketPolicy", 1);
    template.resourceCountIs("AWS::CUR::ReportDefinition", 2);
  });

  test("Bucket is AES256 encrypted", allBucketsHaveAes256encryption(template));

  test("ACLs are disabled (AWS Best Practice)", allBucketsDisableAcls(template));

  test("Bucket blocks public access", allBucketsBlockPublicAccess(template));
});

describe("Report Configurations", () => {
  const curRedshiftQuicksight = template.findResources("AWS::CUR::ReportDefinition", {
    Properties: {
      AdditionalArtifacts: ["REDSHIFT", "QUICKSIGHT"],
    },
  });
  const curRedshiftQuicksightProps = Object.values(curRedshiftQuicksight)[0].Properties;

  const curAthena = template.findResources("AWS::CUR::ReportDefinition", {
    Properties: {
      AdditionalArtifacts: ["ATHENA"],
    },
  });
  const curAthenaProps = Object.values(curAthena)[0].Properties;

  test("Redshift/Quicksight report is defined", () => {
    expect(curRedshiftQuicksight).toBeDefined();
  });
  test("Athena report is defined", () => {
    expect(curAthena).toBeDefined();
  });

  test("CSV CUR to have the proper format and compression", () => {
    expect(curRedshiftQuicksightProps).toHaveProperty("Compression", "GZIP");
    expect(curRedshiftQuicksightProps).toHaveProperty("Format", "textORcsv");
  });

  test("Athena CUR to have the proper format and compression", () => {
    expect(curAthenaProps).toHaveProperty("Compression", "Parquet");
    expect(curAthenaProps).toHaveProperty("Format", "Parquet");
  });

  const bucketResourceName = getResourceName(template, "AWS::S3::Bucket");
  test("Reports should log to the S3 bucket", () => {
    expect(curRedshiftQuicksightProps).toHaveProperty("S3Bucket.Ref", bucketResourceName);
    expect(curAthenaProps).toHaveProperty("S3Bucket.Ref", bucketResourceName);
  });
});

describe("Bucket policy", () => {
  const bucketResourceName = getResourceName(template, "AWS::S3::Bucket");
  // Condition used in multiple policy statements
  const policyCondition = {
    StringEquals: {
      "aws:SourceArn": {
        "Fn::Join": [
          "",
          [
            "arn:aws:cur:",
            {
              Ref: "AWS::Region",
            },
            ":",
            {
              Ref: "AWS::AccountId",
            },
            ":definition/*",
          ],
        ],
      },
      "aws:SourceAccount": { Ref: "AWS::AccountId" },
    },
  };

  test("billingreports.amazonaws.com has bucket access", () => {
    template.hasResourceProperties(
      "AWS::S3::BucketPolicy",
      Match.objectLike({
        PolicyDocument: {
          Statement: Match.arrayWith([
            {
              Action: ["s3:GetBucketAcl", "s3:GetBucketPolicy"],
              Effect: "Allow",
              Principal: {
                Service: "billingreports.amazonaws.com",
              },
              Resource: {
                "Fn::GetAtt": [bucketResourceName, "Arn"],
              },
              Condition: policyCondition,
            },
          ]),
        },
      })
    );
  });

  test("billingreports.amazonaws.com can put objects in the bucket", () => {
    template.hasResourceProperties(
      "AWS::S3::BucketPolicy",
      Match.objectLike({
        PolicyDocument: {
          Statement: Match.arrayWith([
            {
              Action: "s3:PutObject",
              Effect: "Allow",
              Principal: {
                Service: "billingreports.amazonaws.com",
              },
              Resource: {
                "Fn::Join": [
                  "",
                  [
                    {
                      "Fn::GetAtt": [bucketResourceName, "Arn"],
                    },
                    "/*",
                  ],
                ],
              },
              Condition: policyCondition,
            },
          ]),
        },
      })
    );
  });
});
