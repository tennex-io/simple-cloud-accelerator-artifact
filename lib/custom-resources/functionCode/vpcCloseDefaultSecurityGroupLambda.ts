import {
  DescribeSecurityGroupRulesCommand,
  DescribeSecurityGroupsCommand,
  EC2Client,
  RevokeSecurityGroupEgressCommand,
  RevokeSecurityGroupIngressCommand,
} from "@aws-sdk/client-ec2";
import { CloudFormationCustomResourceEvent, Context } from "aws-lambda";

async function deleteSecurityGroupIngressRules(groupId: string, ruleIds: string[]) {
  const client = new EC2Client({});
  const command = new RevokeSecurityGroupIngressCommand({
    SecurityGroupRuleIds: ruleIds,
    GroupId: groupId,
  });
  await client.send(command);
}

async function deleteSecurityGroupEgressRules(groupId: string, ruleIds: string[]) {
  const client = new EC2Client({});
  const command = new RevokeSecurityGroupEgressCommand({
    SecurityGroupRuleIds: ruleIds,
    GroupId: groupId,
  });
  await client.send(command);
}

async function getDefaultSecurityGroup(vpcId: string) {
  const client = new EC2Client({});
  const command = new DescribeSecurityGroupsCommand({
    Filters: [
      {
        Name: "vpc-id",
        Values: [vpcId],
      },
      {
        Name: "group-name",
        Values: ["default"],
      },
    ],
  });
  const response = await client.send(command);
  // We can infer this will exist because default security groups cannot be deleted
  return response.SecurityGroups![0].GroupId!;
}

export async function handler(event: CloudFormationCustomResourceEvent, context: Context) {
  console.log("event: ", JSON.stringify(event, null, 2));

  try {
    const client = new EC2Client({});
    const vpcId = event.ResourceProperties.vpcId;
    const groupId = await getDefaultSecurityGroup(vpcId);
    const command = new DescribeSecurityGroupRulesCommand({
      Filters: [
        {
          Name: "group-id",
          Values: [groupId],
        },
      ],
    });
    const response = await client.send(command);

    const ingressRules: string[] = [];
    const egressRules: string[] = [];

    if (response.SecurityGroupRules!.length > 0) {
      response.SecurityGroupRules?.forEach((rule) => {
        if (rule.IsEgress) {
          egressRules.push(rule.SecurityGroupRuleId!);
        } else {
          ingressRules.push(rule.SecurityGroupRuleId!);
        }
      });
    }

    if (ingressRules.length > 0) {
      await deleteSecurityGroupIngressRules(groupId!, ingressRules);
      console.log(`Removed ${ingressRules.length} ingress rules from ${groupId}.`);
    }
    if (egressRules.length > 0) {
      await deleteSecurityGroupEgressRules(groupId!, egressRules);
      console.log(`Removed ${egressRules.length} egress rules from ${groupId}.`);
    }

    return "success";
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
      return error.message;
    }
    return "Unhandled error";
  }
}
