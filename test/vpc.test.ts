import { Vpc, VpcStackProps } from "@common/vpc";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";

import { getResourceName } from "./utils";

type resourceKey = "Ref" | "Fn::GetAtt";

const app = new App();

const vpcStackProps: VpcStackProps = {
  env: {
    account: "184224883055",
    region: "us-east-1",
  },
  stackName: "vpc1",
  description: "Primary VPC",
  name: "research2",
  vpcProps: {
    cidrBlock: "10.0.0.0/16",
    natGateways: 2,
    natType: "instance",
    maxAzs: 2,
    transitGatewayProps: {
      sharedAccountSecretPartialArn: "arn:aws:secretsmanager:us-east-1:222222222222:secret:transitGateway",
      routes: {
        private: ["172.16.0.0/16"],
      },
    },
  },
};
const vpc = new Vpc(app, "vpc", vpcStackProps);

const template = Template.fromStack(vpc);

describe("Vpc Stack", () => {
  test("2 AZ with TGW and NAT Instances has expected number of resources", () => {
    template.resourceCountIs("AWS::EC2::Subnet", 8);
    template.resourceCountIs("AWS::EC2::Instance", vpcStackProps.vpcProps.natGateways!);
    template.resourceCountIs("AWS::EC2::EIP", vpcStackProps.vpcProps.natGateways!);
    template.resourceCountIs("AWS::EC2::RouteTable", 7);
    template.resourceCountIs("AWS::EC2::VPCEndpoint", 2);
  });

  const endpointRouteTables = (endpointType: "s3" | "dynamodb", region: string = "us-east-1") => {
    const resourceName = endpointType === "s3" ? "endpoints3" : "endpointdynamodb";

    const endpoints = template.findResources("AWS::EC2::VPCEndpoint", {
      Properties: {
        ServiceName: `com.amazonaws.${region}.${endpointType}`,
      },
    });

    return endpoints[resourceName].Properties.RouteTableIds.map((entry: Record<resourceKey, string | string[]>) => {
      if ("Fn::GetAtt" in entry) {
        return entry["Fn::GetAtt"][0];
      }
      return entry["Ref"];
    });
  };

  test("All route tables have S3 endpoints", () => {
    const routeTables = Object.keys(template.findResources("AWS::EC2::RouteTable"));
    expect(routeTables.sort()).toEqual(endpointRouteTables("s3").sort());
  });

  test("All route tables have DynamoDB endpoints", () => {
    const routeTables = Object.keys(template.findResources("AWS::EC2::RouteTable"));
    expect(routeTables.sort()).toEqual(endpointRouteTables("dynamodb").sort());
  });

  test("All EIPs are associated to EC2 instances", () => {
    const eipResources = template.findResources("AWS::EC2::EIP");
    const instanceIds = Object.values(eipResources).map((resource) => resource.Properties.InstanceId.Ref);
    const instanceResourceNames = Object.keys(template.findResources("AWS::EC2::Instance"));
    expect(instanceIds).toEqual(instanceResourceNames);
  });

  test("VPC FlowLogs are enabled for the VPC", () => {
    const resolvedLogGroupName = getResourceName(template, "AWS::Logs::LogGroup");
    const resolvedVpcName = getResourceName(template, "AWS::EC2::VPC");
    const resolvedRoleName = getResourceName(template, "AWS::IAM::Role", {
      Properties: {
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Action: "sts:AssumeRole",
              Effect: "Allow",
              Principal: {
                Service: "vpc-flow-logs.amazonaws.com",
              },
            },
          ],
        },
      },
    });
    [resolvedLogGroupName, resolvedVpcName, resolvedRoleName].forEach((name) => {
      expect(name).toBeDefined();
    });

    template.hasResourceProperties(
      "AWS::EC2::FlowLog",
      Match.objectEquals({
        ResourceId: {
          Ref: resolvedVpcName,
        },
        ResourceType: "VPC",
        TrafficType: "ALL",
        DeliverLogsPermissionArn: {
          "Fn::GetAtt": [resolvedRoleName, "Arn"],
        },
        LogDestinationType: "cloud-watch-logs",
        LogGroupName: {
          Ref: resolvedLogGroupName,
        },
        Tags: [
          {
            Key: "Name",
            Value: `vpc/${vpcStackProps.name}/flowLogAssociation`,
          },
        ],
      })
    );
  });

  test("VPC Flowlogs have CloudWatch log group with 7 day retention", () => {
    template.hasResourceProperties(
      "AWS::Logs::LogGroup",
      Match.objectEquals({
        LogGroupName: `/flowlogs/${vpcStackProps.name}`,
        RetentionInDays: 7,
      })
    );
  });

  test("Private subnets have a default route to a NAT instance", () => {
    const instanceResourceNames = Object.keys(template.findResources("AWS::EC2::Instance"));
    expect(instanceResourceNames).toBeDefined();

    // fetch all routes with an instance id key in the properties
    const routesTargetingInstanceIds = template.findResources("AWS::EC2::Route", {
      Properties: {
        DestinationCidrBlock: "0.0.0.0/0",
        InstanceId: {
          Ref: Match.anyValue(),
        },
      },
    });
    expect(routesTargetingInstanceIds).toBeDefined();
    const routeInstanceIds = Object.values(routesTargetingInstanceIds).map(
      (route: Record<string, any>) => route.Properties.InstanceId.Ref
    );

    expect(instanceResourceNames.sort()).toEqual(routeInstanceIds.sort());
  });

  test("Isolated subnet route tables have 0 additional routes", () => {
    // fetch all isolated subnets by key
    const isolatedSubnetResources = template.findResources("AWS::EC2::Subnet", {
      Properties: {
        Tags: Match.arrayWith([
          {
            Key: "aws-cdk:subnet-type",
            Value: "Isolated",
          },
        ]),
      },
    });
    const isolatedSubnetResolvedNames = Object.keys(isolatedSubnetResources);

    // get route table associations for isoloated subnets
    const routeTableAssociationResources = template.findResources("AWS::EC2::SubnetRouteTableAssociation");
    const isolatedRouteTableIds = Object.entries(routeTableAssociationResources).filter(([key, value]) => {
      // Find 'Ref' over 'Fn:GetAtt'
      if ("Ref" in value.Properties.SubnetId) {
        if (value.Properties.SubnetId["Ref"] in isolatedSubnetResolvedNames) {
          return key;
        }
      }
      return undefined;
    });

    // Route tables should not have any additional routes
    const routes = template.findResources("AWS::EC2::Route");
    const isolatedRoutes = Object.values(routes).filter((value) => {
      return isolatedRouteTableIds.includes(value.Properties.RouteTableId["Ref"]);
    });
    expect(isolatedRoutes).toHaveLength(0);
  });
});
