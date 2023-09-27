import { CustomResourceBase } from "@constructs/customResourceBase";
import { aws_iam as iam } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";

export interface AthenaCloudTrailCreateTablesProps {
  /**
   * Existing IAM role with permissions to create an Athena table
   */
  functionRole: iam.IRole;
  /**
   * List of Named Query IDs to execute
   *
   * @example ['358e3afc-9999-9999-9999-bf11bf282aa8']
   */
  namedQueryIds: string[];
  /**
   * Athena database where the create table execution should be executed
   */
  database: string;
  /**
   * WorkGroup in which the query is started
   */
  workGroup: string;
}

export class AthenaCloudTrailCreateTables extends CustomResourceBase {
  constructor(scope: Construct, id: string, props: AthenaCloudTrailCreateTablesProps) {
    super(scope, id, {
      functionName: "cdk-custom-resource-athena-cloudtrail-create-tables",
      functionDescription: "CDK/CFN Custom Resource to create a CloudTrail tables in Athena",
      functionFilePath: path.join(__dirname, "functionCode", "athenaCloudTrailCreateTables.ts"),
      role: props.functionRole,
      resourceProperties: {
        namedQueryIds: props.namedQueryIds,
        database: props.database,
        workGroup: props.workGroup,
      },
    });
  }
}
